import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { buildReminderMessage, SmsBookingContext, extractPickupTimeUtc } from "./smsTemplates";
import { sendStudioMessage } from "./utils/studio";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const BATCH_LIMIT = Number(process.env.SMS_REMINDER_BATCH_LIMIT ?? 200);

interface ReminderConfig {
  atField: "remind24At" | "remind10At";
  sentField: "remind24Sent" | "remind10Sent";
  timing: "24h" | "10h";
}

const REMINDER_CONFIGS: ReminderConfig[] = [
  { atField: "remind24At", sentField: "remind24Sent", timing: "24h" },
  { atField: "remind10At", sentField: "remind10Sent", timing: "10h" },
];

const buildContext = (doc: FirebaseFirestore.DocumentSnapshot): SmsBookingContext & { passengerPhone?: string | null } => {
  const data = doc.data() ?? {};
  const pickupTimeUtc = extractPickupTimeUtc(data.pickupTimeUtc ?? data.schedule?.pickupTimestamp ?? null);
  return {
    bookingId: doc.id,
    bookingNumber: data.bookingNumber ?? null,
    pickupTimeUtc,
    schedule: {
      pickupDate: data.schedule?.pickupDate ?? null,
      pickupTime: data.schedule?.pickupTime ?? null,
    },
    trip: {
      origin: data.trip?.origin ?? null,
      originAddress: data.trip?.originAddress ?? null,
      destination: data.trip?.destination ?? null,
      destinationAddress: data.trip?.destinationAddress ?? null,
    },
    passengerName: data.passenger?.primaryPassenger ?? null,
    passengerPhone: data.passengerPhone ?? data.passenger?.phone ?? null,
    passengerCount: data.trip?.passengerCount ?? null,
    totalCents: data.payment?.totalCents ?? null,
    currency: data.payment?.currency ?? "CAD",
  };
};

export const sendDueSmsReminders = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: process.env.SERVICE_TIME_ZONE ?? "America/Vancouver",
  },
  async () => {
    const now = Date.now();

    for (const config of REMINDER_CONFIGS) {
      const query = db
        .collection("bookings")
        .where("status", "==", "confirmed")
        .where(config.sentField, "==", false)
        .where(config.atField, "<=", now)
        .limit(BATCH_LIMIT);

      const snapshot = await query.get();
      if (snapshot.empty) continue;

      const operations: Promise<unknown>[] = [];

      snapshot.forEach((doc) => {
        operations.push(
          (async () => {
            const result = await db.runTransaction(async (tx) => {
              const fresh = await tx.get(doc.ref);
              if (!fresh.exists) return null;
              const data = fresh.data() ?? {};
              if (data.status !== "confirmed") return null;
              if (data[config.sentField]) return null;
              if (!data.passengerPhone) return null;

              const context = buildContext(fresh);
              const message = buildReminderMessage(context, config.timing);

              tx.update(fresh.ref, {
                [config.sentField]: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              return {
                to: context.passengerPhone,
                message,
                bookingId: context.bookingId,
              };
            });

            if (result?.to && result.message) {
              await sendStudioMessage(result.to, result.message);
              await db.collection("sms_outbound").add({
                to: result.to,
                body: result.message,
                metadata: {
                  bookingId: result.bookingId,
                  timing: config.timing,
                  via: "studio-flow",
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          })(),
        );
      });

      await Promise.all(operations);
    }
  },
);
