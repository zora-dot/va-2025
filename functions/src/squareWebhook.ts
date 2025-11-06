import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import crypto from "crypto";
import { sendPurchaseEventToGa, getAnalyticsSecrets } from "./ga";
import { queuePaymentConfirmationEmail } from "./email";

const SQUARE_SIGNATURE_KEY = defineSecret("SQUARE_WEBHOOK_SIGNATURE_KEY");

const db = admin.firestore();

type SquarePayment = {
  id: string;
  status: string;
  order_id?: string | null;
  amount_money?: { amount?: number | null; currency?: string | null } | null;
  total_money?: { amount?: number | null; currency?: string | null } | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

interface SquareWebhookBody {
  type?: string;
  data?: {
    id?: string;
    object?: {
      payment?: SquarePayment;
    };
  };
}

const verifySignature = (signature: string | undefined, body: Buffer) => {
  const secret = SQUARE_SIGNATURE_KEY.value();
  if (!secret || !signature) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const digest = hmac.digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
};

const extractPayment = (payload: SquareWebhookBody): SquarePayment | null => {
  return payload?.data?.object?.payment ?? null;
};

export const handleSquareWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [SQUARE_SIGNATURE_KEY, ...Object.values(getAnalyticsSecrets())],
    maxInstances: 5,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const signature = req.get("x-square-hmacsha256-signature") ?? req.get("X-Square-Hmacsha256-Signature");
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    if (!verifySignature(signature, rawBody)) {
      logger.warn("Square webhook signature invalid");
      res.status(401).send("Invalid signature");
      return;
    }

    const payload: SquareWebhookBody =
      typeof req.body === "object" && req.body !== null ? (req.body as SquareWebhookBody) : JSON.parse(rawBody.toString());

    const payment = extractPayment(payload);
    if (!payment) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const eventType = payload.type ?? "unknown";
    logger.info("Square webhook received", { eventType, paymentId: payment.id, status: payment.status });

    if (!payment.order_id) {
      res.json({ ok: true, reason: "missing_order_id" });
      return;
    }

    const status = (payment.status ?? "").toUpperCase();
    const amountCents =
      payment.total_money?.amount ?? payment.amount_money?.amount ?? null;
    const currency = payment.total_money?.currency ?? payment.amount_money?.currency ?? "CAD";

    const bookingSnap = await db
      .collection("bookings")
      .where("payment.orderId", "==", payment.order_id)
      .limit(1)
      .get();

    if (bookingSnap.empty) {
      logger.warn("No booking matched Square payment order id", { orderId: payment.order_id });
      res.json({ ok: true, reason: "booking_not_found" });
      return;
    }

    const bookingDoc = bookingSnap.docs[0];
    const bookingId = bookingDoc.id;
    const bookingData = bookingDoc.data() ?? {};
    const analyticsState =
      bookingData.system?.analytics?.purchaseReported ?? {};
    const alreadyReported = analyticsState.sent === true;

    const updates: Record<string, unknown> = {
      payment: {
        ...(bookingData.payment ?? {}),
        status,
        latestPaymentId: payment.id,
        latestPaymentUpdatedAt: payment.updated_at ?? admin.firestore.FieldValue.serverTimestamp(),
        completedAt:
          status === "COMPLETED"
            ? payment.updated_at ?? payment.created_at ?? admin.firestore.FieldValue.serverTimestamp()
            : bookingData.payment?.completedAt ?? null,
      },
      "system.payments.square": {
        ...(bookingData.system?.payments?.square ?? {}),
        lastEvent: eventType,
        lastStatus: status,
        lastPaymentId: payment.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    };

    if (status === "COMPLETED" && amountCents != null && !alreadyReported) {
      await sendPurchaseEventToGa({
        transactionId: payment.id,
        value: amountCents / 100,
        currency,
        clientId: bookingId,
      });

      (updates as Record<string, unknown>)["system.analytics.purchaseReported"] = {
        sent: true,
        at: admin.firestore.FieldValue.serverTimestamp(),
        transactionId: payment.id,
        amount: amountCents / 100,
        currency,
      };
    }

    await bookingDoc.ref.set(updates, { merge: true });

    if (status === "COMPLETED") {
      try {
        await queuePaymentConfirmationEmail({
          bookingId,
          bookingNumber:
            typeof bookingData.bookingNumber === "number" ? bookingData.bookingNumber : null,
          customerName:
            typeof bookingData.passenger?.primaryPassenger === "string"
              ? bookingData.passenger.primaryPassenger
              : (bookingData.passenger?.name as string | undefined) ?? null,
          customerEmail:
            typeof bookingData.passenger?.email === "string"
              ? bookingData.passenger.email
              : null,
          customerPhone:
            typeof bookingData.passenger?.phone === "string"
              ? bookingData.passenger.phone
              : null,
          pickupDate:
            typeof bookingData.schedule?.pickupDate === "string"
              ? bookingData.schedule.pickupDate
              : null,
          pickupTime:
            typeof bookingData.schedule?.pickupTime === "string"
              ? bookingData.schedule.pickupTime
              : null,
          origin:
            typeof bookingData.trip?.origin === "string" ? bookingData.trip.origin : null,
          originAddress:
            typeof bookingData.trip?.originAddress === "string"
              ? bookingData.trip.originAddress
              : null,
          destination:
            typeof bookingData.trip?.destination === "string"
              ? bookingData.trip.destination
              : null,
          destinationAddress:
            typeof bookingData.trip?.destinationAddress === "string"
              ? bookingData.trip.destinationAddress
              : null,
          totalCents:
            typeof bookingData.payment?.totalCents === "number"
              ? bookingData.payment.totalCents
              : amountCents ?? null,
          currency:
            (bookingData.payment?.currency as string | undefined) ??
            currency ??
            "CAD",
          paymentId: payment.id ?? null,
          paymentOrderId: payment.order_id ?? null,
          completedAtIso: payment.updated_at ?? payment.created_at ?? null,
        });
      } catch (error) {
        logger.error("Failed to queue payment confirmation email", {
          bookingId,
          paymentId: payment.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    res.json({ ok: true });
  },
);
