import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";
import {
  queueEmailNotification,
  queuePushNotification,
  queueSmsNotification,
} from "./notifications";
import { syncCustomerBooking } from "./utils/customerBookings";
import { parseDateTimeInTimeZone, SERVICE_TIME_ZONE } from "./utils/timezone";

const db = admin.firestore();

type DriverDirectoryEntry = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  calendarId?: string | null;
  active?: boolean;
};

type DriverSelection = {
  driverId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  calendarId?: string | null;
};

type BookingDoc = admin.firestore.DocumentData & {
  bookingNumber?: number;
  pickupTimeUtc?: number;
  passenger?: {
    primaryPassenger?: string | null;
    phone?: string | null;
    email?: string | null;
    baggage?: string | null;
    specialNotes?: string | null;
  };
  schedule?: {
    pickupTimestamp?: admin.firestore.Timestamp | number | null;
    pickupDate?: string | null;
    pickupTime?: string | null;
    notes?: string | null;
    flightNumber?: string | null;
  };
  trip?: {
    origin?: string | null;
    originAddress?: string | null;
    destination?: string | null;
    destinationAddress?: string | null;
  };
  payment?: {
    totalCents?: number | null;
    currency?: string | null;
  };
  driverAssignments?: Record<string, DriverAssignmentEntry | null> | null;
  status?: string | null;
};

type DriverAssignmentEntry = {
  driverId?: string | null;
  driverName?: string | null;
  driverEmail?: string | null;
  driverPhone?: string | null;
  calendarId?: string | null;
  calendarEventId?: string | null;
  syncedHash?: string | null;
  syncedAt?: admin.firestore.FieldValue | admin.firestore.Timestamp | Date | null;
  lastError?: string | null;
  assignedAt?: admin.firestore.FieldValue | admin.firestore.Timestamp | Date | null;
};

const MAX_BOOKINGS_PER_REQUEST = 25;

const toRoles = (token: admin.auth.DecodedIdToken): string[] => {
  const claimRoles = token.roles;
  if (Array.isArray(claimRoles) && claimRoles.every((role) => typeof role === "string")) {
    return claimRoles as string[];
  }
  return [];
};

const cleanString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const formatBookingNumber = (value?: number | null) => {
  if (typeof value === "number") return value.toString().padStart(5, "0");
  return "XXXXX";
};

const formatCurrency = (cents?: number | null, currency: string = "CAD") => {
  if (typeof cents !== "number") return "TBD";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
};

const formatPickupLabel = (booking: BookingDoc): { full: string; short: string } => {
  const fallback =
    booking.schedule?.pickupDate && booking.schedule?.pickupTime
      ? parseDateTimeInTimeZone(
          booking.schedule.pickupDate,
          booking.schedule.pickupTime,
          SERVICE_TIME_ZONE,
        )
      : null;
  const raw =
    typeof booking.pickupTimeUtc === "number" && Number.isFinite(booking.pickupTimeUtc)
      ? new Date(booking.pickupTimeUtc)
      : fallback;
  if (!raw) {
    return { full: "Pickup time pending", short: "TBD" };
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SERVICE_TIME_ZONE,
  });
  const shortFormatter = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SERVICE_TIME_ZONE,
  });
  return {
    full: formatter.format(raw),
    short: shortFormatter.format(raw),
  };
};

const dedupe = (values: string[]) => Array.from(new Set(values));

const parseDriverSelections = (payload: unknown) => {
  const input = payload as Record<string, unknown>;
  const fromArray =
    Array.isArray(input?.driverIds) && input.driverIds.every((id) => typeof id === "string")
      ? ((input.driverIds as string[]).map((id) => id.trim()).filter(Boolean) as string[])
      : null;
  if (fromArray && fromArray.length > 0) {
    return { ids: dedupe(fromArray), explicitUnassign: false };
  }

  if (
    Array.isArray(input?.drivers) &&
    input.drivers.every((entry) => typeof (entry as { driverId?: unknown })?.driverId === "string")
  ) {
    const ids = (input.drivers as Array<{ driverId: string }>).map((entry) =>
      entry.driverId.trim(),
    );
    if (ids.length > 0) {
      return { ids: dedupe(ids.filter(Boolean)), explicitUnassign: false };
    }
  }

  const legacyDriverId = cleanString(input?.driverId);
  if (legacyDriverId) {
    return { ids: [legacyDriverId], explicitUnassign: false };
  }

  const explicitUnassign =
    (Array.isArray(input?.driverIds) && input?.driverIds.length === 0) ||
    (typeof input?.driverId === "string" && input.driverId.trim().length === 0) ||
    input?.unassign === true;

  return { ids: [], explicitUnassign };
};

const fetchDriverDirectory = async (
  driverIds: string[],
  legacyFallback: Record<string, DriverSelection>,
): Promise<Map<string, DriverSelection>> => {
  const directory = new Map<string, DriverSelection>();
  if (driverIds.length === 0) {
    return directory;
  }

  await Promise.all(
    driverIds.map(async (driverId) => {
      const snap = await db.collection("drivers").doc(driverId).get();
      if (!snap.exists) {
        if (legacyFallback[driverId]) {
          directory.set(driverId, legacyFallback[driverId]);
          return;
        }
        throw new Error(`Driver ${driverId} is not registered.`);
      }
      const data = (snap.data() ?? {}) as DriverDirectoryEntry;
      directory.set(driverId, {
        driverId,
        name: data.name ?? legacyFallback[driverId]?.name ?? null,
        phone: data.phone ?? legacyFallback[driverId]?.phone ?? null,
        email: data.email ?? legacyFallback[driverId]?.email ?? null,
        calendarId: data.calendarId ?? legacyFallback[driverId]?.calendarId ?? null,
      });
    }),
  );

  return directory;
};

const buildDriverAssignmentEntry = (
  driver: DriverSelection,
  existing?: DriverAssignmentEntry,
  assignedAt?: admin.firestore.FieldValue,
): DriverAssignmentEntry => ({
  driverId: driver.driverId,
  driverName: driver.name ?? existing?.driverName ?? null,
  driverEmail: driver.email ?? existing?.driverEmail ?? null,
  driverPhone: driver.phone ?? existing?.driverPhone ?? null,
  calendarId: driver.calendarId ?? existing?.calendarId ?? null,
  calendarEventId: existing?.calendarEventId ?? null,
  syncedHash: existing?.syncedHash ?? null,
  syncedAt: existing?.syncedAt ?? null,
  lastError: existing?.lastError ?? null,
  assignedAt: assignedAt ?? existing?.assignedAt ?? null,
});

const normalizeAssignments = (
  value?: BookingDoc["driverAssignments"],
): Record<string, DriverAssignmentEntry> => {
  if (!value) return {};
  return Object.entries(value).reduce<Record<string, DriverAssignmentEntry>>(
    (acc, [driverId, entry]) => {
      if (!entry) return acc;
      acc[driverId] = entry;
      return acc;
    },
    {},
  );
};

export const assignDriver = onRequest(
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
    const normalizedRoles = new Set(roles.map((role) => role.toLowerCase()));
    let authorized = normalizedRoles.has("admin") || normalizedRoles.has("assign");

    if (!authorized) {
      try {
        const snapshot = await db.collection("users").doc(user.uid).get();
        const userData = snapshot.data() ?? {};
        const profileRoles = Array.isArray(userData.roles)
          ? (userData.roles as unknown[])
              .filter((entry): entry is string => typeof entry === "string")
              .map((role) => role.toLowerCase())
          : [];
        profileRoles.forEach((role) => normalizedRoles.add(role));
        if (typeof userData.role === "string") {
          normalizedRoles.add(userData.role.toLowerCase());
        }
        authorized = normalizedRoles.has("admin") || normalizedRoles.has("assign");
      } catch (profileError) {
        logger.warn("assignDriver: unable to inspect user profile", {
          uid: user.uid,
          error: profileError instanceof Error ? profileError.message : profileError,
        });
      }
    }

    if (!authorized) {
      logger.warn("assignDriver: forbidden", { uid: user.uid, roles: Array.from(normalizedRoles) });
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const rawPayload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const bookingIdsInput = Array.isArray(rawPayload?.bookingIds)
      ? (rawPayload.bookingIds as unknown[])
      : [];
    const bookingIds = bookingIdsInput
      .map((value) => (typeof value === "string" ? value.trim() : null))
      .filter((value): value is string => Boolean(value));

    if (bookingIds.length === 0) {
      res.status(400).json({ error: "MISSING_BOOKINGS" });
      return;
    }

    if (bookingIds.length > MAX_BOOKINGS_PER_REQUEST) {
      res.status(400).json({
        error: "TOO_MANY_BOOKINGS",
        detail: `Limit ${MAX_BOOKINGS_PER_REQUEST} per request`,
      });
      return;
    }

    const normalizedBookingIds = dedupe(bookingIds);

    const notifyEmail = rawPayload?.notify?.email !== false;
    const notifySms = rawPayload?.notify?.sms !== false;
    const notifyPush = rawPayload?.notify?.push !== false;

    const { ids: driverIds, explicitUnassign } = parseDriverSelections(rawPayload);

    const legacyDriverId = cleanString(rawPayload?.driverId);
    const legacyDriverName = cleanString(rawPayload?.driverName) ?? null;
    const legacyDriverPhone = cleanString(rawPayload?.driverContact?.phone) ?? null;
    const legacyDriverEmail = cleanString(rawPayload?.driverContact?.email) ?? null;
    const legacyDriverCalendarId = cleanString(rawPayload?.driverContact?.calendarId) ?? null;

    const legacyFallback: Record<string, DriverSelection> =
      legacyDriverId && (legacyDriverName || legacyDriverPhone || legacyDriverEmail)
        ? {
            [legacyDriverId]: {
              driverId: legacyDriverId,
              name: legacyDriverName,
              phone: legacyDriverPhone,
              email: legacyDriverEmail,
              calendarId: legacyDriverCalendarId,
            },
          }
        : {};

    if (!explicitUnassign && driverIds.length === 0) {
      res.status(400).json({ error: "MISSING_DRIVER_ID" });
      return;
    }

    const driverDirectory = await fetchDriverDirectory(driverIds, legacyFallback);

    const actor = {
      uid: user.uid,
      role: "admin",
      name: user.email ?? user.name ?? null,
    };
    const now = admin.firestore.FieldValue.serverTimestamp();
    const driverNotificationBuckets = new Map<
      string,
      { driver: DriverSelection; bookings: Array<{ booking: BookingDoc; id: string }> }
    >();

    const results = await Promise.all(
      normalizedBookingIds.map(async (bookingId) => {
        const ref = db.collection("bookings").doc(bookingId);
        const snap = await ref.get();
        if (!snap.exists) {
          return { id: bookingId, status: "missing" as const };
        }

        const data = snap.data() as BookingDoc;
        const currentAssignments = normalizeAssignments(data.driverAssignments);

        const nextAssignments =
          !explicitUnassign && driverIds.length > 0
            ? driverIds.reduce<Record<string, DriverAssignmentEntry>>((acc, driverId) => {
                const driver = driverDirectory.get(driverId);
                if (!driver) return acc;
                acc[driverId] = buildDriverAssignmentEntry(driver, currentAssignments[driverId], now);
                return acc;
              }, {})
            : {};

        const assignmentKeys = Object.keys(nextAssignments);
        const primaryDriverId = assignmentKeys[0] ?? null;
        const primaryDriver = primaryDriverId ? driverDirectory.get(primaryDriverId) : null;

        const nextStatus =
          explicitUnassign || assignmentKeys.length === 0
            ? data.status === "completed"
              ? data.status
              : "pending"
            : data.status === "completed"
              ? data.status
              : "assigned";

        const note =
          assignmentKeys.length > 0
            ? `Driver assigned: ${assignmentKeys
                .map((driverId) => driverDirectory.get(driverId)?.name ?? driverId)
                .join(", ")}`
            : "Drivers cleared";

        const assignmentPayload =
          assignmentKeys.length > 0
            ? {
                driverId: primaryDriverId,
                driverName: primaryDriver?.name ?? null,
                driverPhone: primaryDriver?.phone ?? null,
                driverEmail: primaryDriver?.email ?? null,
                assignedAt: now,
              }
            : {
                driverId: null,
                driverName: null,
                driverPhone: null,
                driverEmail: null,
                assignedAt: null,
              };

        const driverAssignmentsUpdate =
          assignmentKeys.length > 0
            ? nextAssignments
            : admin.firestore.FieldValue.delete();

        await ref.set(
          {
            assignment: assignmentPayload,
            driverAssignments: driverAssignmentsUpdate,
            status: nextStatus,
            updatedAt: now,
          },
          { merge: true },
        );

        const historyEntry = {
          timestamp: admin.firestore.Timestamp.now(),
          actor,
          status: nextStatus,
          note,
        };

        await ref.update({
          statusHistory: admin.firestore.FieldValue.arrayUnion({
            ...historyEntry,
          }),
        });

        if (assignmentKeys.length > 0) {
          for (const driverId of assignmentKeys) {
            const driver = driverDirectory.get(driverId);
            if (!driver) continue;
            const bucket = driverNotificationBuckets.get(driverId) ?? {
              driver,
              bookings: [],
            };
            bucket.bookings.push({ booking: data, id: bookingId });
            driverNotificationBuckets.set(driverId, bucket);
          }
        }

        const pickupLabel = formatPickupLabel(data);
        const passenger = data.passenger ?? {};
        const passengerName = passenger.primaryPassenger ?? "Customer";
        const driverListLabel =
          assignmentKeys.length > 0
            ? assignmentKeys
                .map((driverId) => driverDirectory.get(driverId)?.name ?? driverId)
                .join(", ")
            : null;

        if (!explicitUnassign && notifyPush && assignmentKeys.length > 0) {
          for (const driverId of assignmentKeys) {
            await queuePushNotification({
              userId: driverId,
              title: "New ride assigned",
              body: `Booking ${formatBookingNumber(data.bookingNumber)} is on your schedule.`,
              data: {
                bookingId,
                type: "assignment",
              },
            });
          }
        }

        const sentAtField = admin.firestore.FieldValue.serverTimestamp();
        await ref.set(
          {
            system: {
              notifications: {
                email: {
                  driverAssignment: {
                    sent: false,
                    at: sentAtField,
                    driverTo: [],
                    customerMailId: null,
                    customerTo: [],
                  },
                },
                sms: notifySms
                  ? {
                      driverAssignment: {
                        sent: false,
                        at: sentAtField,
                        to: [],
                      },
                    }
                  : undefined,
              },
            },
          },
          { merge: true },
        );

        await syncCustomerBooking(bookingId);
        return { id: bookingId, status: "updated" as const };
      }),
    );

    // Driver notifications (aggregated per driver).
    for (const [driverId, payload] of driverNotificationBuckets.entries()) {
      const driver = payload.driver;
      if (notifyEmail && driver.email) {
        const bookingsList = payload.bookings
          .map(({ booking, id }) => {
            const pickupLabel = formatPickupLabel(booking);
            const trip = booking.trip ?? {};
            const origin = trip.originAddress ?? trip.origin ?? "Origin TBD";
            const destination = trip.destinationAddress ?? trip.destination ?? "Destination TBD";
            const fare = formatCurrency(booking.payment?.totalCents ?? null);
            const passenger = booking.passenger ?? {};
            const schedule = booking.schedule ?? {};
            return {
              id,
              label: pickupLabel,
              origin,
              destination,
              fare,
              passenger: passenger.primaryPassenger ?? "Customer",
              passengerPhone: passenger.phone ?? null,
              bookingNumber: formatBookingNumber(booking.bookingNumber),
              flightNumber:
                typeof schedule.flightNumber === "string" && schedule.flightNumber.trim().length > 0
                  ? schedule.flightNumber.trim()
                  : null,
              notes:
                typeof schedule.notes === "string" && schedule.notes.trim().length > 0
                  ? schedule.notes.trim()
                  : typeof passenger.specialNotes === "string" && passenger.specialNotes.trim().length > 0
                    ? passenger.specialNotes.trim()
                    : null,
            };
          })
          .sort((a, b) => a.label.full.localeCompare(b.label.full));

        const subject = `New Assignments (${bookingsList.length}) for ${
          driver.name ?? "Valley Airporter partner"
        } from Valley Airporter Ltd.`;

        const htmlList = bookingsList
          .map((item, idx) => {
            const contactLabel = [item.passenger, item.passengerPhone].filter(Boolean).join(" • ") || "Contact unavailable";
            return `
              <li style="margin-bottom:1.25rem;">
                <p style="margin:0; font-weight:600;">${idx + 1}. ${item.label.full}</p>
                <p style="margin:0.1rem 0;">From: ${item.origin}</p>
                <p style="margin:0.1rem 0;">To: ${item.destination}</p>
                <p style="margin:0.1rem 0;">Contact: ${contactLabel}</p>
                <p style="margin:0.1rem 0;">Total amount: ${item.fare}</p>
                ${item.flightNumber ? `<p style="margin:0.1rem 0;">Arrival flight number: ${item.flightNumber}</p>` : ""}
                ${item.notes ? `<p style="margin:0.1rem 0;">Special notes: ${item.notes}</p>` : ""}
              </li>
            `
          })
          .join("");

        const html = `
          <p>Hello ${driver.name ?? "there"},</p>
          <p>Here are the next bookings dispatched by Valley Airporter:</p>
          <ol style="padding-left:1rem;">${htmlList}</ol>
          <p>For any changes, please let us know as soon as possible.</p>
          <p>Thanks,<br/>Regards,<br/>Valley Airporter<br/>Dispatch Team</p>
        `;

        const textBody = bookingsList
          .map((item, idx) => {
            const contactLabel = [item.passenger, item.passengerPhone].filter(Boolean).join(" • ") || "Contact unavailable";
            return [
              `${idx + 1}. ${item.label.full}`,
              `From: ${item.origin}`,
              `To: ${item.destination}`,
              `Contact: ${contactLabel}`,
              `Total amount: ${item.fare}`,
              item.flightNumber ? `Arrival flight number: ${item.flightNumber}` : null,
              item.notes ? `Special notes: ${item.notes}` : null,
            ]
              .filter((line): line is string => Boolean(line))
              .join("\n");
          })
          .join("\n\n");

        const text = `Hello ${driver.name ?? "there"},\n\nHere are the next bookings dispatched by Valley Airporter:\n\n${textBody}\n\nFor any changes, please let us know as soon as possible.\n\nThanks,\nRegards,\nValley Airporter\nDispatch Team`;

        await queueEmailNotification({
          to: driver.email,
          subject,
          html,
          text,
        });
      }

      if (notifySms && driver.phone) {
        const pickupTimes = payload.bookings
          .map(({ booking }) => formatPickupLabel(booking).short)
          .slice(0, 3);
        const suffix =
          payload.bookings.length > 3 ? ` +${payload.bookings.length - 3} more` : "";
        await queueSmsNotification({
          to: driver.phone,
          message: `Valley Airporter: check email for new pickup(s) at ${pickupTimes.join(", ")}${suffix}.`,
        });
      }
    }

    const updated = results.filter((item) => item.status === "updated").map((item) => item.id);
    const missing = results.filter((item) => item.status === "missing").map((item) => item.id);

    res.json({
      ok: true,
      updated,
      missing,
    });
  },
);
