import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const toRoles = (token: admin.auth.DecodedIdToken): string[] => {
  const claimRoles = token.roles;
  if (Array.isArray(claimRoles) && claimRoles.every((role) => typeof role === "string")) {
    return claimRoles as string[];
  }
  if (typeof token.role === "string") {
    return [token.role];
  }
  return [];
};

const pickString = (value: unknown, fallback: string | null = null) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

export const createTestBooking = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  const user = await requireUser(req as ExpressRequest, res as ExpressResponse);
  if (!user) return;

  const roles = new Set(toRoles(user).map((role) => role.toLowerCase()));
  if (!roles.has("admin")) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  const payload = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const defaultPickupDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pickupDate = pickString(payload.pickupDate, defaultPickupDate);
  const pickupTime = pickString(payload.pickupTime, "10:30 AM");

  const passengerName = pickString(payload.passengerName, "Square Test Passenger");
  const passengerEmail = pickString(payload.passengerEmail, "square.test@valleyairporter.ca");
  const passengerPhone = pickString(payload.passengerPhone, "+16045550000");

  const bookingDoc = {
    source: "square-test",
    status: "confirmed",
    createdAt: now,
    updatedAt: now,
    metadata: {
      squareEmailTest: true,
      createdBy: user.uid,
    },
    trip: {
      direction: "test",
      origin: "OT",
      originAddress: "Test Origin Terminal",
      destination: "OT",
      destinationAddress: "Test Destination Terminal",
      passengerCount: 1,
    },
    schedule: {
      pickupDate,
      pickupTime,
      notes: "Test booking for Square confirmation email flow.",
    },
    passenger: {
      primaryPassenger: passengerName,
      email: passengerEmail,
      phone: passengerPhone,
    },
    payment: {
      preference: "pay_now",
      totalCents: 100,
      currency: "CAD",
      status: "pending",
      testBooking: true,
    },
  };

  const countersRef = db.collection("counters").doc("bookings");
  const bookingsCollection = db.collection("bookings");

  const result = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(countersRef);
    const currentValue = counterSnap.exists ? Number(counterSnap.data()?.current ?? 29999) : 29999;
    const nextValue = currentValue + 1;
    const newBookingRef = bookingsCollection.doc();

    tx.set(countersRef, { current: nextValue }, { merge: true });
    tx.set(newBookingRef, {
      ...bookingDoc,
      bookingNumber: nextValue,
    });

    return { bookingId: newBookingRef.id, bookingNumber: nextValue };
  });

  res.json({ ok: true, ...result, pickupDate, pickupTime });
});
