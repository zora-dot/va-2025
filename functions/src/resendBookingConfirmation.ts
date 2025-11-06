import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";
import { queueBookingEmail } from "./email";

const db = admin.firestore();

const toRoles = (token: admin.auth.DecodedIdToken): string[] => {
  const roles = token.roles;
  if (Array.isArray(roles) && roles.every((role) => typeof role === "string")) {
    return roles as string[];
  }
  return [];
};

const normalizeTimestamp = (value: unknown): string => {
  if (!value) return new Date().toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  return new Date().toISOString();
};

export const resendBookingConfirmation = onRequest({
  cors: true,
  region: "us-central1",
  invoker: "public",
}, async (req, res) => {
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

  const bookingId =
    typeof req.body?.bookingId === "string"
      ? req.body.bookingId
      : typeof req.query.bookingId === "string"
        ? req.query.bookingId
        : null;

  if (!bookingId) {
    res.status(400).json({ error: "MISSING_BOOKING_ID" });
    return;
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    res.status(404).json({ error: "BOOKING_NOT_FOUND" });
    return;
  }

  const data = bookingSnap.data() ?? {};
  const trip = data.trip ?? {};
  const schedule = data.schedule ?? {};
  const passenger = data.passenger ?? {};
  const payment = data.payment ?? {};

  const customerEmail = passenger.email;
  const customerName = passenger.primaryPassenger ?? "Valley Airporter Passenger";
  if (typeof customerEmail !== "string" || customerEmail.trim().length === 0) {
    res.status(400).json({ error: "NO_CUSTOMER_EMAIL" });
    return;
  }

  const bookingNumber =
    typeof data.bookingNumber === "number" ? data.bookingNumber : 0;

  const totalCents =
    typeof payment.totalCents === "number"
      ? payment.totalCents
      : typeof payment.total === "number"
        ? Math.round(payment.total * 100)
        : 0;

  const tipCents =
    typeof payment.tipAmountCents === "number"
      ? payment.tipAmountCents
      : typeof payment.tipCents === "number"
        ? payment.tipCents
        : 0;

  const createdAtIso = normalizeTimestamp(data.createdAt);

  await queueBookingEmail({
    bookingId,
    bookingNumber,
    customerName,
    customerEmail,
    pickupDate: schedule.pickupDate ?? "",
    pickupTime: schedule.pickupTime ?? "",
    origin: trip.origin ?? "",
    originAddress: trip.originAddress ?? null,
    destination: trip.destination ?? "",
    destinationAddress: trip.destinationAddress ?? null,
    passengerCount: trip.passengerCount ?? 1,
    phone: passenger.phone ?? "",
    baggage: passenger.baggage ?? "Normal",
    notes: schedule.notes ?? null,
    totalCents,
    tipCents,
    currency: payment.currency ?? "CAD",
    paymentPreference: payment.preference ?? "pay_on_arrival",
    createdAtIso,
    paymentLinkUrl:
      typeof payment.link === "string" && payment.link.trim().length > 0 ? payment.link : null,

    flightNumber: schedule.flightNumber ?? null,
    force: true,
  });

  const actor = {
    uid: user.uid,
    role: "admin",
    name:
      user.email ??
      (typeof (user as { name?: string }).name === "string" ? (user as { name?: string }).name : null),
  };
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  await bookingRef.update({
    statusHistory: admin.firestore.FieldValue.arrayUnion({
      status: "confirmation_resent",
      timestamp,
      actor,
      note: "Confirmation email resent to customer",
    }),
    updatedAt: timestamp,
    "system.notifications.email.bookingConfirmation.lastResentBy": actor,
    "system.notifications.email.bookingConfirmation.lastResentAt": timestamp,
    "system.notifications.email.bookingConfirmation.resendCount":
      admin.firestore.FieldValue.increment(1),
    "system.approvals.notificationOverride": {
      approved: true,
      approvedAt: timestamp,
      approvedBy: actor,
      scope: "booking_confirmation",
    },
  });

  res.json({ ok: true });
});
