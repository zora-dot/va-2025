import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { queueEmailNotification, queueSmsNotification } from "./notifications";
import { SERVICE_TIME_ZONE } from "./utils/timezone";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const functionsConfig = (() => {
  try {
    return functions.config();
  } catch {
    return {};
  }
})();

const TZ = SERVICE_TIME_ZONE ?? "America/Vancouver";
const DEFAULT_SCHEDULE = process.env.DAILY_SUMMARY_CRON ?? "20 5 * * *"; // 05:20 local to allow overnight bookings to settle
const OVERLAP_WINDOW_MINUTES = Number.parseInt(process.env.DAILY_SUMMARY_OVERLAP_MINUTES ?? "45", 10);
const OVERLAP_WINDOW_MS = Number.isFinite(OVERLAP_WINDOW_MINUTES) ? OVERLAP_WINDOW_MINUTES * 60 * 1000 : 45 * 60 * 1000;

const asTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const DRIVER_NAME =
  asTrimmedString(process.env.DAILY_DRIVER_NAME) ??
  asTrimmedString(functionsConfig?.driver?.summary_name) ??
  "Driver";
const DRIVER_EMAIL =
  asTrimmedString(process.env.DAILY_DRIVER_EMAIL) ?? asTrimmedString(functionsConfig?.driver?.summary_email);
const DRIVER_PHONE =
  asTrimmedString(process.env.DAILY_DRIVER_PHONE) ?? asTrimmedString(functionsConfig?.driver?.summary_phone);

const ADMIN_EMAIL =
  asTrimmedString(process.env.DAILY_ADMIN_EMAIL) ??
  asTrimmedString(process.env.ADMIN_NOTIFICATION_EMAIL) ??
  asTrimmedString(functionsConfig?.admin?.summary_email) ??
  asTrimmedString(functionsConfig?.admin?.notification_email);
const ADMIN_PHONE =
  asTrimmedString(process.env.DAILY_ADMIN_PHONE) ??
  asTrimmedString(process.env.ADMIN_NOTIFICATION_PHONE) ??
  asTrimmedString(functionsConfig?.admin?.summary_phone) ??
  asTrimmedString(functionsConfig?.admin?.notification_phone);

type RawBooking = FirebaseFirestore.DocumentData & {
  pickupTimeUtc?: number | null;
  schedule?: {
    pickupTimestamp?: admin.firestore.Timestamp | null;
    pickupDate?: string | null;
    pickupTime?: string | null;
    notes?: string | null;
    flightNumber?: string | null;
  };
  trip?: {
    origin?: string | null;
    destination?: string | null;
    passengerCount?: number | null;
  };
  passenger?: {
    primaryPassenger?: string | null;
    phone?: string | null;
    specialNotes?: string | null;
  };
  passengerPhone?: string | null;
  passengerName?: string | null;
  payment?: {
    totalCents?: number | null;
    currency?: string | null;
  };
  createdAt?: admin.firestore.Timestamp | null;
  bookingNumber?: number | null;
};

type BookingSummary = {
  id: string;
  bookingNumber?: number | null;
  pickupTimeUtc?: number | null;
  pickupDateDisplay: string;
  pickupIso?: string | null;
  origin: string;
  destination: string;
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  totalAmount: string;
  flightNumber: string;
  specialNotes: string;
  createdAtDisplay: string;
};

const formatCurrency = (cents?: number | null, currency = "CAD") => {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  const dollars = cents / 100;
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(dollars);
  } catch {
    return `$${dollars.toFixed(2)}`;
  }
};

const formatDisplayDate = (date: Date) => formatInTimeZone(date, TZ, "EEE, MMM d, yyyy • h:mm a");

const resolvePickupDate = (booking: RawBooking) => {
  if (typeof booking.pickupTimeUtc === "number" && Number.isFinite(booking.pickupTimeUtc)) {
    return new Date(booking.pickupTimeUtc);
  }
  const scheduleTs = booking.schedule?.pickupTimestamp;
  if (scheduleTs instanceof admin.firestore.Timestamp) {
    return scheduleTs.toDate();
  }
  return null;
};

const buildBookingSummary = (doc: FirebaseFirestore.QueryDocumentSnapshot): BookingSummary => {
  const data = doc.data() as RawBooking;
  const pickupDate = resolvePickupDate(data);
  const pickupDisplay =
    pickupDate ?
      formatDisplayDate(pickupDate) :
      `${data.schedule?.pickupDate ?? "—"} ${data.schedule?.pickupTime ?? ""}`.trim();
  const createdAtDate = data.createdAt instanceof admin.firestore.Timestamp ? data.createdAt.toDate() : null;
  const passengerName =
    data.passenger?.primaryPassenger ??
    data.passengerName ??
    data.passenger?.phone ??
    data.passengerPhone ??
    "—";
  const passengerPhone = data.passengerPhone ?? data.passenger?.phone ?? "—";
  const totalAmount = formatCurrency(data.payment?.totalCents ?? null, data.payment?.currency ?? "CAD");
  const flightNumber =
    data.schedule?.flightNumber ??
    (typeof (data as any).flightNumber === "string" ? (data as any).flightNumber : null) ??
    "—";
  const specialNotes =
    data.passenger?.specialNotes ??
    data.schedule?.notes ??
    (typeof (data as any).scheduleNotes === "string" ? (data as any).scheduleNotes : null) ??
    "—";

  return {
    id: doc.id,
    bookingNumber: data.bookingNumber,
    pickupTimeUtc: pickupDate?.getTime() ?? data.pickupTimeUtc ?? undefined,
    pickupIso: pickupDate?.toISOString() ?? null,
    pickupDateDisplay: pickupDisplay || "—",
    origin: data.trip?.origin ?? "—",
    destination: data.trip?.destination ?? "—",
    passengerName,
    passengerPhone,
    passengerCount: data.trip?.passengerCount ?? 1,
    totalAmount,
    flightNumber: flightNumber && flightNumber.trim().length > 0 ? flightNumber.trim() : "—",
    specialNotes: specialNotes && specialNotes.trim().length > 0 ? specialNotes.trim() : "—",
    createdAtDisplay: createdAtDate ? formatDisplayDate(createdAtDate) : "—",
  };
};

const detectOverlaps = (bookings: BookingSummary[]): number => {
  const withTimes = bookings
    .map((booking) => ({
      id: booking.id,
      time: typeof booking.pickupTimeUtc === "number" ? booking.pickupTimeUtc : null,
    }))
    .filter((item) => item.time !== null)
    .sort((a, b) => (a.time! - b.time!));

  const overlappingIds = new Set<string>();

  for (let i = 0; i < withTimes.length; i += 1) {
    for (let j = i + 1; j < withTimes.length; j += 1) {
      const delta = Math.abs((withTimes[j].time ?? 0) - (withTimes[i].time ?? 0));
      if (delta <= OVERLAP_WINDOW_MS) {
        overlappingIds.add(withTimes[i].id);
        overlappingIds.add(withTimes[j].id);
      } else if (withTimes[j].time! > (withTimes[i].time ?? 0) + OVERLAP_WINDOW_MS) {
        break;
      }
    }
  }

  return overlappingIds.size;
};

const buildDriverEmail = (bookings: BookingSummary[], summaryDateLabel: string) => {
  if (!bookings.length) {
    return {
      subject: `Daily schedule (${summaryDateLabel})`,
      text: `No bookings are scheduled for ${summaryDateLabel}.`,
    };
  }

  const bodyLines = bookings.map((booking, index) => {
    return [
      `${index + 1}. ${booking.pickupDateDisplay}`,
      `   Pickup: ${booking.origin}`,
      `   Drop-off: ${booking.destination}`,
      `   Contact: ${booking.passengerName} (${booking.passengerPhone})`,
      `   Passengers: ${booking.passengerCount}`,
      `   Total: ${booking.totalAmount}`,
      `   Flight #: ${booking.flightNumber}`,
      `   Notes: ${booking.specialNotes}`,
    ].join("\n");
  });

  const text = [`Daily driver summary for ${summaryDateLabel}`, "", ...bodyLines].join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; line-height: 1.5; color: #0b1f36;">
      <h2 style="margin-top:0;">Daily driver summary for ${summaryDateLabel}</h2>
      <ol style="padding-left:1.2rem;">
        ${bookings
          .map(
            (booking) => `
          <li style="margin-bottom:0.8rem;">
            <strong>${booking.pickupDateDisplay}</strong><br/>
            Pickup: ${booking.origin}<br/>
            Drop-off: ${booking.destination}<br/>
            Contact: ${booking.passengerName} (${booking.passengerPhone})<br/>
            Passengers: ${booking.passengerCount}<br/>
            Total: ${booking.totalAmount}<br/>
            Flight #: ${booking.flightNumber}<br/>
            Notes: ${booking.specialNotes}
          </li>`,
          )
          .join("")}
      </ol>
    </div>
  `;

  return {
    subject: `Daily schedule (${summaryDateLabel})`,
    text,
    html,
  };
};

const buildAdminEmail = (
  bookings: BookingSummary[],
  summaryDateLabel: string,
  overlappingCount: number,
) => {
  if (!bookings.length) {
    return {
      subject: `Admin schedule (${summaryDateLabel})`,
      text: `No bookings are scheduled for ${summaryDateLabel}.`,
    };
  }

  const rows = bookings
    .map(
      (booking) => `
      <tr>
        <td style="padding:6px 8px;">${booking.bookingNumber ?? "—"}</td>
        <td style="padding:6px 8px;">${booking.pickupDateDisplay}</td>
        <td style="padding:6px 8px;">${booking.origin}</td>
        <td style="padding:6px 8px;">${booking.destination}</td>
        <td style="padding:6px 8px;">${booking.passengerName}</td>
        <td style="padding:6px 8px;">${booking.passengerPhone}</td>
        <td style="padding:6px 8px; text-align:center;">${booking.passengerCount}</td>
        <td style="padding:6px 8px;">${booking.totalAmount}</td>
        <td style="padding:6px 8px;">${booking.flightNumber}</td>
        <td style="padding:6px 8px;">${booking.specialNotes}</td>
        <td style="padding:6px 8px;">${booking.createdAtDisplay}</td>
      </tr>
    `,
    )
    .join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; line-height: 1.45; color: #0b1f36;">
      <h2 style="margin-top:0;">Admin booking summary for ${summaryDateLabel}</h2>
      <p>Total bookings: <strong>${bookings.length}</strong></p>
      <p>Bookings within ${OVERLAP_WINDOW_MINUTES} minutes of another: <strong>${overlappingCount}</strong></p>
      <div style="overflow-x:auto;">
        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          <thead>
            <tr style="text-align:left; background:#f1f5f9;">
              <th style="padding:6px 8px;">#</th>
              <th style="padding:6px 8px;">Pickup</th>
              <th style="padding:6px 8px;">From</th>
              <th style="padding:6px 8px;">To</th>
              <th style="padding:6px 8px;">Contact</th>
              <th style="padding:6px 8px;">Phone</th>
              <th style="padding:6px 8px;">Pax</th>
              <th style="padding:6px 8px;">Total</th>
              <th style="padding:6px 8px;">Flight</th>
              <th style="padding:6px 8px;">Notes</th>
              <th style="padding:6px 8px;">Created At</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const textRows = bookings
    .map(
      (booking, index) => [
        `${index + 1}. Booking #${booking.bookingNumber ?? "—"} • Pickup: ${booking.pickupDateDisplay}`,
        `   Route: ${booking.origin} → ${booking.destination}`,
        `   Contact: ${booking.passengerName} (${booking.passengerPhone})`,
        `   Pax: ${booking.passengerCount} | Total: ${booking.totalAmount} | Flight: ${booking.flightNumber}`,
        `   Notes: ${booking.specialNotes} | Created: ${booking.createdAtDisplay}`,
      ].join("\n"),
    )
    .join("\n\n");

  return {
    subject: `Admin schedule (${summaryDateLabel})`,
    text: [
      `Admin booking summary for ${summaryDateLabel}`,
      `Total bookings: ${bookings.length}`,
      `Overlapping bookings (<= ${OVERLAP_WINDOW_MINUTES} min apart): ${overlappingCount}`,
      "",
      textRows,
    ].join("\n"),
    html,
  };
};

const summarizeBookingsForToday = async () => {
  const now = new Date();
  const nowLocal = toZonedTime(now, TZ);
  const startLocal = startOfDay(nowLocal);
  const endLocal = endOfDay(nowLocal);
  const startUtc = fromZonedTime(startLocal, TZ);
  const endUtc = fromZonedTime(endLocal, TZ);

  const startMs = startUtc.getTime();
  const endMs = endUtc.getTime();

  const snapshot = await db
    .collection("bookings")
    .where("pickupTimeUtc", ">=", startMs)
    .where("pickupTimeUtc", "<", endMs)
    .orderBy("pickupTimeUtc", "asc")
    .get();

  const summaries = snapshot.docs.map(buildBookingSummary);
  const overlappingCount = detectOverlaps(summaries);
  const summaryLabel = formatInTimeZone(startLocal, TZ, "EEEE, MMM d");

  return {
    bookings: summaries,
    overlappingCount,
    summaryLabel,
  };
};

const sendDriverNotifications = async (bookings: BookingSummary[], summaryDateLabel: string) => {
  if (DRIVER_EMAIL) {
    const { subject, text, html } = buildDriverEmail(bookings, summaryDateLabel);
    await queueEmailNotification({
      to: DRIVER_EMAIL,
      subject,
      text,
      html,
    });
  }

  if (DRIVER_PHONE) {
    const message = `Hello ${DRIVER_NAME}, your total bookings for today are: ${bookings.length}.`;
    await queueSmsNotification({
      to: DRIVER_PHONE,
      message,
      metadata: { type: "daily-driver-summary" },
    });
  }
};

const sendAdminNotifications = async (
  bookings: BookingSummary[],
  overlappingCount: number,
  summaryDateLabel: string,
) => {
  if (ADMIN_EMAIL) {
    const { subject, text, html } = buildAdminEmail(bookings, summaryDateLabel, overlappingCount);
    await queueEmailNotification({
      to: ADMIN_EMAIL,
      subject,
      text,
      html,
    });
  }

  if (ADMIN_PHONE) {
    const message = `Total bookings for today: ${bookings.length}. Total overlapping bookings: ${overlappingCount}.`;
    await queueSmsNotification({
      to: ADMIN_PHONE,
      message,
      metadata: { type: "daily-admin-summary", overlappingCount },
    });
  }
};

export const sendDailyBookingSummary = onSchedule(
  {
    schedule: DEFAULT_SCHEDULE,
    timeZone: TZ,
  },
  async () => {
    const { bookings, overlappingCount, summaryLabel } = await summarizeBookingsForToday();
    await Promise.all([
      sendDriverNotifications(bookings, summaryLabel),
      sendAdminNotifications(bookings, overlappingCount, summaryLabel),
    ]);
  },
);
