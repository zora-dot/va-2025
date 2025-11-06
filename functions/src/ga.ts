import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

const GA4_MEASUREMENT_ID = defineSecret("GA4_MEASUREMENT_ID");
const GA4_API_SECRET = defineSecret("GA4_API_SECRET");

interface PurchaseEventPayload {
  transactionId: string;
  value: number;
  currency?: string;
  clientId?: string | null;
}

export const getAnalyticsSecrets = () => ({
  measurementId: GA4_MEASUREMENT_ID,
  apiSecret: GA4_API_SECRET,
});

export const sendPurchaseEventToGa = async ({
  transactionId,
  value,
  currency = "CAD",
  clientId,
}: PurchaseEventPayload) => {
  const measurementId = GA4_MEASUREMENT_ID.value();
  const apiSecret = GA4_API_SECRET.value();

  if (!measurementId || !apiSecret) {
    logger.warn("GA4 measurement parameters missing; skipping purchase event", {
      hasMeasurementId: Boolean(measurementId),
      hasApiSecret: Boolean(apiSecret),
    });
    return;
  }

  const safeValue = Number.isFinite(value) ? Number(value) : 0;
  if (!transactionId || !safeValue) {
    logger.warn("Invalid GA4 purchase payload; skipping event", {
      transactionId,
      value,
    });
    return;
  }

  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    measurementId,
  )}&api_secret=${encodeURIComponent(apiSecret)}`;

  const payload = {
    client_id: clientId || transactionId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: transactionId,
          value: safeValue,
          currency,
        },
      },
    ],
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error("Failed to send GA4 purchase event", {
        status: response.status,
        body: text,
      });
    }
  } catch (error) {
    logger.error("GA4 purchase event request failed", error);
  }
};

