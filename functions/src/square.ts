import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

const SQUARE_ACCESS_TOKEN = defineSecret("VALLEY_SQUARE_ACCESS_TOKEN");
const SQUARE_VERSION = "2024-08-21";

const getDefaultLocationId = () => process.env.SQUARE_LOCATION_ID || "G1W64H4NGNKRY";

export const getSquareSecrets = () => ({ token: SQUARE_ACCESS_TOKEN });

export interface PaymentLinkOptions {
  fareCents: number;
  gstCents?: number;
  tipCents?: number;
  currency?: string;
  fareLabel?: string;
  customerName?: string;
  bookingId: string;
  bookingNumber: number;
}

export const createSquarePaymentLink = async ({
  fareCents,
  gstCents = 0,
  tipCents = 0,
  currency = "CAD",
  customerName = "Airport Shuttle",
  fareLabel = "Shuttle Fare",
  bookingId,
  bookingNumber,
}: PaymentLinkOptions) => {
  const locationId = getDefaultLocationId();
  if (!locationId) throw new Error("Missing Square location ID");

  const token = SQUARE_ACCESS_TOKEN.value();
  if (!token) throw new Error("Square access token unavailable");

  const displayFareLabel = `${fareLabel} for booking #${bookingNumber.toString().padStart(5, "0")}`;

  const lineItems = [
    {
      name: displayFareLabel,
      quantity: "1",
      base_price_money: { amount: fareCents, currency },
    },
  ];

  if (gstCents > 0) {
    lineItems.push({
      name: "GST (5%)",
      quantity: "1",
      base_price_money: { amount: gstCents, currency },
    });
  }

  if (tipCents > 0) {
    lineItems.push({
      name: "Tip",
      quantity: "1",
      base_price_money: { amount: tipCents, currency },
    });
  }

  const referenceId = `booking-${bookingNumber}`;

  const response = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: locationId,
         reference_id: referenceId,
        line_items: lineItems,
      },
      checkout_options: {
        allow_tipping: false,
      },
      payment_note: `Booking #${bookingNumber.toString().padStart(5, "0")} (${bookingId})`,
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
