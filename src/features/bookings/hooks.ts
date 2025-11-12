import { useCallback, useEffect, useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import {
  Timestamp,
  collection,
  documentId,
  limit as limitFn,
  onSnapshot,
  orderBy,
  or,
  query,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore"
import { callFunction } from "@/lib/api/client"
import { useAuth } from "@/lib/hooks/useAuth"
import { useFirebase } from "@/lib/hooks/useFirebase"
import type {
  BookingItem,
  BookingScope,
  BookingStatusActor,
  BookingStatusHistoryEntry,
} from "@/features/bookings/types"

type Booleanish = boolean | undefined

const ASSIGN_DRIVER_ENDPOINT = "assignDriver"
const UPDATE_BOOKING_STATUS_ENDPOINT = "updateBookingStatus"
const UPDATE_BOOKING_PRICING_ENDPOINT = "updateBookingPricing"
const SEND_BULK_BOOKING_SMS_ENDPOINT = "sendBulkBookingSms"

const normalizeTimestamp = (value: unknown): number | null => {
  if (value == null) return null
  if (typeof value === "number") return value
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    try {
      return (value as { toMillis: () => number }).toMillis()
    } catch {
      return null
    }
  }
  return null
}

const normalizeStatusHistory = (value: unknown): BookingStatusHistoryEntry[] | undefined => {
  if (!Array.isArray(value)) return undefined
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const typed = entry as Record<string, unknown>
      return {
        status: typeof typed.status === "string" ? typed.status : "unknown",
        timestamp: normalizeTimestamp(typed.timestamp),
        actor:
          typed.actor && typeof typed.actor === "object"
            ? (typed.actor as BookingStatusHistoryEntry["actor"])
            : null,
        note: typeof typed.note === "string" ? typed.note : null,
        reasonCode: typeof typed.reasonCode === "string" ? typed.reasonCode : null,
        reasonNote: typeof typed.reasonNote === "string" ? typed.reasonNote : null,
      }
    })
    .filter((entry): entry is BookingStatusHistoryEntry => Boolean(entry))
}

const mapBookingDoc = (doc: QueryDocumentSnapshot<DocumentData>): BookingItem => {
  const data = doc.data() ?? {}
  const schedule = (data.schedule as Record<string, unknown>) ?? {}
  const assignment = (data.assignment as Record<string, unknown>) ?? {}
  const systemData = (data.system as Record<string, unknown>) ?? {}
  const systemNotifications = (systemData.notifications as Record<string, unknown>) ?? {}
  const emailNotifications = systemNotifications.email ?? {};
  const smsNotifications = systemNotifications.sms ?? {};
  const pushNotifications = systemNotifications.push ?? {};
  const guardrailsRaw = (systemData.guardrails as Record<string, unknown>) ?? {}
  const quoteRequestRaw = (systemData.quoteRequest as Record<string, unknown>) ?? null

  const bookingConfirmation = emailNotifications.bookingConfirmation;
  const driverAssignmentEmail = emailNotifications.driverAssignment;
  const statusChangeEmail = emailNotifications.statusChange;
  const statusChangeMeta = systemNotifications.statusChange;

  const paymentRaw = (data.payment as Record<string, unknown>) ?? {};
  const payment: BookingItem["payment"] = {
    ...(paymentRaw as BookingItem["payment"]),
    adjustedAt: normalizeTimestamp(paymentRaw.adjustedAt),
  };

  if (paymentRaw.adjustmentReason && typeof paymentRaw.adjustmentReason === "object") {
    const adjustment = paymentRaw.adjustmentReason as Record<string, unknown>;
    payment.adjustmentReason = {
      code: typeof adjustment.code === "string" ? adjustment.code : undefined,
      label: typeof adjustment.label === "string" ? adjustment.label : undefined,
      note: typeof adjustment.note === "string" ? adjustment.note : null,
      additionalNote:
        typeof adjustment.additionalNote === "string" ? adjustment.additionalNote : null,
      submittedAt: normalizeTimestamp(adjustment.submittedAt),
      submittedBy:
        adjustment.submittedBy && typeof adjustment.submittedBy === "object"
          ? (adjustment.submittedBy as BookingStatusActor)
          : null,
      secondApprovalRequired: Boolean(adjustment.secondApprovalRequired),
      secondApprover:
        adjustment.secondApprover && typeof adjustment.secondApprover === "object"
          ? {
              uid:
                typeof (adjustment.secondApprover as { uid?: unknown }).uid === "string"
                  ? ((adjustment.secondApprover as { uid?: string }).uid as string)
                  : null,
                name:
                typeof (adjustment.secondApprover as { name?: unknown }).name === "string"
                  ? ((adjustment.secondApprover as { name?: string }).name as string)
                  : null,
            }
          : null,
    };
  } else {
    payment.adjustmentReason = null;
  }

  const notifications =
    bookingConfirmation ||
    driverAssignmentEmail ||
    statusChangeEmail ||
    smsNotifications ||
    pushNotifications ||
    statusChangeMeta
      ? {
          email: {
            bookingConfirmation: bookingConfirmation
              ? {
                  sent: Boolean(bookingConfirmation.sent),
                  at: normalizeTimestamp(bookingConfirmation.at),
                  mailId: bookingConfirmation.mailId ?? null,
                  subject: bookingConfirmation.subject ?? null,
                  to: Array.isArray(bookingConfirmation.to) ? bookingConfirmation.to : [],
                  cc: Array.isArray(bookingConfirmation.cc) ? bookingConfirmation.cc : [],
                  lastResentBy:
                    bookingConfirmation.lastResentBy &&
                    typeof bookingConfirmation.lastResentBy === "object"
                      ? (bookingConfirmation.lastResentBy as BookingStatusActor)
                      : null,
                  lastResentAt: normalizeTimestamp(bookingConfirmation.lastResentAt),
                  resendCount:
                    typeof bookingConfirmation.resendCount === "number"
                      ? bookingConfirmation.resendCount
                      : undefined,
                }
              : undefined,
            driverAssignment: driverAssignmentEmail
              ? {
                  sent: Boolean(driverAssignmentEmail.sent),
                  at: normalizeTimestamp(driverAssignmentEmail.at),
                  driverMailId: driverAssignmentEmail.driverMailId ?? null,
                  driverTo: Array.isArray(driverAssignmentEmail.driverTo)
                    ? driverAssignmentEmail.driverTo
                    : [],
                  customerMailId: driverAssignmentEmail.customerMailId ?? null,
                  customerTo: Array.isArray(driverAssignmentEmail.customerTo)
                    ? driverAssignmentEmail.customerTo
                    : [],
                }
              : undefined,
            statusChange: statusChangeEmail
              ? {
                  sent: Boolean(statusChangeEmail.sent),
                  at: normalizeTimestamp(statusChangeEmail.at),
                  mailId: statusChangeEmail.mailId ?? null,
                  to: Array.isArray(statusChangeEmail.to) ? statusChangeEmail.to : [],
                }
              : undefined,
          },
          sms: {
            driverAssignment: smsNotifications.driverAssignment
              ? {
                  sent: Boolean(smsNotifications.driverAssignment.sent),
                  at: normalizeTimestamp(smsNotifications.driverAssignment.at),
                  to: smsNotifications.driverAssignment.to ?? null,
                }
              : undefined,
            statusChange: smsNotifications.statusChange
              ? {
                  sent: Boolean(smsNotifications.statusChange.sent),
                  at: normalizeTimestamp(smsNotifications.statusChange.at),
                  to: smsNotifications.statusChange.to ?? null,
                }
              : undefined,
          },
          push: {
            driverAssignment: pushNotifications.driverAssignment
              ? {
                  sent: Boolean(pushNotifications.driverAssignment.sent),
                  at: normalizeTimestamp(pushNotifications.driverAssignment.at),
                  target: pushNotifications.driverAssignment.target ?? null,
                }
              : undefined,
            statusChange: pushNotifications.statusChange
              ? {
                  sent: Boolean(pushNotifications.statusChange.sent),
                  at: normalizeTimestamp(pushNotifications.statusChange.at),
                  target: pushNotifications.statusChange.target ?? null,
                }
              : undefined,
          },
          statusChange: statusChangeMeta
            ? {
                status: statusChangeMeta.status ?? undefined,
                at: normalizeTimestamp(statusChangeMeta.at),
                actor:
                  statusChangeMeta.actor && typeof statusChangeMeta.actor === "object"
                    ? (statusChangeMeta.actor as BookingStatusActor)
                    : null,
                reasonCode:
                  typeof statusChangeMeta.reasonCode === "string"
                    ? statusChangeMeta.reasonCode
                    : null,
                reasonNote:
                  typeof statusChangeMeta.reasonNote === "string"
                    ? statusChangeMeta.reasonNote
                    : null,
              }
            : undefined,
        }
      : undefined;

  const pricingGuardrailRaw = guardrailsRaw.pricing;
  const pricingGuardrail =
    pricingGuardrailRaw && typeof pricingGuardrailRaw === "object"
      ? {
          reasonCode:
            typeof pricingGuardrailRaw.reasonCode === "string"
              ? pricingGuardrailRaw.reasonCode
              : null,
          reasonNote:
            typeof pricingGuardrailRaw.reasonNote === "string"
              ? pricingGuardrailRaw.reasonNote
              : null,
          additionalNote:
            typeof pricingGuardrailRaw.additionalNote === "string"
              ? pricingGuardrailRaw.additionalNote
              : null,
          currency:
            typeof pricingGuardrailRaw.currency === "string"
              ? pricingGuardrailRaw.currency
              : null,
          amounts:
            pricingGuardrailRaw.amounts && typeof pricingGuardrailRaw.amounts === "object"
              ? {
                  baseCents:
                    typeof (pricingGuardrailRaw.amounts as { baseCents?: unknown }).baseCents === "number"
                      ? (pricingGuardrailRaw.amounts as { baseCents?: number }).baseCents
                      : undefined,
                  gstCents:
                    typeof (pricingGuardrailRaw.amounts as { gstCents?: unknown }).gstCents === "number"
                      ? (pricingGuardrailRaw.amounts as { gstCents?: number }).gstCents
                      : undefined,
                  tipCents:
                    typeof (pricingGuardrailRaw.amounts as { tipCents?: unknown }).tipCents === "number"
                      ? (pricingGuardrailRaw.amounts as { tipCents?: number }).tipCents
                      : undefined,
                  totalCents:
                    typeof (pricingGuardrailRaw.amounts as { totalCents?: unknown }).totalCents === "number"
                      ? (pricingGuardrailRaw.amounts as { totalCents?: number }).totalCents
                      : undefined,
                }
              : undefined,
          submittedAt: normalizeTimestamp(pricingGuardrailRaw.submittedAt),
          submittedBy:
            pricingGuardrailRaw.submittedBy &&
            typeof pricingGuardrailRaw.submittedBy === "object"
              ? (pricingGuardrailRaw.submittedBy as BookingStatusActor)
              : null,
          secondApproval:
            pricingGuardrailRaw.secondApproval &&
            typeof pricingGuardrailRaw.secondApproval === "object"
              ? {
                  required: Boolean(pricingGuardrailRaw.secondApproval.required),
                  status:
                    pricingGuardrailRaw.secondApproval.status === "pending"
                      ? "pending"
                      : "approved",
                  approved: Boolean(pricingGuardrailRaw.secondApproval.approved),
                  requestedAt: normalizeTimestamp(pricingGuardrailRaw.secondApproval.requestedAt),
                  requestedBy:
                    pricingGuardrailRaw.secondApproval.requestedBy &&
                    typeof pricingGuardrailRaw.secondApproval.requestedBy === "object"
                      ? (pricingGuardrailRaw.secondApproval.requestedBy as BookingStatusActor)
                      : null,
                  approvedAt: normalizeTimestamp(pricingGuardrailRaw.secondApproval.approvedAt),
                  approver:
                    pricingGuardrailRaw.secondApproval.approver &&
                    typeof pricingGuardrailRaw.secondApproval.approver === "object"
                      ? (pricingGuardrailRaw.secondApproval.approver as BookingStatusActor)
                      : null,
                  reasonCode:
                    typeof pricingGuardrailRaw.secondApproval.reasonCode === "string"
                      ? pricingGuardrailRaw.secondApproval.reasonCode
                      : null,
                  reasonNote:
                    typeof pricingGuardrailRaw.secondApproval.reasonNote === "string"
                      ? pricingGuardrailRaw.secondApproval.reasonNote
                      : null,
                  additionalNote:
                    typeof pricingGuardrailRaw.secondApproval.additionalNote === "string"
                      ? pricingGuardrailRaw.secondApproval.additionalNote
                      : null,
                }
              : null,
        }
      : undefined;

  const guardrails = pricingGuardrail ? { pricing: pricingGuardrail } : undefined

  const quoteRequest =
    quoteRequestRaw && typeof quoteRequestRaw === "object"
      ? {
          id:
            typeof quoteRequestRaw.id === "string"
              ? (quoteRequestRaw.id as string)
              : null,
          approvedAmountCents:
            typeof quoteRequestRaw.approvedAmountCents === "number"
              ? (quoteRequestRaw.approvedAmountCents as number)
              : null,
          approvedAt: normalizeTimestamp(quoteRequestRaw.approvedAt),
          approvedBy:
            quoteRequestRaw.approvedBy && typeof quoteRequestRaw.approvedBy === "object"
              ? {
                  uid:
                    typeof (quoteRequestRaw.approvedBy as { uid?: unknown }).uid === "string"
                      ? ((quoteRequestRaw.approvedBy as { uid?: string }).uid as string)
                      : null,
                  email:
                    typeof (quoteRequestRaw.approvedBy as { email?: unknown }).email === "string"
                      ? ((quoteRequestRaw.approvedBy as { email?: string }).email as string)
                      : null,
                  displayName:
                    typeof (quoteRequestRaw.approvedBy as { displayName?: unknown }).displayName === "string"
                      ? ((quoteRequestRaw.approvedBy as { displayName?: string }).displayName as string)
                      : null,
                }
              : null,
        }
      : null

  const system =
    notifications || guardrails || quoteRequest
      ? {
          ...(notifications ? { notifications } : {}),
          ...(guardrails ? { guardrails } : {}),
          ...(quoteRequest ? { quoteRequest } : {}),
        }
      : undefined

  const pricingRaw = data.pricing
  let pricing: BookingItem["pricing"] = null
  if (pricingRaw && typeof pricingRaw === "object") {
    const record = pricingRaw as Record<string, unknown>
    const distanceRaw =
      record.distanceDetails && typeof record.distanceDetails === "object"
        ? (record.distanceDetails as Record<string, unknown>)
        : null
    const breakdownRaw =
      record.breakdown && typeof record.breakdown === "object"
        ? (record.breakdown as Record<string, unknown>)
        : null

    pricing = {
      baseRate: typeof record.baseRate === "number" ? (record.baseRate as number) : null,
      vehicleKey: typeof record.vehicleKey === "string" ? (record.vehicleKey as string) : null,
      distanceDetails: distanceRaw
        ? {
            km: typeof distanceRaw.km === "number" ? (distanceRaw.km as number) : null,
            durationMinutes:
              typeof distanceRaw.durationMinutes === "number"
                ? (distanceRaw.durationMinutes as number)
                : null,
          }
        : null,
      breakdown: breakdownRaw
        ? {
            baseFare:
              typeof breakdownRaw.baseFare === "number" ? (breakdownRaw.baseFare as number) : null,
            additionalPassengerCharge:
              typeof breakdownRaw.additionalPassengerCharge === "number"
                ? (breakdownRaw.additionalPassengerCharge as number)
                : null,
            distanceCharge:
              typeof breakdownRaw.distanceCharge === "number"
                ? (breakdownRaw.distanceCharge as number)
                : null,
            extraKilometerCharge:
              typeof breakdownRaw.extraKilometerCharge === "number"
                ? (breakdownRaw.extraKilometerCharge as number)
                : null,
            total:
              typeof breakdownRaw.total === "number" ? (breakdownRaw.total as number) : null,
          }
        : null,
    }
  }

  return {
    id: doc.id,
    status: typeof data.status === "string" ? data.status : undefined,
    bookingNumber: typeof data.bookingNumber === "number" ? data.bookingNumber : null,
    trip: (data.trip as BookingItem["trip"]) ?? {},
    schedule: {
      ...(schedule as BookingItem["schedule"]),
      pickupTimestamp: normalizeTimestamp(schedule.pickupTimestamp),
      returnPickupTimestamp: normalizeTimestamp(schedule.returnPickupTimestamp),
    },
    passenger: (data.passenger as BookingItem["passenger"]) ?? {},
    payment,
    assignment: {
      ...(assignment as BookingItem["assignment"]),
      assignedAt: normalizeTimestamp(assignment.assignedAt),
    },
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
    statusHistory: normalizeStatusHistory(data.statusHistory),
    paymentLink:
      typeof data.payment?.link === "string"
        ? (data.payment.link as string)
        : typeof data.paymentLink === "string"
          ? (data.paymentLink as string)
          : null,
    pricing,
    system,
  }
}

export const formatFare = (cents?: number | null, currency = "CAD") => {
  if (cents == null) return "TBD"
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export const scopeLabel = (scope?: BookingScope) => {
  switch (scope) {
    case "past":
      return "Past Rides"
    case "all":
      return "All Bookings"
    default:
      return "Upcoming Rides"
  }
}

export interface RealtimeBookingsParams {
  scope?: BookingScope
  status?: string
  limit: number
  enabled?: Booleanish
}

export interface RealtimeBookingsState {
  bookings: BookingItem[]
  loading: boolean
  refreshing: boolean
  error: Error | null
  hasMore: boolean
  refresh: () => void
}

const DEFAULT_LIMIT = 20

export const useRealtimeBookings = ({
  scope = "upcoming",
  status,
  limit,
  enabled = true,
}: RealtimeBookingsParams): RealtimeBookingsState => {
  const auth = useAuth()
  const firebase = useFirebase()
  const rolesSet = useMemo(() => new Set(auth.roles), [auth.roles])
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => {
    setRefreshing(true)
    setRefreshToken((token) => token + 1)
  }, [])

  useEffect(() => {
    const firestore = firebase.firestore
    const canQuery =
      Boolean(enabled) && firebase.enabled && firestore && auth.user && auth.user.uid

    if (!canQuery) {
      setBookings([])
      setLoading(false)
      setRefreshing(false)
      setError(null)
      setHasMore(false)
      return
    }

    let unsubscribed = false
    setLoading(true)
    setError(null)

    const constraints: QueryConstraint[] = []
    const direction = scope === "past" ? "desc" : "asc"
    const now = Timestamp.now()
    const effectiveLimit = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_LIMIT)

    if (scope === "upcoming") {
      constraints.push(where("schedule.pickupTimestamp", ">=", now))
    } else if (scope === "past") {
      constraints.push(
        or(
          where("schedule.pickupTimestamp", "<", now),
          where("status", "==", "cancelled"),
        ),
      )
    }

    const isAdmin = rolesSet.has("admin")
    const isDriver = rolesSet.has("driver")

    if (isDriver && !isAdmin) {
      constraints.push(where("assignment.driverId", "==", auth.user!.uid))
    }

    constraints.push(orderBy("schedule.pickupTimestamp", direction))
    constraints.push(orderBy(documentId()))
    constraints.push(limitFn(effectiveLimit + 1))

    const collectionRef = isAdmin || isDriver
      ? collection(firestore!, "bookings")
      : collection(firestore!, "customers", auth.user!.uid, "bookings")
    const q = query(collectionRef, ...constraints)

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (unsubscribed) return
        const docs = snapshot.docs
        const mapped = docs.map(mapBookingDoc)
        const filtered = status ? mapped.filter((booking) => booking.status === status) : mapped
        const scoped =
          scope === "upcoming"
            ? filtered.filter((booking) => booking.status !== "cancelled")
            : filtered
        const sliced = scoped.slice(0, effectiveLimit)
        const hasMoreResults = scoped.length > effectiveLimit

        setBookings(sliced)
        setHasMore(hasMoreResults)
        setLoading(false)
        setRefreshing(false)
        setError(null)
      },
      (snapshotError) => {
        if (unsubscribed) return
        console.error("[Bookings] realtime query failed", {
          code: (snapshotError as { code?: unknown })?.code,
          message: snapshotError instanceof Error ? snapshotError.message : snapshotError,
        })
        setError(snapshotError)
        setLoading(false)
        setRefreshing(false)
      },
    )

    return () => {
      unsubscribed = true
      unsubscribe()
    }
  }, [
    auth.user,
    auth.user?.uid,
    auth.user?.email,
    auth.user?.phoneNumber,
    enabled,
    firebase.enabled,
    firebase.firestore,
    limit,
    refreshToken,
    scope,
    status,
    rolesSet,
  ])

  return {
    bookings,
    loading,
    refreshing,
    error,
    hasMore,
    refresh,
  }
}

export interface AssignDriverPayload {
  bookingIds: string[]
  driverId?: string
  driverName?: string | null
  driverIds?: string[]
  driverContact?: {
    phone?: string | null
    email?: string | null
    calendarId?: string | null
  }
  notify?: {
    email?: boolean
    sms?: boolean
    push?: boolean
  }
}

export interface UpdateBookingStatusPayload {
  bookingId: string
  status: string
  note?: string | null
  reasonCode?: string | null
  reasonNote?: string | null
  notify?: {
    email?: boolean
    sms?: boolean
    push?: boolean
  }
}

export interface SendBulkBookingSmsPayload {
  bookingIds: string[]
  message: string
  recipient?: "passenger" | "driver" | "both"
}

const assignDriverRequest = (payload: AssignDriverPayload) =>
  callFunction<{ ok: boolean }>(ASSIGN_DRIVER_ENDPOINT, {
    method: "POST",
    auth: true,
    body: payload,
  })

const updateBookingStatusRequest = (payload: UpdateBookingStatusPayload) =>
  callFunction<{ ok: boolean }>(UPDATE_BOOKING_STATUS_ENDPOINT, {
    method: "POST",
    auth: true,
    body: payload,
  })

export const useAssignDriver = () =>
  useMutation({
    mutationFn: assignDriverRequest,
  })

export const useUpdateBookingStatus = () =>
  useMutation({
    mutationFn: updateBookingStatusRequest,
  })

export const useResendBookingConfirmation = () =>
  useMutation({
    mutationFn: (bookingId: string) =>
      callFunction<{ ok: boolean }>("resendBookingConfirmation", {
        method: "POST",
        auth: true,
        body: { bookingId },
      }),
  })

export const useUpdateBookingPricing = () =>
  useMutation({
    mutationFn: (payload: {
      bookingId: string
      baseCents: number
      gstCents: number
      tipCents: number
      totalCents: number
      reasonCode: string
      reasonNote?: string | null
      note?: string | null
      requireSecondApproval?: boolean
      secondApprover?: { uid: string; name?: string | null } | null
    }) =>
      callFunction<{ ok: boolean }>(UPDATE_BOOKING_PRICING_ENDPOINT, {
        method: "POST",
        auth: true,
        body: payload,
      }),
  })

export const useSendBulkBookingSms = () =>
  useMutation({
    mutationFn: (payload: SendBulkBookingSmsPayload) =>
      callFunction<{ ok: boolean; totalRecipients: number }>(SEND_BULK_BOOKING_SMS_ENDPOINT, {
        method: "POST",
        auth: true,
        body: payload,
      }),
  })
