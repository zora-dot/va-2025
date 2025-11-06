import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";

const db = admin.firestore();

const toRoles = (token: admin.auth.DecodedIdToken): string[] => {
  const claimRoles = token.roles;
  if (Array.isArray(claimRoles) && claimRoles.every((role) => typeof role === "string")) {
    return claimRoles as string[];
  }
  return [];
};

const parseLimit = (value: unknown) => {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) {
    return Math.min(Math.floor(num), 100);
  }
  return 20;
};

const parseScope = (value: unknown) => {
  if (value === "past" || value === "all") return value;
  return "upcoming" as const;
};

const buildFilters = (token: admin.auth.DecodedIdToken) => {
  const values: string[] = [];
  if (token.uid) {
    values.push(`uid:${token.uid}`);
  }
  if (token.email) {
    values.push(`email:${token.email.toLowerCase()}`);
  }
  return values;
};

export const listBookings = onRequest({
  cors: true,
  region: "us-central1",
  invoker: "public",
}, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const user = await requireUser(
    req as unknown as ExpressRequest,
    res as unknown as ExpressResponse,
  );
  if (!user) return;

  const roles = toRoles(user);
  const limit = parseLimit(req.query.limit);
  const scope = parseScope(req.query.scope);
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const cursorId = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

  const now = admin.firestore.Timestamp.now();

  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
    .collection("bookings")
    .orderBy("schedule.pickupTimestamp", scope === "past" ? "desc" : "asc")
    .orderBy(admin.firestore.FieldPath.documentId());

  if (scope === "upcoming") {
    query = query.where("schedule.pickupTimestamp", ">=", now);
  } else if (scope === "past") {
    query = query.where("schedule.pickupTimestamp", "<", now);
  }

  if (statusFilter) {
    query = query.where("status", "==", statusFilter);
  }

  if (roles.includes("admin")) {
    // no extra filter
  } else if (roles.includes("driver")) {
    query = query.where("assignment.driverId", "==", user.uid);
  } else {
    const filters = buildFilters(user);
    if (filters.length === 0) {
      res.status(403).json({ error: "NO_LOOKUP_KEYS" });
      return;
    }
    query = query.where("lookupKeys", "array-contains-any", filters);
  }

  if (cursorId) {
    const cursorSnap = await db.collection("bookings").doc(cursorId).get();
    if (cursorSnap.exists) {
      const cursorData = cursorSnap.data();
      const pickupTimestamp = cursorData?.schedule?.pickupTimestamp || admin.firestore.Timestamp.fromMillis(0);
      query = query.startAfter(pickupTimestamp, cursorSnap.id);
    }
  }

  const snapshot = await query.limit(limit + 1).get();
  const docs = snapshot.docs.slice(0, limit);
  const next = snapshot.docs.length > limit ? snapshot.docs[limit].id : null;

  const items = docs.map((doc) => {
    const data = doc.data();
    const schedule = data.schedule ?? {};
    const assignment = data.assignment ?? {};
    const normalizeTimestamp = (value: unknown) => {
      if (!value) return null;
      if (typeof value === "number") return value;
      if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
      }
      return null;
    };
    const statusHistory = Array.isArray(data.statusHistory)
      ? data.statusHistory.map((entry: unknown) => {
          if (!entry || typeof entry !== "object") {
            return {
              status: "unknown",
              timestamp: null,
              actor: null,
              note: null,
            };
          }
          const record = entry as Record<string, unknown>;
          return {
            status: typeof record.status === "string" ? record.status : "unknown",
            timestamp: normalizeTimestamp(record.timestamp),
            actor: record.actor ?? null,
            note: typeof record.note === "string" ? record.note : null,
          };
        })
      : undefined;

    const bookingConfirmation = data.system?.notifications?.email?.bookingConfirmation;

    const system =
      bookingConfirmation != null
        ? {
            notifications: {
              email: {
                bookingConfirmation: {
                  sent: Boolean(bookingConfirmation.sent),
                  at: normalizeTimestamp(bookingConfirmation.at),
                  mailId: bookingConfirmation.mailId ?? null,
                  subject: bookingConfirmation.subject ?? null,
                  to: Array.isArray(bookingConfirmation.to) ? bookingConfirmation.to : [],
                  cc: Array.isArray(bookingConfirmation.cc) ? bookingConfirmation.cc : [],
                },
              },
            },
          }
        : undefined;

    return {
      id: doc.id,
      status: data.status,
       bookingNumber: data.bookingNumber ?? null,
      trip: data.trip ?? {},
      schedule: {
        ...schedule,
        pickupTimestamp: normalizeTimestamp(schedule.pickupTimestamp),
        returnPickupTimestamp: normalizeTimestamp(schedule.returnPickupTimestamp),
      },
      passenger: data.passenger ?? {},
      payment: data.payment ?? {},
      assignment: {
        ...assignment,
        assignedAt: normalizeTimestamp(assignment.assignedAt),
      },
      createdAt: normalizeTimestamp(data.createdAt),
      updatedAt: normalizeTimestamp(data.updatedAt),
      paymentLink: data.payment?.link ?? null,
      statusHistory,
      system,
    };
  });

  res.json({
    items,
    nextCursor: next,
  });
});
