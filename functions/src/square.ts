import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

const SQUARE_ACCESS_TOKEN = defineSecret("VALLEY_SQUARE_ACCESS_TOKEN");
const SQUARE_VERSION = "2025-09-24";

const getDefaultLocationId = () => process.env.SQUARE_LOCATION_ID || "G1W64H4NGNKRY";

export const getSquareSecrets = () => ({ token: SQUARE_ACCESS_TOKEN });

export interface PaymentLinkOptions {
  amountCents: number;
  currency?: string;
  customerName?: string;
  bookingId: string;
  bookingNumber: number;
}

export const createSquarePaymentLink = async ({
  amountCents,
  currency = "CAD",
  customerName = "Airport Shuttle",
  bookingId,
  bookingNumber,
}: PaymentLinkOptions) => {
  const locationId = getDefaultLocationId();
  if (!locationId) throw new Error("Missing Square location ID");

  const token = SQUARE_ACCESS_TOKEN.value();
  if (!token) throw new Error("Square access token unavailable");

  const response = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      quick_pay: {
        name: `${customerName} - Form #${bookingNumber} - ${bookingId}`,
        location_id: locationId,
        price_money: { amount: amountCents, currency },
        accept_tip: true,
      },
      payment_note: bookingId,
    }),
  });

  type PaymentLinkResponse = {
    payment_link?: {
      url?: string;
      order_id?: string;
    };
    errors?: unknown;
  };

  const json = (await response.json()) as PaymentLinkResponse;
  if (!response.ok) {
    logger.error("Square payment link error", json);
    const detail =
      Array.isArray((json as { errors?: Array<{ detail?: string }> }).errors) &&
      (json as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail
        ? ((json as { errors: Array<{ detail?: string }> }).errors[0].detail as string)
        : null;
    throw new Error(detail ?? "SQUARE_PAYMENT_LINK_FAILED");
  }

  return {
    url: json.payment_link?.url as string | undefined,
    orderId: json.payment_link?.order_id as string | undefined,
  };
};
