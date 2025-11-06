import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";
import { queueSmsNotification } from "./notifications";

const db = admin.firestore();

const toRoles = (token: admin.auth.DecodedIdToken): string[] => {
  const claimRoles = token.roles;
  if (Array.isArray(claimRoles) && claimRoles.every((role) => typeof role === "string")) {
    return claimRoles as string[];
  }
  return [];
};

type RecipientTarget = "passenger" | "driver" | "both";

export const sendBulkBookingSms = onRequest(
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
    const bookingIdsRaw: unknown[] = Array.isArray(payload?.bookingIds) ? payload.bookingIds : [];
    const bookingIds = bookingIdsRaw
      .map((id): string => (typeof id === "string" ? id.trim() : ""))
      .filter((id): id is string => id.length > 0);

    if (bookingIds.length === 0) {
      res.status(400).json({ error: "BOOKING_IDS_REQUIRED" });
      return;
    }

    const message =
      typeof payload?.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : "";
    if (!message) {
      res.status(400).json({ error: "MESSAGE_REQUIRED" });
      return;
    }

    const recipient: RecipientTarget =
      payload?.recipient === "driver" || payload?.recipient === "both"
        ? payload.recipient
        : "passenger";

    const bookingRefs = bookingIds.map((id) => db.collection("bookings").doc(id));
    const snapshots = await db.getAll(...bookingRefs);

    const actor = {
      uid: user.uid,
      role: "admin",
      name: user.email ?? user.name ?? null,
    };

    let totalRecipients = 0;
    const detail: Array<{
      bookingId: string;
      passengerPhone?: string | null;
      driverPhone?: string | null;
      sentTo: ("passenger" | "driver")[];
    }> = [];

    const batch = db.batch();
    let batchWrites = 0;

    for (const snap of snapshots) {
      if (!snap.exists) {
        detail.push({
          bookingId: snap.id,
          sentTo: [],
        });
        continue;
      }

      const data = snap.data() ?? {};
      const bookingId = snap.id;
      const passenger = data.passenger ?? {};
      const assignment = data.assignment ?? {};

      const targets: ("passenger" | "driver")[] = [];

      if ((recipient === "passenger" || recipient === "both") && passenger?.phone) {
        targets.push("passenger");
        totalRecipients += 1;
        await queueSmsNotification({
          to: passenger.phone,
          message,
        });
      }

      if ((recipient === "driver" || recipient === "both") && assignment?.driverPhone) {
        targets.push("driver");
        totalRecipients += 1;
        await queueSmsNotification({
          to: assignment.driverPhone,
          message,
        });
      }

      detail.push({
        bookingId,
        passengerPhone: passenger?.phone ?? null,
        driverPhone: assignment?.driverPhone ?? null,
        sentTo: targets,
      });

      if (targets.length === 0) {
        continue;
      }

      const timestampField = admin.firestore.FieldValue.serverTimestamp();
      batch.set(
        snap.ref,
        {
          statusHistory: admin.firestore.FieldValue.arrayUnion({
            status: "notification_sms",
            timestamp: timestampField,
            actor,
            note: `Bulk SMS · ${targets.join("+")}`,
          }),
          "system.notifications.sms.bulk": {
            message,
            sentAt: timestampField,
            actor,
            recipient: targets,
          },
        },
        { merge: true },
      );
      batchWrites += 1;
    }

    if (batchWrites > 0) {
      await batch.commit();
    }

    res.json({
      ok: true,
      totalRecipients,
      detail,
    });
  },
);
