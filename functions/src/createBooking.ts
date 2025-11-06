import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import type { Request } from "express";
import { calculatePricing, PricingError, TripDirection } from "./pricing";
import { MAPS_SERVER_KEY } from "./maps";
import { resolveLocationDetails } from "./data/locationDirectory";
import { createSquarePaymentLink, getSquareSecrets } from "./square";
import { queueBookingEmail } from "./email";
import { queueSmsNotification } from "./notifications";
import { buildConfirmationMessage, SmsBookingContext } from "./smsTemplates";
import { sendBookingConfirmation } from "./studioConfirm";
import { getOptionalUser } from "./_auth";
import { syncCustomerBooking } from "./utils/customerBookings";
import { parseDateTimeInTimeZone, SERVICE_TIME_ZONE } from "./utils/timezone";

const db = admin.firestore();

const GST_RATE = 0.05;

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

interface TripPayload {
  direction: TripDirection;
  origin: string;
  originAddress?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  originPlaceId?: string | null;
  destination: string;
  destinationAddress?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationPlaceId?: string | null;
  passengerCount: number;
  includeReturn: boolean;
  returnOrigin?: string | null;
  returnOriginAddress?: string | null;
  returnOriginLat?: number | null;
  returnOriginLng?: number | null;
  returnOriginPlaceId?: string | null;
  returnDestination?: string | null;
  returnDestinationAddress?: string | null;
  returnDestinationLat?: number | null;
  returnDestinationLng?: number | null;
  returnDestinationPlaceId?: string | null;
  vehicleSelections: string[];
  preferredVehicle?: "standard" | "van";
}

interface SchedulePayload {
  pickupDate: string; // yyyy-mm-dd
  pickupTime: string; // HH:mm (24h)
  flightNumber?: string | null;
  notes?: string | null;
  returnPickupDate?: string | null;
  returnPickupTime?: string | null;
  returnFlightNumber?: string | null;
}

interface PassengerPayload {
  primaryPassenger: string;
  email: string;
  phone: string;
  baggage?: string | null;
  specialNotes?: string | null;
}

interface PaymentPayload {
  preference: "pay_on_arrival" | "pay_now";
  tipAmount?: number; // dollars
}

const isNonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;

const validateBody = (body: unknown): {
  trip: TripPayload;
  schedule: SchedulePayload;
  passenger: PassengerPayload;
  payment: PaymentPayload;
  quoteRequestId: string | null;
} => {
  if (!body || typeof body !== "object") throw new Error("INVALID_BODY");

  const payload = body as Record<string, unknown>;
  const trip = payload.trip as TripPayload;
  const schedule = payload.schedule as SchedulePayload;
  const passenger = payload.passenger as PassengerPayload;
  const payment = payload.payment as PaymentPayload;
  const quoteRequestIdRaw = typeof (payload as Record<string, unknown>)?.quoteRequestId === "string"
    ? ((payload as Record<string, unknown>).quoteRequestId as string).trim()
    : "";

  if (!trip || !schedule || !passenger || !payment) {
    throw new Error("MISSING_SECTIONS");
  }

  if (!isNonEmpty(trip.direction)) throw new Error("TRIP_DIRECTION");
  if (!isNonEmpty(trip.origin)) throw new Error("TRIP_ORIGIN");
  if (!isNonEmpty(trip.destination)) throw new Error("TRIP_DESTINATION");
  if (typeof trip.passengerCount !== "number" || trip.passengerCount < 1) throw new Error("TRIP_PASSENGERS");
  if (!Array.isArray(trip.vehicleSelections) || trip.vehicleSelections.length === 0) throw new Error("TRIP_VEHICLE");

  if (!isNonEmpty(schedule.pickupDate)) throw new Error("SCHEDULE_DATE");
  if (!isNonEmpty(schedule.pickupTime)) throw new Error("SCHEDULE_TIME");

  if (!isNonEmpty(passenger.primaryPassenger)) throw new Error("PASSENGER_NAME");
  if (!isNonEmpty(passenger.email)) throw new Error("PASSENGER_EMAIL");
  if (!isNonEmpty(passenger.phone)) throw new Error("PASSENGER_PHONE");

  if (!payment.preference) throw new Error("PAYMENT_PREFERENCE");

  return {
    trip,
    schedule,
    passenger,
    payment: {
      preference: payment.preference,
      tipAmount: typeof payment.tipAmount === "number" ? payment.tipAmount : 0,
    },
    quoteRequestId: quoteRequestIdRaw || null,
  };
};

export const createBooking = onRequest({
  cors: true,
  region: "us-central1",
  invoker: "public",
  secrets: [getSquareSecrets().token, MAPS_SERVER_KEY],
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { trip, schedule, passenger, payment, quoteRequestId } = validateBody(payload);
    const authUser = await getOptionalUser(req as unknown as Request);

    logger.info("createBooking: received payload", {
      caller: authUser ? { uid: authUser.uid, email: authUser.email ?? null } : null,
      tripSummary: {
        direction: trip.direction,
        origin: trip.origin,
        destination: trip.destination,
        includeReturn: trip.includeReturn,
        passengerCount: trip.passengerCount,
        vehicleSelections: trip.vehicleSelections,
        preferredVehicle: trip.preferredVehicle ?? null,
      },
      scheduleSummary: {
        pickupDate: schedule.pickupDate,
        pickupTime: schedule.pickupTime,
        hasReturn: Boolean(schedule.returnPickupDate && schedule.returnPickupTime),
      },
      paymentPreference: payment.preference,
      tipAmount: payment.tipAmount ?? 0,
    });

    const originDetails = resolveLocationDetails({
      label: trip.origin,
      address: trip.originAddress ?? null,
      lat: typeof trip.originLat === "number" ? trip.originLat : null,
      lng: typeof trip.originLng === "number" ? trip.originLng : null,
      placeId: trip.originPlaceId ?? null,
    });
    const destinationDetails = resolveLocationDetails({
      label: trip.destination,
      address: trip.destinationAddress ?? null,
      lat: typeof trip.destinationLat === "number" ? trip.destinationLat : null,
      lng: typeof trip.destinationLng === "number" ? trip.destinationLng : null,
      placeId: trip.destinationPlaceId ?? null,
    });

    const canonicalTrip: TripPayload = {
      ...trip,
      originAddress: originDetails.address,
      originLat: originDetails.lat,
      originLng: originDetails.lng,
      originPlaceId: originDetails.placeId,
      destinationAddress: destinationDetails.address,
      destinationLat: destinationDetails.lat,
      destinationLng: destinationDetails.lng,
      destinationPlaceId: destinationDetails.placeId,
    };

    logger.info("createBooking: canonicalized trip", {
      origin: {
        label: canonicalTrip.origin,
        address: canonicalTrip.originAddress,
        lat: canonicalTrip.originLat,
        lng: canonicalTrip.originLng,
        placeId: canonicalTrip.originPlaceId,
      },
      destination: {
        label: canonicalTrip.destination,
        address: canonicalTrip.destinationAddress,
        lat: canonicalTrip.destinationLat,
        lng: canonicalTrip.destinationLng,
        placeId: canonicalTrip.destinationPlaceId,
      },

    });

  let quoteRequestMeta: {
    id: string;
    amountCents: number;
    decidedBy: {
      uid?: string | null;
      email?: string | null;
      displayName?: string | null;
    } | null;
    decidedAt: admin.firestore.Timestamp | null;
  } | null = null;
    if (quoteRequestId) {
      const quoteRef = db.collection("quoteRequests").doc(quoteRequestId);
      const quoteSnap = await quoteRef.get();
      if (!quoteSnap.exists) {
        res.status(404).json({ error: "QUOTE_REQUEST_NOT_FOUND" });
        return;
      }
      const quoteData = quoteSnap.data() ?? {};
      const response = (quoteData.response ?? {}) as {
        status?: string;
        amountCents?: number;
        decidedBy?: Record<string, unknown> | null;
        decidedAt?: admin.firestore.Timestamp | null;
      };
      if (response.status !== "approved" || typeof response.amountCents !== "number") {
        res.status(400).json({ error: "QUOTE_NOT_APPROVED" });
        return;
      }
      let decidedBy: {
        uid?: string | null;
        email?: string | null;
        displayName?: string | null;
      } | null = null;
      if (response.decidedBy && typeof response.decidedBy === "object") {
        const decidedRecord = response.decidedBy as Record<string, unknown>;
        const uid =
          typeof decidedRecord.uid === "string" && decidedRecord.uid.trim().length > 0
            ? decidedRecord.uid.trim()
            : null;
        const email =
          typeof decidedRecord.email === "string" && decidedRecord.email.trim().length > 0
            ? decidedRecord.email.trim()
            : null;
        const displayName =
          typeof decidedRecord.displayName === "string" && decidedRecord.displayName.trim().length > 0
            ? decidedRecord.displayName.trim()
            : null;
        const payload: {
          uid?: string | null;
          email?: string | null;
          displayName?: string | null;
        } = {};
        if (uid) payload.uid = uid;
        if (email) payload.email = email;
        if (displayName) payload.displayName = displayName;
        decidedBy = Object.keys(payload).length > 0 ? payload : null;
      }
      const decidedAt =
        response.decidedAt instanceof admin.firestore.Timestamp ? response.decidedAt : null;
      quoteRequestMeta = {
        id: quoteRequestId,
        amountCents: Math.round(response.amountCents),
        decidedBy,
        decidedAt,
      };
    }

    if (trip.includeReturn) {
      const returnOriginDetails = resolveLocationDetails({
        label: trip.returnOrigin ?? null,
        address: trip.returnOriginAddress ?? null,
        lat: typeof trip.returnOriginLat === "number" ? trip.returnOriginLat : null,
        lng: typeof trip.returnOriginLng === "number" ? trip.returnOriginLng : null,
        placeId: trip.returnOriginPlaceId ?? null,
      });
      const returnDestinationDetails = resolveLocationDetails({
        label: trip.returnDestination ?? null,
        address: trip.returnDestinationAddress ?? null,
        lat:
          typeof trip.returnDestinationLat === "number" ? trip.returnDestinationLat : null,
        lng:
          typeof trip.returnDestinationLng === "number" ? trip.returnDestinationLng : null,
        placeId: trip.returnDestinationPlaceId ?? null,
      });

      canonicalTrip.returnOriginAddress = returnOriginDetails.address;
      canonicalTrip.returnOriginPlaceId = returnOriginDetails.placeId;
      canonicalTrip.returnOriginLat = returnOriginDetails.lat;
      canonicalTrip.returnOriginLng = returnOriginDetails.lng;
      canonicalTrip.returnDestinationAddress = returnDestinationDetails.address;
      canonicalTrip.returnDestinationPlaceId = returnDestinationDetails.placeId;
      canonicalTrip.returnDestinationLat = returnDestinationDetails.lat;
      canonicalTrip.returnDestinationLng = returnDestinationDetails.lng;
    }

    if (canonicalTrip.includeReturn) {
      logger.info("createBooking: canonicalized return trip", {
        returnOrigin: {
          label: canonicalTrip.returnOrigin,
          address: canonicalTrip.returnOriginAddress,
          lat: canonicalTrip.returnOriginLat,
          lng: canonicalTrip.returnOriginLng,
          placeId: canonicalTrip.returnOriginPlaceId,
        },
        returnDestination: {
          label: canonicalTrip.returnDestination,
          address: canonicalTrip.returnDestinationAddress,
          lat: canonicalTrip.returnDestinationLat,
          lng: canonicalTrip.returnDestinationLng,
          placeId: canonicalTrip.returnDestinationPlaceId,
        },
      });
    }

    const pricing = await calculatePricing({
      direction: canonicalTrip.direction,
      origin: canonicalTrip.origin,
      destination: canonicalTrip.destination,
      passengerCount: canonicalTrip.passengerCount,
      preferredVehicle: canonicalTrip.preferredVehicle,
      originAddress: canonicalTrip.originAddress,
      destinationAddress: canonicalTrip.destinationAddress,
      originLatLng:
        typeof canonicalTrip.originLat === "number" && typeof canonicalTrip.originLng === "number"
          ? { lat: canonicalTrip.originLat, lng: canonicalTrip.originLng }
          : null,
      destinationLatLng:
        typeof canonicalTrip.destinationLat === "number" && typeof canonicalTrip.destinationLng === "number"
          ? { lat: canonicalTrip.destinationLat, lng: canonicalTrip.destinationLng }
          : null,
    });

    logger.info("createBooking: pricing result", {
      baseRate: pricing.baseRate,
      vehicleKey: pricing.vehicleKey,
      availableVehicles: pricing.availableVehicles,
      distanceRuleApplied: pricing.distanceRuleApplied ?? false,
      ratesTableKeys: pricing.ratesTable ? Object.keys(pricing.ratesTable) : [],
      distanceDetails: pricing.distanceDetails ?? null,
      breakdown: pricing.breakdown ?? null,
      distanceRuleTarget: pricing.distanceRule?.target ?? null,
    });

    if (!pricing.baseRate && !quoteRequestMeta) {
      logger.error("createBooking: pricing returned no base rate", {
        trip: {
          direction: canonicalTrip.direction,
          origin: canonicalTrip.origin,
          destination: canonicalTrip.destination,
          passengerCount: canonicalTrip.passengerCount,
          preferredVehicle: canonicalTrip.preferredVehicle ?? null,
        },
        pricing,
      });
      res.status(400).json({ error: "NO_PRICE_AVAILABLE" });
      return;
    }

    const resolvedBaseRate = pricing.baseRate ?? (quoteRequestMeta ? quoteRequestMeta.amountCents / 100 : null);
    if (!resolvedBaseRate) {
      res.status(400).json({ error: "NO_PRICE_AVAILABLE" });
      return;
    }

    if (quoteRequestMeta) {
      pricing.baseRate = resolvedBaseRate;
    }

    const baseAmount = quoteRequestMeta ? quoteRequestMeta.amountCents : Math.round(resolvedBaseRate * 100);
    const applyGst = payment.preference === "pay_now";
    const gstAmount = applyGst ? Math.round(baseAmount * GST_RATE) : 0;
    const tipAmount = Math.max(0, Math.round((payment.tipAmount ?? 0) * 100));
    const totalAmount = baseAmount + gstAmount + tipAmount;

    const createdAtDate = new Date();
    const now = admin.firestore.Timestamp.fromDate(createdAtDate);

    const pickupDateTime = parseDateTimeInTimeZone(schedule.pickupDate, schedule.pickupTime);
    if (!pickupDateTime) {
      logger.error("createBooking: invalid pickup date/time", {
        pickupDate: schedule.pickupDate,
        pickupTime: schedule.pickupTime,
      });
      res.status(400).json({ error: "INVALID_PICKUP_TIME" });
      return;
    }

    const pickupDisplay = formatPickupDisplay(pickupDateTime);
    const pickupTimestamp = admin.firestore.Timestamp.fromDate(pickupDateTime);
    const pickupTimeUtc = pickupTimestamp.toMillis();

    const HOUR_MS = 60 * 60 * 1000;
    const remind24Candidate = pickupTimeUtc - 24 * HOUR_MS;
    const remind10Candidate = pickupTimeUtc - 10 * HOUR_MS;
    const nowMs = Date.now();

    const remind24At = remind24Candidate > nowMs ? remind24Candidate : null;
    const remind10At = remind10Candidate > nowMs ? remind10Candidate : null;
    const remind24Sent = remind24At === null;
    const remind10Sent = remind10At === null;

    const returnPickupTimestamp =
      schedule.returnPickupDate && schedule.returnPickupTime
        ? (() => {
            const parsed = parseDateTimeInTimeZone(schedule.returnPickupDate, schedule.returnPickupTime);
            return parsed ? admin.firestore.Timestamp.fromDate(parsed) : null;
          })()
        : null;

    const lowerEmail = passenger.email?.trim().toLowerCase() ?? null;
    const normalizedPhoneRaw = passenger.phone?.replace(/[^+\d]/g, "") ?? null;
    const normalizedPhone = normalizedPhoneRaw
      ? normalizedPhoneRaw.startsWith("+")
        ? normalizedPhoneRaw
        : normalizedPhoneRaw.startsWith("1") && normalizedPhoneRaw.length === 11
          ? `+${normalizedPhoneRaw}`
          : `+1${normalizedPhoneRaw}`
      : null;
    const phoneVariants = normalizedPhone
      ? Array.from(
          new Set(
            [
              normalizedPhone,
              normalizedPhone.substring(1),
              normalizedPhone.startsWith("+1") ? normalizedPhone.substring(2) : null,
            ].filter((value): value is string => Boolean(value)),
          ),
        )
      : [];

    const lookupKeys = [
      ...(authUser?.uid ? [`uid:${authUser.uid}`] : []),
      ...(lowerEmail ? [`email:${lowerEmail}`] : []),
      ...phoneVariants.map((value) => `phone:${value}`),
    ];

    const status = payment.preference === "pay_now" ? "confirmed" : "pending";

    const bookingDoc = {
      pickupDisplay,
      pickupTimeUtc,
      schedule: {
        pickupDisplay,
        ...schedule,
        pickupTimestamp,
        returnPickupTimestamp,
      },
      status,
      statusHistory: [
        {
          status,
          timestamp: now,
        },
      ],
      payment: {
        preference: payment.preference,
        tipAmountCents: tipAmount,
        totalCents: totalAmount,
        gstCents: gstAmount,
        baseCents: baseAmount,
        currency: "CAD",
      },
      trip: {
        ...canonicalTrip,
      },
      passenger: {
        ...passenger,
        phone: normalizedPhone ?? passenger.phone ?? null,
        email: passenger.email,
      },
      pricing,
      assignment: {
        driverId: null,
        driverName: null,
        assignedAt: null,
      },
      remind24At,
      remind10At,
      remind24Sent,
      remind10Sent,
      passengerPhone: normalizedPhone ?? passenger.phone ?? null,
      lookupKeys,
      user: {
        uid: authUser?.uid ?? null,
        email: authUser?.email ?? lowerEmail,
      },
      system: {
        notifications: {
          email: {
            bookingConfirmation: {
              sent: false,
            },
          },
        },
        quoteRequest: quoteRequestMeta
          ? {
              id: quoteRequestMeta.id,
              approvedAmountCents: quoteRequestMeta.amountCents,
              approvedAt: quoteRequestMeta.decidedAt ?? now,
              approvedBy: quoteRequestMeta.decidedBy ?? null,
            }
          : null,
      },
      createdAt: now,
      updatedAt: now,
    };

    const countersRef = db.collection("counters").doc("bookings");
    const bookingsCollection = db.collection("bookings");

    const { bookingRef, bookingNumber } = await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(countersRef);
      const currentValue = counterSnap.exists ? Number(counterSnap.data()?.current ?? 29999) : 29999;
      const nextValue = currentValue + 1;
      const newBookingRef = bookingsCollection.doc();

      tx.set(countersRef, { current: nextValue }, { merge: true });
      tx.set(newBookingRef, {
        ...bookingDoc,
        bookingNumber: nextValue,
      });

      return { bookingRef: newBookingRef, bookingNumber: nextValue };
    });

    if (normalizedPhone) {
      const smsContext: SmsBookingContext = {
        bookingId: bookingRef.id,
        bookingNumber,
        pickupTimeUtc,
        schedule: {
          pickupDate: schedule.pickupDate,
          pickupTime: schedule.pickupTime,
        },
        trip: {
          origin: canonicalTrip.origin,
          originAddress: canonicalTrip.originAddress ?? null,
          destination: canonicalTrip.destination,
          destinationAddress: canonicalTrip.destinationAddress ?? null,
        },
        passengerName: passenger.primaryPassenger,
        passengerCount: canonicalTrip.passengerCount,
        specialNotes: schedule.notes ?? null,
        totalCents: totalAmount,
        currency: bookingDoc.payment.currency,
      };

      const confirmationMessage = buildConfirmationMessage(smsContext);
      await queueSmsNotification({
        to: normalizedPhone,
        message: confirmationMessage,
        metadata: {
          bookingId: bookingRef.id,
          type: "confirmation",
        },
      });

      await sendBookingConfirmation({
        bookingNumber,
        passengerPhone: normalizedPhone,
        trip: smsContext.trip,
        pickupTimeUtc,
        schedule: {
          pickupDate: schedule.pickupDate,
          pickupTime: schedule.pickupTime,
        },
      });
    }

    let paymentLink: { url?: string; orderId?: string } | undefined;
    if (payment.preference === "pay_now") {
      try {
        paymentLink = await createSquarePaymentLink({
          amountCents: totalAmount,
          bookingId: bookingRef.id,
          bookingNumber,
          customerName: passenger.primaryPassenger,
        });
        await bookingRef.set(
          {
            payment: {
              ...bookingDoc.payment,
              link: paymentLink.url ?? null,
              orderId: paymentLink.orderId ?? null,
            },
          },
          { merge: true },
        );
      } catch (error) {
        logger.error("Failed to attach Square payment link", error);
      }
    }

    await queueBookingEmail({
      bookingId: bookingRef.id,
      bookingNumber,
      customerName: passenger.primaryPassenger,
      customerEmail: passenger.email,
      pickupDate: schedule.pickupDate,
      pickupTime: schedule.pickupTime,
      origin: canonicalTrip.origin,
      originAddress: canonicalTrip.originAddress,
      destination: canonicalTrip.destination,
      destinationAddress: canonicalTrip.destinationAddress,
      passengerCount: canonicalTrip.passengerCount,
      phone: passenger.phone,
      baggage: passenger.baggage ?? "Normal",
      notes: schedule.notes ?? null,
      totalCents: totalAmount,
      tipCents: tipAmount,
      currency: "CAD",
      paymentPreference: payment.preference,
      createdAtIso: createdAtDate.toISOString(),
      paymentLinkUrl: paymentLink?.url ?? null,

      flightNumber: schedule.flightNumber ?? null,
    });

    if (quoteRequestMeta) {
      await db
        .collection("quoteRequests")
        .doc(quoteRequestMeta.id)
        .set(
          {
            status: "booked",
            bookingId: bookingRef.id,
            bookedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    }

    await syncCustomerBooking(bookingRef.id);

    res.json({
      ok: true,
      id: bookingRef.id,
      bookingNumber,
      paymentLink,
      totals: {
        baseCents: baseAmount,
        gstCents: gstAmount,
        tipCents: tipAmount,
        totalCents: totalAmount,
        currency: "CAD",
      },
    });
  } catch (error) {
    let sanitizedBody: unknown = null;
    try {
      const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (raw && typeof raw === "object") {
        const payload = raw as {
          trip?: unknown;
          schedule?: unknown;
          payment?: unknown;
        };
        const tripRaw =
          payload.trip && typeof payload.trip === "object"
            ? (payload.trip as Record<string, unknown>)
            : null;
        const scheduleRaw =
          payload.schedule && typeof payload.schedule === "object"
            ? (payload.schedule as Record<string, unknown>)
            : null;
        const paymentRaw =
          payload.payment && typeof payload.payment === "object"
            ? (payload.payment as Record<string, unknown>)
            : null;
        sanitizedBody = {
          trip: tripRaw
            ? {
                direction: typeof tripRaw["direction"] === "string" ? tripRaw["direction"] : undefined,
                origin: typeof tripRaw["origin"] === "string" ? tripRaw["origin"] : undefined,
                destination:
                  typeof tripRaw["destination"] === "string" ? tripRaw["destination"] : undefined,
                passengerCount:
                  typeof tripRaw["passengerCount"] === "number" ? tripRaw["passengerCount"] : undefined,
                includeReturn: Boolean(tripRaw["includeReturn"]),
                preferredVehicle:
                  typeof tripRaw["preferredVehicle"] === "string"
                    ? (tripRaw["preferredVehicle"] as string)
                    : null,
                vehicleSelections: tripRaw["vehicleSelections"],
              }
            : null,
          schedule: scheduleRaw
            ? {
                pickupDate:
                  typeof scheduleRaw["pickupDate"] === "string"
                    ? (scheduleRaw["pickupDate"] as string)
                    : undefined,
                pickupTime:
                  typeof scheduleRaw["pickupTime"] === "string"
                    ? (scheduleRaw["pickupTime"] as string)
                    : undefined,
                hasReturn: Boolean(
                  scheduleRaw["returnPickupDate"] && scheduleRaw["returnPickupTime"],
                ),
              }
            : null,
          paymentPreference:
            typeof paymentRaw?.["preference"] === "string" ? (paymentRaw["preference"] as string) : null,
        };
      } else {
        sanitizedBody = raw ?? null;
      }
    } catch (parseError) {
      sanitizedBody = {
        parsingFailed: parseError instanceof Error ? parseError.message : parseError,
      };
    }

    logger.error("createBooking error", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      stack: error instanceof Error ? error.stack : null,
      name: error instanceof Error ? error.name : null,
      sanitizedBody,
      details:
        typeof error === "object" && error && "details" in error
          ? ((error as { details?: unknown }).details ?? null)
          : null,
    });
    if (error instanceof PricingError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: (error as Error).message ?? "UNKNOWN" });
  }
});
