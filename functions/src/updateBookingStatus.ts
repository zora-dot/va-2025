import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";
import {
  queueEmailNotification,
  queuePushNotification,
  queueSmsNotification,
} from "./notifications";
import { syncCustomerBooking } from "./utils/customerBookings";

const db = admin.firestore();

const toRoles = (token: admin.auth.DecodedIdToken): string[] => {
  const claimRoles = token.roles;
  if (Array.isArray(claimRoles) && claimRoles.every((role) => typeof role === "string")) {
    return claimRoles as string[];
  }
  return [];
};

const ALLOWED_STATUSES = new Set([
  "pending",
  "awaiting_payment",
  "confirmed",
  "assigned",
  "en_route",
  "arrived",
  "on_trip",
  "completed",
  "cancelled",
]);

const DRIVER_ALLOWED_STATUSES = new Set(["en_route", "arrived", "on_trip", "completed"]);

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["awaiting_payment", "confirmed", "cancelled"],
  awaiting_payment: ["confirmed", "cancelled"],
  confirmed: ["assigned", "cancelled"],
  assigned: ["en_route", "confirmed", "cancelled"],
  en_route: ["arrived", "assigned", "cancelled"],
  arrived: ["on_trip", "en_route", "cancelled"],
  on_trip: ["completed", "arrived", "cancelled"],
  completed: [],
  cancelled: [],
};

const REASON_REQUIRED_STATUSES = new Set(["cancelled"]);

const TRANSITION_REASON_REQUIRED = new Set([
  "assigned:confirmed",
  "en_route:assigned",
  "arrived:en_route",
  "on_trip:arrived",
]);

const VALID_REASON_CODES = new Set([
  "customer_request",
  "driver_delay",
  "vehicle_issue",
  "weather",
  "comms_failure",
  "operational_override",
  "safety",
  "other",
]);

export const updateBookingStatus = onRequest(
  {
    cors: true,
    region: "us-central1",
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const user = await requireUser(
      req as unknown as ExpressRequest,
      res as unknown as ExpressResponse,
    );
    if (!user) return;

    const roles = toRoles(user);
    const isAdmin = roles.includes("admin");
    const isDriver = roles.includes("driver");
    const isCustomer = !isAdmin && !isDriver;

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const bookingId = typeof payload?.bookingId === "string" ? payload.bookingId.trim() : "";
    const status = typeof payload?.status === "string" ? payload.status.trim() : "";
    let reasonCode =
      typeof payload?.reasonCode === "string" ? payload.reasonCode.trim() : "";
    const reasonNote =
      typeof payload?.reasonNote === "string" && payload.reasonNote.trim().length > 0
        ? payload.reasonNote.trim()
        : undefined;
    const note =
      typeof payload?.note === "string" && payload.note.trim().length > 0
        ? payload.note.trim()
        : undefined;

    if (!bookingId) {
      res.status(400).json({ error: "MISSING_BOOKING_ID" });
      return;
    }
    if (!status) {
      res.status(400).json({ error: "MISSING_STATUS" });
      return;
    }
    if (!ALLOWED_STATUSES.has(status)) {
      res.status(400).json({ error: "INVALID_STATUS" });
      return;
    }

    if (isCustomer && status !== "cancelled") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    if (isCustomer) {
      reasonCode = "customer_request";
    }

    if (isDriver && !DRIVER_ALLOWED_STATUSES.has(status)) {
      res.status(403).json({ error: "STATUS_NOT_ALLOWED_FOR_DRIVER" });
      return;
    }

    const ref = db.collection("bookings").doc(bookingId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: "BOOKING_NOT_FOUND" });
      return;
    }

    const data = snap.data() ?? {};
    const bookingOwnerUid =
      typeof (data.user as { uid?: unknown })?.uid === "string"
        ? ((data.user as { uid: string }).uid as string)
        : null;

    if (isCustomer && bookingOwnerUid && bookingOwnerUid !== user.uid) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    const currentStatus = typeof data.status === "string" ? data.status : "pending";

    if (currentStatus === status) {
      res.json({ ok: true, status });
      return;
    }

    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowedTransitions.includes(status)) {
      res.status(400).json({
        error: "INVALID_STATUS_TRANSITION",
        currentStatus,
        attemptedStatus: status,
        allowedTransitions,
      });
      return;
    }

    const transitionKey = `${currentStatus}:${status}`;

    if (REASON_REQUIRED_STATUSES.has(status) && !VALID_REASON_CODES.has(reasonCode)) {
      res.status(400).json({
        error: "REASON_CODE_REQUIRED",
        validCodes: Array.from(VALID_REASON_CODES),
      });
      return;
    }

    if (TRANSITION_REASON_REQUIRED.has(transitionKey) && !VALID_REASON_CODES.has(reasonCode)) {
      res.status(400).json({
        error: "REASON_CODE_REQUIRED",
        validCodes: Array.from(VALID_REASON_CODES),
      });
      return;
    }

    if (reasonCode && !VALID_REASON_CODES.has(reasonCode)) {
      res.status(400).json({
        error: "INVALID_REASON_CODE",
        validCodes: Array.from(VALID_REASON_CODES),
      });
      return;
    }
    const assignment = data.assignment ?? {};
    if (isDriver && assignment?.driverId !== user.uid) {
      res.status(403).json({ error: "DRIVER_NOT_ASSIGNED" });
      return;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const actor = {
      uid: user.uid,
      role: isAdmin ? "admin" : isDriver ? "driver" : "customer",
      name: user.email ?? user.name ?? null,
    };

    const schedule = data.schedule ?? {};
    const trip = data.trip ?? {};
    const passenger = data.passenger ?? {};
    const bookingAssignment = data.assignment ?? {};
    const pickupTimestamp = schedule.pickupTimestamp;
    let pickupDate: Date | null = null;
    if (pickupTimestamp instanceof admin.firestore.Timestamp) {
      pickupDate = pickupTimestamp.toDate();
    } else if (typeof pickupTimestamp === "number") {
      pickupDate = new Date(pickupTimestamp);
    }

    await ref.update({
      status,
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor,
        note: note ?? null,
        reasonCode: reasonCode || null,
        reasonNote: reasonNote ?? null,
      }),
      updatedAt: now,
      "system.statusGuardrail": {
        currentStatus: status,
        previousStatus: currentStatus,
        reasonCode: reasonCode || null,
        reasonNote: reasonNote ?? null,
        updatedAt: now,
        actor,
      },
    });

    await syncCustomerBooking(bookingId);

    const pickupLabel = pickupDate ? pickupDate.toLocaleString() : "Pickup time pending";
    const routeLabel = `${typeof trip.origin === "string" ? trip.origin : "Origin"} → ${typeof trip.destination === "string" ? trip.destination : "Destination"}`;

    let statusEmailId: string | null = null;

    if (typeof passenger.email === "string" && passenger.email.includes("@")) {
      statusEmailId = await queueEmailNotification({
        to: passenger.email,
        subject: `Ride update · ${status.replace(/_/g, " ")}`,
        text: `Hello ${passenger.primaryPassenger ?? "there"},\n\nYour booking ${bookingId} is now marked as ${status.replace(/_/g, " ")}.\nPickup: ${pickupLabel}\nRoute: ${routeLabel}${
          reasonCode ? `\nReason: ${reasonCode.replace(/_/g, " ")}${reasonNote ? ` · ${reasonNote}` : ""}` : ""
        }\n\nIf this looks incorrect, please reach out to dispatch.`,
      });
    }

    if (typeof passenger.phone === "string") {
      await queueSmsNotification({
        to: passenger.phone,
        message: `Valley Airporter ride update: booking ${bookingId} is now ${status.replace(
          /_/g,
          " ",
        )}.${reasonCode ? ` Reason: ${reasonCode.replace(/_/g, " ")}` : ""}`,
      });
    }

    if (typeof bookingAssignment.driverId === "string" && bookingAssignment.driverId) {
      await queuePushNotification({
        userId: bookingAssignment.driverId,
        title: "Booking status updated",
        body: `Booking ${bookingId} is now ${status.replace(/_/g, " ")}.`,
        data: {
          bookingId,
          status,
        },
      });
    }

    const sentAtField = admin.firestore.FieldValue.serverTimestamp();

    const notificationUpdate: Record<string, unknown> = {
      "system.notifications.statusChange": {
        status,
        at: sentAtField,
        actor,
        reasonCode: reasonCode || null,
        reasonNote: reasonNote ?? null,
        previousStatus: currentStatus,
      },
    };

    if (statusEmailId != null || (typeof passenger.email === "string" && passenger.email.includes("@"))) {
      notificationUpdate["system.notifications.email.statusChange"] = {
        sent: Boolean(statusEmailId || passenger.email),
        at: sentAtField,
        mailId: statusEmailId ?? null,
        to:
          typeof passenger.email === "string" && passenger.email.includes("@")
            ? [passenger.email]
            : [],
      };
    }

    if (typeof passenger.phone === "string") {
      notificationUpdate["system.notifications.sms.statusChange"] = {
        sent: true,
        at: sentAtField,
        to: passenger.phone,
      };
    }

    if (typeof bookingAssignment.driverId === "string" && bookingAssignment.driverId) {
      notificationUpdate["system.notifications.push.statusChange"] = {
        sent: true,
        at: sentAtField,
        target: bookingAssignment.driverId,
      };
    }

    await ref.set(notificationUpdate, { merge: true });

    res.json({ ok: true });
  },
);
