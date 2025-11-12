import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { queuePaymentConfirmationEmail } from "./email";

if (!admin.apps.length) {
  admin.initializeApp();
}

type FirestoreData = FirebaseFirestore.DocumentData | undefined;

const normalizeStatus = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
};

export const watchBookingPayments = onDocumentUpdated(
  {
    document: "bookings/{bookingId}",
    region: "us-central1",
    retry: false,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!afterSnap) return;

    const before = beforeSnap?.data() as FirestoreData;
    const after = afterSnap.data() as FirestoreData;
    if (!after) return;

    const previousStatus = normalizeStatus(before?.payment?.status);
    const nextStatus = normalizeStatus(after.payment?.status);
    if (nextStatus !== "COMPLETED") {
      return;
    }

    const bookingId = event.params.bookingId;
    if (!bookingId) return;

    const notificationsState = after.system?.notifications?.email?.paymentConfirmation;
    const alreadySent = notificationsState?.sent === true;
    if (previousStatus === "COMPLETED" && alreadySent) {
      return;
    }

    const passenger = (after.passenger ?? {}) as Record<string, unknown>;
    const trip = (after.trip ?? {}) as Record<string, unknown>;
    const schedule = (after.schedule ?? {}) as Record<string, unknown>;
    const payment = (after.payment ?? {}) as Record<string, unknown>;

    if (!alreadySent) {
      try {
        await queuePaymentConfirmationEmail({
          bookingId,
          bookingNumber: asNumber(after.bookingNumber),
          customerName: asString(passenger.primaryPassenger) ?? asString(passenger.name),
          customerEmail: asString(passenger.email),
          customerPhone: asString(passenger.phone),
          pickupDate: asString(schedule.pickupDate),
          pickupTime: asString(schedule.pickupTime),
          origin: asString(trip.origin),
          originAddress: asString(trip.originAddress),
          destination: asString(trip.destination),
          destinationAddress: asString(trip.destinationAddress),
          totalCents: asNumber(payment.totalCents),
          currency: asString(payment.currency) ?? "CAD",
          paymentId: asString(payment.latestPaymentId),
          paymentOrderId: asString(payment.orderId),
          completedAtIso: asString(payment.completedAt) ?? asString(payment.latestPaymentUpdatedAt),
        });
      } catch (error) {
        logger.error("watchBookingPayments.email_failed", {
          bookingId,
          bookingNumber: after.bookingNumber ?? null,
          error: error instanceof Error ? error.message : error,
        });
        return;
      }
    }

    await afterSnap.ref.set(
      {
        system: {
          payments: {
            tracker: {
              lastProcessedStatus: nextStatus,
              lastProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
        },
      },
      { merge: true },
    );
  },
);
