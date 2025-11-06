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

const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === "string") {
    return [value as unknown as T];
  }
  return [];
};

const cleanString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export const assignDriver = onRequest(
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
    if (!roles.includes("admin")) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const bookingIds = ensureArray<string>(payload?.bookingIds).filter(Boolean);
    const driverId = cleanString(payload?.driverId);
    const driverName = cleanString(payload?.driverName) ?? null;
    const driverPhone = cleanString(payload?.driverContact?.phone) ?? null;
    const driverEmail = cleanString(payload?.driverContact?.email) ?? null;

    if (bookingIds.length === 0) {
      res.status(400).json({ error: "MISSING_BOOKINGS" });
      return;
    }

    if (!driverId) {
      res.status(400).json({ error: "MISSING_DRIVER_ID" });
      return;
    }

    const maxUpdates = 25;
    if (bookingIds.length > maxUpdates) {
      res
        .status(400)
        .json({ error: `TOO_MANY_BOOKINGS`, detail: `Limit ${maxUpdates} per request` });
      return;
    }

    const actor = {
      uid: user.uid,
      role: "admin",
      name: user.email ?? user.name ?? null,
    };

    const now = admin.firestore.FieldValue.serverTimestamp();
    const statusEntryBase = {
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      actor,
    };

    const results = await Promise.all(
      bookingIds.map(async (bookingId) => {
        const ref = db.collection("bookings").doc(bookingId);
        const snap = await ref.get();
        if (!snap.exists) {
          return { id: bookingId, status: "missing" as const };
        }

        const data = snap.data() ?? {};
        const currentStatus = typeof data.status === "string" ? data.status : "pending";
        const nextStatus = currentStatus === "completed" ? currentStatus : "assigned";

        const schedule = data.schedule ?? {};
        const trip = data.trip ?? {};
        const passenger = data.passenger ?? {};
        const pickupTimestamp = schedule.pickupTimestamp;
        let pickupDate: Date | null = null;
        if (pickupTimestamp instanceof admin.firestore.Timestamp) {
          pickupDate = pickupTimestamp.toDate();
        } else if (typeof pickupTimestamp === "number") {
          pickupDate = new Date(pickupTimestamp);
        }

        await ref.update({
          assignment: {
            driverId,
            driverName,
            driverPhone,
            driverEmail,
            assignedAt: now,
          },
          status: nextStatus,
          statusHistory: admin.firestore.FieldValue.arrayUnion({
            ...statusEntryBase,
            status: nextStatus,
            note: `Driver assigned: ${driverName ?? driverId}`,
          }),
          updatedAt: now,
        });

        let driverEmailId: string | null = null;
        if (driverEmail) {
          const pickupLabel = pickupDate ? pickupDate.toUTCString() : "Pickup time pending";
          const origin = typeof trip.origin === "string" ? trip.origin : "Origin TBD";
          const destination =
            typeof trip.destination === "string" ? trip.destination : "Destination TBD";

          driverEmailId = await queueEmailNotification({
            to: driverEmail,
            subject: `New assignment · ${origin} → ${destination}`,
            text: `Hi ${driverName ?? "there"},\n\nYou have been assigned booking ${bookingId}. Pickup is scheduled for ${pickupLabel}.\n\nRoute: ${origin} → ${destination}\nPassengers: ${passenger.primaryPassenger ?? "Primary passenger TBD"}\n\nPlease confirm in the driver portal.`,
          });
        }

        if (driverPhone) {
          await queueSmsNotification({
            to: driverPhone,
            message: `Valley Airporter assignment: booking ${bookingId} now assigned to you. Please confirm in the driver portal.`,
          });
        }

        await queuePushNotification({
          userId: driverId,
          title: "New ride assigned",
          body: `Booking ${bookingId} is on your schedule.`,
          data: {
            bookingId,
            type: "assignment",
          },
        });

        let customerEmailId: string | null = null;

        if (typeof passenger.email === "string" && passenger.email.includes("@")) {
          const pickupLabel = pickupDate ? pickupDate.toLocaleString() : "Pickup time pending";
          customerEmailId = await queueEmailNotification({
            to: passenger.email,
            subject: "Your Valley Airporter driver is confirmed",
            text: `Hello ${passenger.primaryPassenger ?? "there"},\n\nYour ride (${bookingId}) now has a driver assigned: ${driverName ?? "your driver"}. Pickup is set for ${pickupLabel}.\n\nNeed to make changes? Reply to this email or visit your customer portal.`,
          });
        }

        if (typeof passenger.phone === "string") {
          await queueSmsNotification({
            to: passenger.phone,
            message: `Valley Airporter update: your driver ${driverName ?? "has"} been assigned for booking ${bookingId}.`,
          });
        }

        const sentAtField = admin.firestore.FieldValue.serverTimestamp();
        const updateData: Record<string, unknown> = {
          "system.notifications.email.driverAssignment": {
            sent: true,
            at: sentAtField,
            driverMailId: driverEmailId ?? null,
            driverTo: driverEmail ? [driverEmail] : [],
            customerMailId: customerEmailId ?? null,
            customerTo:
              typeof passenger.email === "string" && passenger.email.includes("@")
                ? [passenger.email]
                : [],
          },
          "system.notifications.push.driverAssignment": {
            sent: true,
            at: sentAtField,
            target: driverId,
          },
        };

        if (driverPhone) {
          updateData["system.notifications.sms.driverAssignment"] = {
            sent: true,
            at: sentAtField,
            to: driverPhone,
          };
        }

        await ref.set(updateData, { merge: true });
        await syncCustomerBooking(bookingId);
        return { id: bookingId, status: "updated" as const };
      }),
    );

    const updated = results.filter((item) => item.status === "updated").map((item) => item.id);
    const missing = results.filter((item) => item.status === "missing").map((item) => item.id);

    res.json({
      ok: true,
      updated,
      missing,
    });
  },
);
