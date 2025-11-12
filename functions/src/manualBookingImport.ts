import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requireUser } from "./_auth";
import { parseDateTimeInTimeZone, SERVICE_TIME_ZONE } from "./utils/timezone";
import type { TripDirection } from "./pricing";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const ALLOWED_STATUSES = new Set([
  "pending",
  "awaiting_payment",
  "confirmed",
  "assigned",
  "en_route",
  "arrived",
  "on_trip",
  "completed",
  "cancelled",
]);

const MAX_PASSENGERS = 14;
const MAX_BATCH_ENTRIES = 5;
const HOUR_MS = 60 * 60 * 1000;

class EntryValidationError extends Error {
  constructor(
    public readonly entryIndex: number,
    message: string,
  ) {
    super(message);
    this.name = "EntryValidationError";
  }
}

type ManualBookingPayload = {
  rawText?: string | null;
  status?: string | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  timeZone?: string | null;
  passenger?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    baggage?: string | null;
    specialNotes?: string | null;
  };
  trip?: {
    direction?: TripDirection | string | null;
    origin?: string | null;
    destination?: string | null;
    passengerCount?: number | null;
  };
  payment?: {
    totalCents?: number | null;
    currency?: string | null;
    preference?: "pay_on_arrival" | "pay_now";
  };
  scheduleNotes?: string | null;
  flightNumber?: string | null;
};

type ValidatedManualBooking = {
  rawText: string | null;
  status: string;
  pickupDate: string;
  pickupTime: string;
  timeZone: string;
  passenger: {
    name: string;
    phone: string | null;
    email: string | null;
    baggage: string | null;
    specialNotes: string | null;
  };
  trip: {
    origin: string;
    destination: string;
    direction: TripDirection;
    passengerCount: number;
  };
  payment: {
    totalCents: number | null;
    currency: string;
    preference: "pay_on_arrival" | "pay_now";
  };
  scheduleNotes: string | null;
  flightNumber: string | null;
};

const normalizeBatchPayload = (raw: unknown): ManualBookingPayload[] => {
  if (Array.isArray(raw)) {
    return raw.map((entry) => (entry ?? {})) as ManualBookingPayload[];
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { entries?: ManualBookingPayload[] }).entries)) {
    const entries = (raw as { entries?: ManualBookingPayload[] }).entries ?? [];
    return entries.map((entry) => (entry ?? {}));
  }
  if (raw && typeof raw === "object") {
    return [raw as ManualBookingPayload];
  }
  return [];
};

const asTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStatus = (value?: string | null): string => {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return "confirmed";
  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");
  return ALLOWED_STATUSES.has(normalized) ? normalized : "confirmed";
};

const normalizeDirection = (value?: string | null): TripDirection => {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "from the airport") return "From the Airport";
    if (trimmed === "to the airport") return "To the Airport";
  }
  return "To the Airport";
};

const clampPassengerCount = (value?: number | null): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > MAX_PASSENGERS) return MAX_PASSENGERS;
  return rounded;
};

const determineVehicleSelection = (passengerCount: number): string => {
  if (passengerCount >= 12) return "freightlinerSprinter";
  if (passengerCount >= 8) return "mercedesSprinter";
  if (passengerCount >= 6) return "chevyExpress";
  return "sevenVan";
};

const normalizePhone = (value?: string | null): string | null => {
  if (!value) return null;
  const digits = value.replace(/[^+\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  return `+1${digits}`;
};

const buildPhoneVariants = (normalized: string | null): string[] => {
  if (!normalized) return [];
  const variants = new Set<string>();
  variants.add(normalized);
  if (normalized.startsWith("+")) {
    variants.add(normalized.substring(1));
  }
  if (normalized.startsWith("+1")) {
    variants.add(normalized.substring(2));
  }
  return Array.from(variants).filter(Boolean);
};

const formatPickupDisplay = (date: Date) => {
  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: SERVICE_TIME_ZONE,
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: SERVICE_TIME_ZONE,
  }).format(date);
  return `${datePart} at ${timePart}`;
};

const toRoles = (token: admin.auth.DecodedIdToken): string[] => {
  const claimRoles = token.roles;
  if (Array.isArray(claimRoles) && claimRoles.every((role) => typeof role === "string")) {
    return claimRoles as string[];
  }
  return [];
};

const validatePayload = (rawPayload: ManualBookingPayload): ValidatedManualBooking => {
  const tripOrigin = asTrimmedString(rawPayload.trip?.origin);
  const tripDestination = asTrimmedString(rawPayload.trip?.destination);
  const pickupDate = asTrimmedString(rawPayload.pickupDate);
  const pickupTime = asTrimmedString(rawPayload.pickupTime);
  const passengerName = asTrimmedString(rawPayload.passenger?.name);

  if (!tripOrigin) {
    throw new Error("TRIP_ORIGIN_REQUIRED");
  }
  if (!tripDestination) {
    throw new Error("TRIP_DESTINATION_REQUIRED");
  }
  if (!pickupDate) {
    throw new Error("PICKUP_DATE_REQUIRED");
  }
  if (!pickupTime) {
    throw new Error("PICKUP_TIME_REQUIRED");
  }
  if (!passengerName) {
    throw new Error("PASSENGER_NAME_REQUIRED");
  }

  const passengerCount = clampPassengerCount(rawPayload.trip?.passengerCount ?? 1);
  const totalCents =
    typeof rawPayload.payment?.totalCents === "number" && Number.isFinite(rawPayload.payment.totalCents)
      ? Math.round(rawPayload.payment.totalCents)
      : null;

  return {
    rawText: asTrimmedString(rawPayload.rawText),
    status: normalizeStatus(rawPayload.status),
    pickupDate,
    pickupTime,
    timeZone: asTrimmedString(rawPayload.timeZone) ?? SERVICE_TIME_ZONE,
    passenger: {
      name: passengerName,
      phone: asTrimmedString(rawPayload.passenger?.phone),
      email: rawPayload.passenger?.email
        ? rawPayload.passenger.email.trim().toLowerCase()
        : null,
      baggage: asTrimmedString(rawPayload.passenger?.baggage) ?? "Normal",
      specialNotes: asTrimmedString(rawPayload.passenger?.specialNotes),
    },
    trip: {
      origin: tripOrigin,
      destination: tripDestination,
      direction: normalizeDirection(rawPayload.trip?.direction),
      passengerCount,
    },
    payment: {
      totalCents,
      currency: asTrimmedString(rawPayload.payment?.currency) ?? "CAD",
      preference: rawPayload.payment?.preference === "pay_now" ? "pay_now" : "pay_on_arrival",
    },
    scheduleNotes: asTrimmedString(rawPayload.scheduleNotes),
    flightNumber: asTrimmedString(rawPayload.flightNumber),
  };
};

export const manualBookingImport = onRequest(
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
    if (!roles.includes("admin")) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    try {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const normalized = normalizeBatchPayload(payload);

      if (normalized.length === 0) {
        res.status(400).json({ error: "NO_ENTRIES" });
        return;
      }
      if (normalized.length > MAX_BATCH_ENTRIES) {
        res.status(400).json({ error: "TOO_MANY_ENTRIES", max: MAX_BATCH_ENTRIES });
        return;
      }

      const validatedEntries = normalized.map((entry, index) => {
        try {
          return validatePayload(entry ?? {});
        } catch (validationError) {
          const message =
            validationError instanceof Error ? validationError.message : "VALIDATION_FAILED";
          throw new EntryValidationError(index + 1, message);
        }
      });

      const createdAtDate = new Date();
      const now = admin.firestore.Timestamp.fromDate(createdAtDate);

      const preparedEntries = validatedEntries.map((data, index) => {
        const pickupDate = parseDateTimeInTimeZone(data.pickupDate, data.pickupTime, data.timeZone);
        if (!pickupDate) {
          throw new EntryValidationError(index + 1, "INVALID_PICKUP_TIME");
        }

        const pickupTimestamp = admin.firestore.Timestamp.fromDate(pickupDate);
        const pickupTimeUtc = pickupDate.getTime();
        const pickupDisplay = formatPickupDisplay(pickupDate);

        const remind24Candidate = pickupTimeUtc - 24 * HOUR_MS;
        const remind10Candidate = pickupTimeUtc - 10 * HOUR_MS;
        const nowMs = Date.now();
        const remind24At = remind24Candidate > nowMs ? remind24Candidate : null;
        const remind10At = remind10Candidate > nowMs ? remind10Candidate : null;

        const normalizedPhone = normalizePhone(data.passenger.phone);
        const phoneVariants = buildPhoneVariants(normalizedPhone);
        const lookupKeys = [
          ...(data.passenger.email ? [`email:${data.passenger.email}`] : []),
          ...phoneVariants.map((value) => `phone:${value}`),
        ];

        const vehicleSelection = determineVehicleSelection(data.trip.passengerCount);

        const originDisplay =
          data.trip.origin?.trim() && data.trip.origin.trim().length > 0 ?
            data.trip.origin.trim() :
            null;
        const destinationDisplay =
          data.trip.destination?.trim() && data.trip.destination.trim().length > 0 ?
            data.trip.destination.trim() :
            null;
        const passengerName = data.passenger.name?.trim() ?? null;
        const quoteDisplay =
          typeof data.payment.totalCents === "number" && Number.isFinite(data.payment.totalCents) ?
            Math.round(data.payment.totalCents / 100) :
            null;

        const bookingDoc = {
          "A0 Booking #": null,
          "A1 Name": passengerName,
          "A2 origin address": originDisplay,
          "A3 destination address": destinationDisplay,
          "A4 Pasengers": data.trip.passengerCount,
          "A5 quote": quoteDisplay,
          "A6 email address": data.passenger.email ?? null,
          "A7 phone number": normalizedPhone ?? data.passenger.phone ?? null,
          "A8 createdAt": now,
          pickupDisplay,
          pickupTimeUtc,
          pickupDateUtcIso: pickupDate.toISOString(),
          schedule: {
            pickupDisplay,
            pickupDate: data.pickupDate,
            pickupTime: data.pickupTime,
            pickupTimestamp,
            notes: data.scheduleNotes ?? null,
            flightNumber: data.flightNumber ?? null,
          },
          status: data.status,
          statusHistory: [
            {
              status: data.status,
              timestamp: now,
              actor: {
                uid: user.uid ?? null,
                role: "admin",
                name: user.name ?? null,
              },
            },
          ],
          payment: {
            preference: data.payment.preference,
            totalCents: data.payment.totalCents,
            baseCents: data.payment.totalCents,
            gstCents: null,
            tipCents: 0,
            tipAmountCents: 0,
            currency: data.payment.currency,
            adjustedManually: true,
            adjustmentNote: "Manual import",
            adjustedBy: user.uid ?? null,
            adjustedByName: user.name ?? null,
          },
          trip: {
            direction: data.trip.direction,
            origin: data.trip.origin,
            originAddress: data.trip.origin,
            destination: data.trip.destination,
            destinationAddress: data.trip.destination,
            passengerCount: data.trip.passengerCount,
            includeReturn: false,
            vehicleSelections: [vehicleSelection],
            preferredVehicle: "van",
          },
          passenger: {
            primaryPassenger: data.passenger.name,
            phone: normalizedPhone ?? data.passenger.phone ?? null,
            email: data.passenger.email,
            baggage: data.passenger.baggage ?? "Normal",
            specialNotes: data.passenger.specialNotes ?? null,
          },
          assignment: {
            driverId: null,
            driverName: null,
            assignedAt: null,
          },
          remind24At,
          remind10At,
          remind24Sent: remind24At === null,
          remind10Sent: remind10At === null,
          passengerPhone: normalizedPhone ?? data.passenger.phone ?? null,
          lookupKeys,
          user: {
            uid: user.uid ?? null,
            email: user.email ?? null,
          },
          manualImport: {
            rawText: data.rawText ?? null,
            importedAt: now,
            importedBy: {
              uid: user.uid ?? null,
              email: user.email ?? null,
              displayName: user.name ?? null,
            },
          },
          createdAt: now,
          updatedAt: now,
        };

        return { entryIndex: index, bookingDoc };
      });

      const countersRef = db.collection("counters").doc("bookings");
      const bookingsCollection = db.collection("bookings");

      const transactionResults = await db.runTransaction(async (tx) => {
        const counterSnap = await tx.get(countersRef);
        let currentValue = counterSnap.exists ? Number(counterSnap.data()?.current ?? 29999) : 29999;
        const created: {
          bookingRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>;
          bookingNumber: number;
          entryIndex: number;
        }[] = [];

        for (const entry of preparedEntries) {
          currentValue += 1;
          const bookingRef = bookingsCollection.doc();
          tx.set(bookingRef, {
            ...entry.bookingDoc,
            bookingNumber: currentValue,
            "A0 Booking #": currentValue,
          });
          created.push({
            bookingRef,
            bookingNumber: currentValue,
            entryIndex: entry.entryIndex,
          });
        }

        tx.set(countersRef, { current: currentValue }, { merge: true });
        return created;
      });

      for (const result of transactionResults) {
        logger.info("manualBookingImport: created booking", {
          bookingId: result.bookingRef.id,
          bookingNumber: result.bookingNumber,
          actor: user.uid ?? null,
          entryIndex: result.entryIndex + 1,
        });
      }

      res.json({
        ok: true,
        results: transactionResults.map((result) => ({
          ok: true,
          id: result.bookingRef.id,
          bookingNumber: result.bookingNumber,
          entryIndex: result.entryIndex + 1,
        })),
      });
    } catch (error) {
      if (error instanceof EntryValidationError) {
        logger.warn("manualBookingImport validation error", {
          entryIndex: error.entryIndex,
          message: error.message,
          actor: user.uid ?? null,
        });
        res.status(400).json({ error: error.message, entryIndex: error.entryIndex });
        return;
      }
      logger.error("manualBookingImport error", {
        message: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : null,
      });
      res.status(400).json({ error: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
    }
  },
);
