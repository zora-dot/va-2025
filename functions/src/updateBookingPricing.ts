import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";
import { syncCustomerBooking } from "./utils/customerBookings";

const db = admin.firestore();

const toRoles = (token: admin.auth.DecodedIdToken): string[] => {
  const roles = token.roles;
  if (Array.isArray(roles) && roles.every((role) => typeof role === "string")) {
    return roles as string[];
  }
  return [];
};

const parseAmount = (value: unknown, fallback = 0) => {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) {
    return Math.round(number);
  }
  return fallback;
};

const VALID_PRICING_REASON_CODES = new Set([
  "fare_match",
  "loyalty_credit",
  "service_recovery",
  "vehicle_change",
  "manual_override",
  "staff_error",
  "other",
]);

export const updateBookingPricing = onRequest({
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

  const bookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId : null;
  if (!bookingId) {
    res.status(400).json({ error: "MISSING_BOOKING_ID" });
    return;
  }

  const baseCents = parseAmount(req.body?.baseCents);
  const gstCents = parseAmount(req.body?.gstCents);
  const tipCents = parseAmount(req.body?.tipCents);
  const totalCents = parseAmount(req.body?.totalCents);

  const reasonCode =
    typeof req.body?.reasonCode === "string" ? req.body.reasonCode.trim() : "";
  if (!VALID_PRICING_REASON_CODES.has(reasonCode)) {
    res.status(400).json({
      error: "INVALID_REASON_CODE",
      validCodes: Array.from(VALID_PRICING_REASON_CODES),
    });
    return;
  }

  const reasonNote =
    typeof req.body?.reasonNote === "string" && req.body.reasonNote.trim().length > 0
      ? req.body.reasonNote.trim()
      : "";
  const additionalNote =
    typeof req.body?.note === "string" && req.body.note.trim().length > 0
      ? req.body.note.trim()
      : "";
  const requireSecondApproval = Boolean(req.body?.requireSecondApproval);

  const rawSecondApprover = req.body?.secondApprover;
  const secondApprover =
    rawSecondApprover &&
    typeof rawSecondApprover === "object" &&
    typeof rawSecondApprover.uid === "string"
      ? {
          uid: rawSecondApprover.uid.trim(),
          name:
            typeof rawSecondApprover.name === "string"
              ? rawSecondApprover.name.trim()
              : null,
        }
      : null;

  if (requireSecondApproval && (!secondApprover || secondApprover.uid === user.uid)) {
    res.status(400).json({
      error: "SECOND_APPROVER_REQUIRED",
    });
    return;
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    res.status(404).json({ error: "BOOKING_NOT_FOUND" });
    return;
  }

  const data = bookingSnap.data() ?? {};
  const payment = data.payment ?? {};
  const now = admin.firestore.FieldValue.serverTimestamp();

  const actor = {
    uid: user.uid,
    role: "admin",
    name: user.email ?? user.name ?? null,
  };

  const currency = payment.currency ?? "CAD";
  const reasonLabel = reasonCode.replace(/_/g, " ");
  const centsToCurrency = (value: number) =>
    `${currency} ${(value / 100).toFixed(2)}`;
  const historyNoteParts = [
    `Reason: ${reasonLabel}`,
    reasonNote ? `Context: ${reasonNote}` : "",
    additionalNote,
    `Totals → base ${centsToCurrency(baseCents)}, GST ${centsToCurrency(
      gstCents,
    )}, tip ${centsToCurrency(tipCents)}, total ${centsToCurrency(totalCents)}`,
  ].filter((part) => part && part.length > 0);
  const historyNote = historyNoteParts.join(" · ");

  const approvalRecord = requireSecondApproval
    ? {
        required: true,
        status: secondApprover ? "approved" : "pending",
        approved: Boolean(secondApprover),
        requestedAt: now,
        requestedBy: actor,
        approvedAt: secondApprover ? now : null,
        approver: secondApprover
          ? {
              uid: secondApprover.uid,
              name: secondApprover.name,
            }
          : null,
        reasonCode,
        reasonNote: reasonNote || null,
        additionalNote: additionalNote || null,
      }
    : {
        required: false,
        status: "approved",
        approved: true,
        requestedAt: now,
        requestedBy: actor,
        approvedAt: now,
        approver: actor,
        reasonCode,
        reasonNote: reasonNote || null,
        additionalNote: additionalNote || null,
      };

  await bookingRef.update({
    payment: {
      ...payment,
      baseCents,
      gstCents,
      tipCents,
      totalCents,
      currency,
      adjustedManually: true,
      adjustmentNote: additionalNote || reasonNote || `Reason: ${reasonLabel}`,
      adjustedBy: user.uid,
      adjustedByName: user.email ?? user.name ?? null,
      adjustedAt: now,
      adjustmentReason: {
        code: reasonCode,
        label: reasonLabel,
        note: reasonNote || null,
        additionalNote: additionalNote || null,
        submittedAt: now,
        submittedBy: actor,
        secondApprovalRequired: requireSecondApproval,
        secondApprover: secondApprover
          ? {
              uid: secondApprover.uid,
              name: secondApprover.name,
            }
          : null,
      },
    },
    updatedAt: now,
    statusHistory: admin.firestore.FieldValue.arrayUnion({
      status: "pricing_adjusted",
      timestamp: now,
      actor,
      note: historyNote,
      reasonCode,
      reasonNote: reasonNote || null,
    }),
    "system.approvals.pricingAdjustment": approvalRecord,
    "system.guardrails.pricing": {
      reasonCode,
      reasonNote: reasonNote || null,
      additionalNote: additionalNote || null,
      currency,
      amounts: {
        baseCents,
        gstCents,
        tipCents,
        totalCents,
      },
      submittedAt: now,
      submittedBy: actor,
      secondApproval: approvalRecord,
    },
  });

  await syncCustomerBooking(bookingId);

  res.json({ ok: true, approval: approvalRecord });
});
