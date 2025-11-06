import * as admin from "firebase-admin"
import { logger } from "firebase-functions"
import { calculatePricing, PricingError, type PricingArgs, type PricingResult, type TripDirection } from "./pricing"
import { resolveLocationDetails } from "./data/locationDirectory"
import { queueBookingEmail } from "./email"
import { queueSmsNotification } from "./notifications"
import { buildConfirmationMessage, type SmsBookingContext } from "./smsTemplates"
import { createSquarePaymentLink } from "./square"
import { sendBookingConfirmation } from "./studioConfirm"
import { syncCustomerBooking } from "./utils/customerBookings"
import { parseDateTimeInTimeZone, SERVICE_TIME_ZONE } from "./utils/timezone"

const db = admin.firestore()

class QuoteServiceError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message)
    this.name = "QuoteServiceError"
  }
}

export type QuoteStatus =
  | "draft"
  | "quoted"
  | "schedule_selected"
  | "contact_added"
  | "ready_to_book"
  | "converted"
  | "expired"

const QUOTES_COLLECTION = "quotes"
const PII_SUBCOLLECTION = "pii"
const CONTACT_DOC = "contact"

const DEFAULT_CURRENCY = "CAD"
const PRICE_LOCK_DURATION_MS = 30 * 60 * 1000 // 30 minutes
const QUOTE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const HOUR_MS = 60 * 60 * 1000

const formatPickupDisplay = (date: Date) => {
  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: SERVICE_TIME_ZONE,
  }).format(date)
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: SERVICE_TIME_ZONE,
  }).format(date)
  return `${datePart} at ${timePart}`
}

const normalizePhone = (value: string | null | undefined): string | null => {
  if (!value) return null
  const digits = value.replace(/[^+\d]/g, "")
  if (!digits) return null
  if (digits.startsWith("+")) return digits
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`
  return `+1${digits}`
}

const buildLookupKeys = (uid: string | null, email: string | null, phone: string | null): string[] => {
  const keys: string[] = []
  if (uid) keys.push(`uid:${uid}`)
  if (email) keys.push(`email:${email}`)
  if (phone) {
    const variants = new Set<string>()
    variants.add(phone)
    variants.add(phone.startsWith("+") ? phone.substring(1) : phone)
    if (phone.startsWith("+1")) variants.add(phone.substring(2))
    for (const value of variants) {
      if (value) keys.push(`phone:${value}`)
    }
  }
  return keys
}

export interface QuoteTripPayload {
  direction: TripDirection
  fromText: string
  toText: string
  fromAddress: string | null
  toAddress: string | null
  fromPlaceId: string | null
  toPlaceId: string | null
  fromLat: number | null
  fromLng: number | null
  toLat: number | null
  toLng: number | null
  passengerCount: number
  vehicleAutoAssigned: string | null
  pickupDate?: string | null
  pickupTime?: string | null
  distanceKm?: number | null
  durationMin?: number | null
}

export interface QuotePricingPayload {
  base: number
  surcharges: {
    passengers?: number
    distance?: number
    extraKilometers?: number
  }
  taxes: number
  total: number
  currency: string
  pricedAt: admin.firestore.FieldValue | admin.firestore.Timestamp
  priceLockedUntil: admin.firestore.Timestamp
}

export interface QuoteDocument {
  status: QuoteStatus
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp
  updatedAt: admin.firestore.FieldValue | admin.firestore.Timestamp
  createdBy: {
    uid: string | null
    auth: "anon" | "user" | "system"
    sessionId?: string | null
  }
  trip: QuoteTripPayload
  pricing: QuotePricingPayload
  source?: Record<string, unknown> | null
  expiresAt: admin.firestore.Timestamp
  bookingId?: string | null
}

export interface CreateQuoteInput {
  direction: TripDirection
  origin: string
  destination: string
  passengerCount: number
  preferredVehicle?: "standard" | "van"
  originAddress?: string | null
  destinationAddress?: string | null
  originLat?: number | null
  originLng?: number | null
  destinationLat?: number | null
  destinationLng?: number | null
  originPlaceId?: string | null
  destinationPlaceId?: string | null
  sessionId?: string | null
  user?: { uid?: string | null; anonymous?: boolean } | null
}

const roundToCurrency = (value: number | null | undefined): number => {
  if (!Number.isFinite(value ?? NaN)) return 0
  return Math.round(((value ?? 0) + Number.EPSILON) * 100) / 100
}

const buildPricingPayload = (pricing: PricingResult): Omit<QuotePricingPayload, "pricedAt"> => {
  const breakdown = pricing.breakdown ?? null
  const baseFare = breakdown?.baseFare ?? pricing.baseRate ?? 0
  const passengerCharge = breakdown?.additionalPassengerCharge ?? 0
  const distanceCharge = breakdown?.distanceCharge ?? 0
  const extraKm = breakdown?.extraKilometerCharge ?? 0
  const total = breakdown?.total ?? pricing.baseRate ?? 0
  return {
    base: roundToCurrency(baseFare),
    surcharges: {
      passengers: roundToCurrency(passengerCharge) || undefined,
      distance: roundToCurrency(distanceCharge) || undefined,
      extraKilometers: roundToCurrency(extraKm) || undefined,
    },
    taxes: 0,
    total: roundToCurrency(total),
    currency: DEFAULT_CURRENCY,
    priceLockedUntil: admin.firestore.Timestamp.fromMillis(Date.now() + PRICE_LOCK_DURATION_MS),
  }
}

const buildTripPayload = ({
  args,
  pricing,
  originDetails,
  destinationDetails,
}: {
  args: CreateQuoteInput
  pricing: PricingResult
  originDetails: ReturnType<typeof resolveLocationDetails>
  destinationDetails: ReturnType<typeof resolveLocationDetails>
}): QuoteTripPayload => {
  const distanceKm = pricing.distanceDetails?.km ?? null
  const durationMin = pricing.distanceDetails?.durationMinutes ?? null
  return {
    direction: args.direction,
    fromText: originDetails.label,
    toText: destinationDetails.label,
    fromAddress: originDetails.address ?? null,
    toAddress: destinationDetails.address ?? null,
    fromPlaceId: originDetails.placeId ?? null,
    toPlaceId: destinationDetails.placeId ?? null,
    fromLat: typeof originDetails.lat === "number" ? originDetails.lat : null,
    fromLng: typeof originDetails.lng === "number" ? originDetails.lng : null,
    toLat: typeof destinationDetails.lat === "number" ? destinationDetails.lat : null,
    toLng: typeof destinationDetails.lng === "number" ? destinationDetails.lng : null,
    passengerCount: args.passengerCount,
    vehicleAutoAssigned: pricing.vehicleKey ?? null,
    pickupDate: null,
    pickupTime: null,
    distanceKm: typeof distanceKm === "number" ? Math.round(distanceKm * 100) / 100 : null,
    durationMin: typeof durationMin === "number" ? Math.round(durationMin) : null,
  }
}

export interface CreateQuoteResult {
  id: string
  doc: QuoteDocument
  pricing: PricingResult
}

export const createQuote = async (input: CreateQuoteInput): Promise<CreateQuoteResult> => {
  const pax = Number(input.passengerCount)
  if (!Number.isFinite(pax) || pax < 1) {
    throw new PricingError("INVALID_PASSENGER_COUNT", 400)
  }

  const ownerUid = input.user?.uid ?? null
  const authState = ownerUid ? (input.user?.anonymous ? "anon" : "user") : "anon"

  const originDetails = resolveLocationDetails({
    label: input.origin,
    address: input.originAddress ?? null,
    lat: typeof input.originLat === "number" ? input.originLat : null,
    lng: typeof input.originLng === "number" ? input.originLng : null,
    placeId: input.originPlaceId ?? null,
  })
  const destinationDetails = resolveLocationDetails({
    label: input.destination,
    address: input.destinationAddress ?? null,
    lat: typeof input.destinationLat === "number" ? input.destinationLat : null,
    lng: typeof input.destinationLng === "number" ? input.destinationLng : null,
    placeId: input.destinationPlaceId ?? null,
  })

  const pricingArgs: PricingArgs = {
    direction: input.direction,
    origin: input.origin,
    destination: input.destination,
    passengerCount: pax,
    preferredVehicle: input.preferredVehicle,
    originAddress: originDetails.address,
    destinationAddress: destinationDetails.address,
    originLatLng:
      typeof originDetails.lat === "number" && typeof originDetails.lng === "number"
        ? { lat: originDetails.lat, lng: originDetails.lng }
        : null,
    destinationLatLng:
      typeof destinationDetails.lat === "number" && typeof destinationDetails.lng === "number"
        ? { lat: destinationDetails.lat, lng: destinationDetails.lng }
        : null,
  }

  const pricing = await calculatePricing(pricingArgs)
  const pricingPayload = buildPricingPayload(pricing)
  const pricedAt = admin.firestore.FieldValue.serverTimestamp()

  const tripPayload = buildTripPayload({
    args: input,
    pricing,
    originDetails,
    destinationDetails,
  })

  const quoteDoc: QuoteDocument = {
    status: "quoted",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: {
      uid: ownerUid,
      auth: authState,
      sessionId: input.sessionId ?? null,
    },
    trip: tripPayload,
    pricing: {
      ...pricingPayload,
      pricedAt,
    },
    source: null,
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + QUOTE_TTL_MS),
    bookingId: null,
  }

  const ref = await db.collection(QUOTES_COLLECTION).add(quoteDoc)
  const snap = await ref.get()
  const storedDoc = snap.data() as QuoteDocument | undefined
  const resolvedDoc = storedDoc ?? quoteDoc

  return {
    id: ref.id,
    doc: resolvedDoc,
    pricing,
  }
}

export const serializeQuoteResponse = (id: string, doc: QuoteDocument) => {
  const pricedAt =
    doc.pricing.pricedAt instanceof admin.firestore.Timestamp
      ? (doc.pricing.pricedAt.toDate().toISOString() as string)
      : null
  const priceLockedUntil = doc.pricing.priceLockedUntil.toDate().toISOString()
  const expiresAt = doc.expiresAt.toDate().toISOString()

  return {
    quoteId: id,
    status: doc.status,
    trip: doc.trip,
    pricing: {
      base: doc.pricing.base,
      surcharges: doc.pricing.surcharges,
      taxes: doc.pricing.taxes,
      total: doc.pricing.total,
      currency: doc.pricing.currency,
      pricedAt,
      priceLockedUntil,
    },
    expiresAt,
  }
}

export const QUOTE_LOCK_DURATION = PRICE_LOCK_DURATION_MS
export const QUOTE_TTL_DURATION = QUOTE_TTL_MS
export const QUOTE_CONTACT_PATH = `${PII_SUBCOLLECTION}/${CONTACT_DOC}`

interface QuoteAccessContext {
  quoteId: string
  sessionId?: string | null
  user?: { uid?: string | null; admin?: boolean } | null
}

const statusOrder: QuoteStatus[] = [
  "draft",
  "quoted",
  "schedule_selected",
  "contact_added",
  "ready_to_book",
  "converted",
  "expired",
]

const advanceStatus = (current: QuoteStatus, target: QuoteStatus): QuoteStatus => {
  const currentIndex = statusOrder.indexOf(current)
  const targetIndex = statusOrder.indexOf(target)
  if (currentIndex === -1) return target
  if (targetIndex === -1) return current
  return targetIndex > currentIndex ? target : current
}

const getQuoteDoc = async ({ quoteId }: QuoteAccessContext) => {
  const ref = db.collection(QUOTES_COLLECTION).doc(quoteId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new QuoteServiceError("QUOTE_NOT_FOUND", 404)
  }
  return { ref, data: snap.data() as QuoteDocument }
}

const assertMutationRights = (doc: QuoteDocument, ctx: QuoteAccessContext) => {
  if (ctx.user?.admin) return
  const ownerUid = doc.createdBy?.uid ?? null
  if (ownerUid && ctx.user?.uid && ownerUid === ctx.user.uid) return
  const sessionId = doc.createdBy?.sessionId ?? null
  if (!ownerUid && sessionId && ctx.sessionId && sessionId === ctx.sessionId) return
  throw new QuoteServiceError("FORBIDDEN", 403)
}

const shouldRepriceTripPatch = (patch: Partial<CreateQuoteInput> | undefined): boolean => {
  if (!patch) return false
  const fields: (keyof CreateQuoteInput)[] = [
    "direction",
    "origin",
    "destination",
    "passengerCount",
    "preferredVehicle",
    "originAddress",
    "destinationAddress",
    "originLat",
    "originLng",
    "destinationLat",
    "destinationLng",
    "originPlaceId",
    "destinationPlaceId",
  ]
  return fields.some((field) => field in patch)
}

const extendLockTimestamp = () => admin.firestore.Timestamp.fromMillis(Date.now() + PRICE_LOCK_DURATION_MS)

export interface UpdateQuoteInput extends QuoteAccessContext {
  patch: {
    trip?: Partial<CreateQuoteInput>
    schedule?: {
      pickupDate?: string | null
      pickupTime?: string | null
    }
  }
}

export const updateQuote = async (input: UpdateQuoteInput) => {
  const { ref, data } = await getQuoteDoc(input)
  assertMutationRights(data, input)

  const tripPatch = input.patch.trip
  const schedulePatch = input.patch.schedule

  let nextTrip = { ...data.trip }
  let nextStatus: QuoteStatus = data.status
  let pricing = data.pricing
  let shouldReprice = false

  if (tripPatch && shouldRepriceTripPatch(tripPatch)) {
    const mergedInput: CreateQuoteInput = {
      direction: (tripPatch.direction ?? nextTrip.direction) as TripDirection,
      origin: tripPatch.origin ?? nextTrip.fromText,
      destination: tripPatch.destination ?? nextTrip.toText,
      passengerCount: Number(tripPatch.passengerCount ?? nextTrip.passengerCount),
      preferredVehicle: tripPatch.preferredVehicle,
      originAddress: tripPatch.originAddress ?? nextTrip.fromAddress,
      destinationAddress: tripPatch.destinationAddress ?? nextTrip.toAddress,
      originLat: tripPatch.originLat ?? nextTrip.fromLat,
      originLng: tripPatch.originLng ?? nextTrip.fromLng,
      destinationLat: tripPatch.destinationLat ?? nextTrip.toLat,
      destinationLng: tripPatch.destinationLng ?? nextTrip.toLng,
      originPlaceId: tripPatch.originPlaceId ?? nextTrip.fromPlaceId,
      destinationPlaceId: tripPatch.destinationPlaceId ?? nextTrip.toPlaceId,
      sessionId: input.sessionId ?? null,
      user: input.user ?? null,
    }

    const originDetails = resolveLocationDetails({
      label: mergedInput.origin,
      address: mergedInput.originAddress ?? null,
      lat: typeof mergedInput.originLat === "number" ? mergedInput.originLat : null,
      lng: typeof mergedInput.originLng === "number" ? mergedInput.originLng : null,
      placeId: mergedInput.originPlaceId ?? null,
    })
    const destinationDetails = resolveLocationDetails({
      label: mergedInput.destination,
      address: mergedInput.destinationAddress ?? null,
      lat: typeof mergedInput.destinationLat === "number" ? mergedInput.destinationLat : null,
      lng: typeof mergedInput.destinationLng === "number" ? mergedInput.destinationLng : null,
      placeId: mergedInput.destinationPlaceId ?? null,
    })

    const pricingResult = await calculatePricing({
      direction: mergedInput.direction,
      origin: mergedInput.origin,
      destination: mergedInput.destination,
      passengerCount: mergedInput.passengerCount,
      preferredVehicle: mergedInput.preferredVehicle,
      originAddress: originDetails.address,
      destinationAddress: destinationDetails.address,
      originLatLng:
        typeof originDetails.lat === "number" && typeof originDetails.lng === "number"
          ? { lat: originDetails.lat, lng: originDetails.lng }
          : null,
      destinationLatLng:
        typeof destinationDetails.lat === "number" && typeof destinationDetails.lng === "number"
          ? { lat: destinationDetails.lat, lng: destinationDetails.lng }
          : null,
    })

    nextTrip = {
      ...nextTrip,
      direction: mergedInput.direction,
      fromText: originDetails.label,
      toText: destinationDetails.label,
      fromAddress: originDetails.address ?? null,
      toAddress: destinationDetails.address ?? null,
      fromPlaceId: originDetails.placeId ?? null,
      toPlaceId: destinationDetails.placeId ?? null,
      fromLat: typeof originDetails.lat === "number" ? originDetails.lat : null,
      fromLng: typeof originDetails.lng === "number" ? originDetails.lng : null,
      toLat: typeof destinationDetails.lat === "number" ? destinationDetails.lat : null,
      toLng: typeof destinationDetails.lng === "number" ? destinationDetails.lng : null,
      passengerCount: mergedInput.passengerCount,
      vehicleAutoAssigned: pricingResult.vehicleKey ?? null,
      distanceKm:
        typeof pricingResult.distanceDetails?.km === "number"
          ? Math.round(pricingResult.distanceDetails.km * 100) / 100
          : nextTrip.distanceKm ?? null,
      durationMin:
        typeof pricingResult.distanceDetails?.durationMinutes === "number"
          ? Math.round(pricingResult.distanceDetails.durationMinutes)
          : nextTrip.durationMin ?? null,
    }

    const pricingPayload = buildPricingPayload(pricingResult)
    pricing = {
      ...pricingPayload,
      pricedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    shouldReprice = true
    nextStatus = advanceStatus(nextStatus, "quoted")
  }

  if (schedulePatch && ("pickupDate" in schedulePatch || "pickupTime" in schedulePatch)) {
    nextTrip = {
      ...nextTrip,
      pickupDate: schedulePatch.pickupDate ?? nextTrip.pickupDate ?? null,
      pickupTime: schedulePatch.pickupTime ?? nextTrip.pickupTime ?? null,
    }
    nextStatus = advanceStatus(nextStatus, "schedule_selected")
    pricing.priceLockedUntil = extendLockTimestamp()
  } else if (shouldReprice) {
    pricing.priceLockedUntil = extendLockTimestamp()
  }

  const updates: Partial<QuoteDocument> = {
    trip: nextTrip,
    pricing: {
      ...pricing,
      priceLockedUntil: pricing.priceLockedUntil,
    },
    status: nextStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  await ref.set(updates, { merge: true })
  const updatedSnap = await ref.get()
  const updatedDoc = updatedSnap.data() as QuoteDocument
  return serializeQuoteResponse(ref.id, updatedDoc)
}

export interface AttachContactInput extends QuoteAccessContext {
  contact: {
    fullName: string
    email: string
    phone: string
  }
}

export const attachContact = async (input: AttachContactInput) => {
  const { ref, data } = await getQuoteDoc(input)
  assertMutationRights(data, input)

  const sanitized = {
    fullName: input.contact.fullName.trim(),
    email: input.contact.email.trim().toLowerCase(),
    phone: input.contact.phone.trim(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  await ref.collection(PII_SUBCOLLECTION).doc(CONTACT_DOC).set(sanitized, { merge: true })

  let nextStatus: QuoteStatus = advanceStatus(data.status, "contact_added")
  if ((data.trip.pickupDate && data.trip.pickupTime) || data.status === "ready_to_book") {
    nextStatus = advanceStatus(nextStatus, "ready_to_book")
  }

  await ref.set(
    {
      status: nextStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  const updatedSnap = await ref.get()
  const updatedDoc = updatedSnap.data() as QuoteDocument
  return serializeQuoteResponse(ref.id, updatedDoc)
}

export interface ConfirmQuoteInput extends QuoteAccessContext {
  schedule: {
    pickupDate: string
    pickupTime: string
    flightNumber?: string | null
    notes?: string | null
  }
  passenger: {
    fullName: string
    email: string
    phone: string
    baggage?: string | null
  }
  payment: {
    preference: "pay_on_arrival" | "pay_now"
    tipAmount?: number
  }
}

export const getQuote = async (input: QuoteAccessContext) => {
  const { data } = await getQuoteDoc(input)
  assertMutationRights(data, input)
  return serializeQuoteResponse(input.quoteId, data)
}

export const confirmQuote = async (input: ConfirmQuoteInput) => {
  const { ref, data } = await getQuoteDoc(input)
  assertMutationRights(data, input)

  if (data.status === "converted") {
    throw new QuoteServiceError("ALREADY_CONVERTED", 409)
  }

  const lockExpiresAt = data.pricing.priceLockedUntil.toDate().getTime()
  if (lockExpiresAt <= Date.now()) {
    await ref.set(
      {
        status: "expired",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    throw new QuoteServiceError("QUOTE_LOCK_EXPIRED", 409)
  }

  const contactSnap = await ref.collection(PII_SUBCOLLECTION).doc(CONTACT_DOC).get()
  const storedContact = contactSnap.exists ? (contactSnap.data() as { fullName?: string; email?: string; phone?: string }) : null

  const passengerName = (input.passenger.fullName || storedContact?.fullName || "").trim()
  const passengerEmail = (input.passenger.email || storedContact?.email || "").trim().toLowerCase()
  const passengerPhoneRaw = input.passenger.phone || storedContact?.phone || ""
  if (!passengerName || !passengerEmail || !passengerPhoneRaw) {
    throw new QuoteServiceError("CONTACT_INCOMPLETE", 400)
  }

  const pickupDate = input.schedule.pickupDate
  const pickupTime = input.schedule.pickupTime
  if (!pickupDate || !pickupTime) {
    throw new QuoteServiceError("SCHEDULE_INCOMPLETE", 400)
  }

  const pickupDateTime = parseDateTimeInTimeZone(pickupDate, pickupTime)
  if (!pickupDateTime) {
    throw new QuoteServiceError("INVALID_PICKUP_TIME", 400)
  }

  const pickupDisplay = formatPickupDisplay(pickupDateTime)
  const pickupTimestamp = admin.firestore.Timestamp.fromDate(pickupDateTime)
  const pickupTimeUtc = pickupTimestamp.toMillis()
  const nowMs = Date.now()
  const remind24Candidate = pickupTimeUtc - 24 * HOUR_MS
  const remind10Candidate = pickupTimeUtc - 10 * HOUR_MS
  const remind24At = remind24Candidate > nowMs ? remind24Candidate : null
  const remind10At = remind10Candidate > nowMs ? remind10Candidate : null

  const normalizedPhone = normalizePhone(passengerPhoneRaw)
  const lookupKeys = buildLookupKeys(input.user?.uid ?? null, passengerEmail, normalizedPhone)

  const baseCents = Math.round(data.pricing.base * 100)
  const passengerSurchargeCents = Math.round((data.pricing.surcharges.passengers ?? 0) * 100)
  const distanceSurchargeCents = Math.round((data.pricing.surcharges.distance ?? 0) * 100)
  const extraKmCents = Math.round((data.pricing.surcharges.extraKilometers ?? 0) * 100)
  const lockedSubtotalCents = baseCents + passengerSurchargeCents + distanceSurchargeCents + extraKmCents
  const lockedTotalCents = Math.max(Math.round(data.pricing.total * 100), lockedSubtotalCents)
  const tipCents = Math.max(0, Math.round((input.payment.tipAmount ?? 0) * 100))
  const gstCents = 0 // GST handled at payment stage; kept at zero per quote flow requirements
  const totalCents = lockedTotalCents + tipCents + gstCents

  const breakdown = {
    baseFare: roundToCurrency(data.pricing.base),
    additionalPassengerCharge: roundToCurrency(data.pricing.surcharges.passengers ?? 0),
    distanceCharge: roundToCurrency(data.pricing.surcharges.distance ?? 0),
    extraKilometerCharge: roundToCurrency(data.pricing.surcharges.extraKilometers ?? 0),
    total: roundToCurrency(data.pricing.total),
  }

  const distanceDetails =
    data.trip.distanceKm != null || data.trip.durationMin != null
      ? {
          km: data.trip.distanceKm ?? undefined,
          durationMinutes: data.trip.durationMin ?? undefined,
        }
      : undefined

  const pricingSnapshot = {
    baseRate: roundToCurrency(
      data.pricing.base +
        (data.pricing.surcharges.passengers ?? 0) +
        (data.pricing.surcharges.distance ?? 0) +
        (data.pricing.surcharges.extraKilometers ?? 0),
    ),
    vehicleKey: data.trip.vehicleAutoAssigned,
    availableVehicles: [] as string[],
    distanceRuleApplied: Boolean(data.pricing.surcharges.distance ?? data.pricing.surcharges.extraKilometers),
    distanceDetails,
    breakdown,
  }

  const createdAtDate = new Date()
  const createdAt = admin.firestore.Timestamp.fromDate(createdAtDate)
  const passengerRecord = {
    primaryPassenger: passengerName,
    email: passengerEmail,
    phone: normalizedPhone ?? passengerPhoneRaw,
    baggage: input.passenger.baggage ?? "Normal",
  }

  const bookingTrip = {
    direction: data.trip.direction,
    origin: data.trip.fromText,
    originAddress: data.trip.fromAddress ?? null,
    originLat: data.trip.fromLat ?? null,
    originLng: data.trip.fromLng ?? null,
    originPlaceId: data.trip.fromPlaceId ?? null,
    destination: data.trip.toText,
    destinationAddress: data.trip.toAddress ?? null,
    destinationLat: data.trip.toLat ?? null,
    destinationLng: data.trip.toLng ?? null,
    destinationPlaceId: data.trip.toPlaceId ?? null,
    passengerCount: data.trip.passengerCount,
    vehicleSelections: data.trip.vehicleAutoAssigned ? [data.trip.vehicleAutoAssigned] : [],
    preferredVehicle: null,
    includeReturn: false,
  }

  const status = input.payment.preference === "pay_now" ? "confirmed" : "pending"
  const bookingDoc = {
    pickupDisplay,
    pickupTimeUtc,
    schedule: {
      pickupDisplay,
      pickupDate,
      pickupTime,
      pickupTimestamp,
      flightNumber: input.schedule.flightNumber ?? null,
      notes: input.schedule.notes ?? null,
      returnPickupDate: null,
      returnPickupTime: null,
      returnPickupTimestamp: null,
      returnFlightNumber: null,
    },
    status,
    statusHistory: [
      {
        status,
        timestamp: createdAt,
      },
    ],
    payment: {
      preference: input.payment.preference,
      tipAmountCents: tipCents,
      totalCents,
      gstCents,
      baseCents: lockedSubtotalCents,
      currency: data.pricing.currency,
    },
    trip: bookingTrip,
    passenger: passengerRecord,
    pricing: pricingSnapshot,
    assignment: {
      driverId: null,
      driverName: null,
      assignedAt: null,
    },
    remind24At,
    remind10At,
    remind24Sent: remind24At === null,
    remind10Sent: remind10At === null,
    passengerPhone: normalizedPhone ?? passengerPhoneRaw,
    lookupKeys,
    user: {
      uid: input.user?.uid ?? null,
      email: passengerEmail,
    },
    system: {
      notifications: {
        email: {
          bookingConfirmation: {
            sent: false,
          },
        },
      },
      quote: {
        id: ref.id,
        pricedAt:
          data.pricing.pricedAt instanceof admin.firestore.Timestamp
            ? data.pricing.pricedAt
            : admin.firestore.FieldValue.serverTimestamp(),
        priceLockedUntil: data.pricing.priceLockedUntil,
      },
    },
    createdAt,
    updatedAt: createdAt,
    quoteId: ref.id,
  }

  const countersRef = db.collection("counters").doc("bookings")
  const bookingsCollection = db.collection("bookings")

  const { bookingRef, bookingNumber } = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(countersRef)
    const currentValue = counterSnap.exists ? Number(counterSnap.data()?.current ?? 29999) : 29999
    const nextValue = currentValue + 1
    const newBookingRef = bookingsCollection.doc()

    tx.set(countersRef, { current: nextValue }, { merge: true })
    tx.set(newBookingRef, {
      ...bookingDoc,
      bookingNumber: nextValue,
    })

    return { bookingRef: newBookingRef, bookingNumber: nextValue }
  })

  let paymentLink: { url?: string; orderId?: string } | undefined
  if (input.payment.preference === "pay_now") {
    try {
      paymentLink = await createSquarePaymentLink({
        amountCents: totalCents,
        bookingId: bookingRef.id,
        bookingNumber,
        customerName: passengerName,
      })
      await bookingRef.set(
        {
          payment: {
            ...bookingDoc.payment,
            link: paymentLink.url ?? null,
            orderId: paymentLink.orderId ?? null,
          },
        },
        { merge: true },
      )
    } catch (error) {
      logger.error("confirmQuote: failed to attach Square payment link", error)
    }
  }

  const smsContext: SmsBookingContext = {
    bookingId: bookingRef.id,
    bookingNumber,
    pickupTimeUtc,
    schedule: {
      pickupDate,
      pickupTime,
    },
    trip: {
      origin: bookingTrip.origin,
      originAddress: bookingTrip.originAddress ?? null,
      destination: bookingTrip.destination,
      destinationAddress: bookingTrip.destinationAddress ?? null,
    },
    passengerName,
    passengerCount: bookingTrip.passengerCount,
    specialNotes: input.schedule.notes ?? null,
    totalCents,
    currency: data.pricing.currency,
  }

  if (normalizedPhone) {
    const confirmationMessage = buildConfirmationMessage(smsContext)
    await queueSmsNotification({
      to: normalizedPhone,
      message: confirmationMessage,
      metadata: {
        bookingId: bookingRef.id,
        type: "confirmation",
      },
    })

    await sendBookingConfirmation({
      bookingNumber,
      passengerPhone: normalizedPhone,
      trip: smsContext.trip,
      pickupTimeUtc,
      schedule: {
        pickupDate,
        pickupTime,
      },
    })
  }

  await queueBookingEmail({
    bookingId: bookingRef.id,
    bookingNumber,
    customerName: passengerName,
    customerEmail: passengerEmail,
    pickupDate,
    pickupTime,
    origin: bookingTrip.origin,
    originAddress: bookingTrip.originAddress,
    destination: bookingTrip.destination,
    destinationAddress: bookingTrip.destinationAddress,
    passengerCount: bookingTrip.passengerCount,
    phone: normalizedPhone ?? passengerPhoneRaw,
    baggage: input.passenger.baggage ?? "Normal",
    notes: input.schedule.notes ?? null,
    totalCents,
    tipCents,
    currency: data.pricing.currency,
    paymentPreference: input.payment.preference,
    createdAtIso: createdAtDate.toISOString(),
    paymentLinkUrl: paymentLink?.url ?? null,
    flightNumber: input.schedule.flightNumber ?? null,
  })

  await syncCustomerBooking(bookingRef.id)

  await ref.set(
    {
      status: "converted",
      bookingId: bookingRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  const updatedSnap = await ref.get()
  const updatedDoc = updatedSnap.data() as QuoteDocument

  return {
    bookingId: bookingRef.id,
    bookingNumber,
    paymentLink,
    totals: {
      baseCents: lockedSubtotalCents,
      gstCents,
      tipCents,
      totalCents,
      currency: data.pricing.currency,
    },
    quote: serializeQuoteResponse(ref.id, updatedDoc),
  }
}
