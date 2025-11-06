import { extractPickupTimeUtc } from "./smsTemplates";
import { buildConfirmationSMS } from "./formatter";
import { sendBookingSms } from "./twilioSend";
import { parseDateTimeInTimeZone, SERVICE_TIME_ZONE } from "./utils/timezone";

const FLOW_SID = process.env.TWILIO_FLOW_SID;
const TWILIO_NUMBER = process.env.TWILIO_NUMBER;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;


export interface BookingForConfirmation {
  bookingNumber: number;
  passengerPhone?: string | null;
  passenger?: { phone?: string | null } | null;
  trip?: { origin?: string | null; destination?: string | null } | null;
  schedule?: { pickupTimestamp?: any; pickupDate?: string | null; pickupTime?: string | null } | null;
  pickupTimeUtc?: any;
}

const pickPhone = (booking: BookingForConfirmation): string | null => {
  const raw = booking.passengerPhone ?? booking.passenger?.phone ?? null;
  return typeof raw === "string" ? raw.replace(/[^+\d]/g, "") : null;
};

const formatPickup = (booking: BookingForConfirmation): string => {
  const ts = extractPickupTimeUtc(booking.pickupTimeUtc ?? booking.schedule?.pickupTimestamp ?? null);
  if (!ts) return "Time TBA";
  let ms: number | null = null;
  if (typeof ts === "number") {
    ms = ts;
  } else if (ts && typeof ts === "object") {
    const anyTs = ts as { toMillis?: () => number; seconds?: number };
    if (typeof anyTs.toMillis === "function") {
      ms = anyTs.toMillis();
    } else if (typeof anyTs.seconds === "number") {
      ms = anyTs.seconds * 1000;
    }
  }

  if (ms == null) {
    return "Time TBA";
  }

  const date = new Date(ms);
  return date.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Vancouver",
  });
};

export const sendBookingConfirmation = async (booking: BookingForConfirmation) => {
  if (!FLOW_SID || !TWILIO_NUMBER) return;
  const to = pickPhone(booking);
  if (!to) return;
  const ts = extractPickupTimeUtc(booking.pickupTimeUtc ?? booking.schedule?.pickupTimestamp ?? null);
  let pickupTimeMs: number | null = typeof ts === "number" ? ts : null;

  if (pickupTimeMs == null && typeof booking.schedule?.pickupDate === "string" && booking.schedule?.pickupTime) {
    const parsed = parseDateTimeInTimeZone(booking.schedule.pickupDate, booking.schedule.pickupTime, SERVICE_TIME_ZONE);
    pickupTimeMs = parsed ? parsed.getTime() : null;
  }

  if (pickupTimeMs == null) {
    pickupTimeMs = Date.now();
  }

  const tripData: any = booking.trip ?? {};
  const message = buildConfirmationSMS({
    bookingNumber: booking.bookingNumber,
    pickupTimeUtc: pickupTimeMs,
    fromLabel: tripData.origin ?? null,
    fromAddress: tripData.originAddress ?? null,
    toLabel: tripData.destination ?? null,
    toAddress: tripData.destinationAddress ?? null,
  });

  await sendBookingSms(to, message);
};
