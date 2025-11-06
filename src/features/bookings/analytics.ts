import { differenceInMinutes } from "date-fns"
import type { BookingItem } from "@/features/bookings/types"

export type OpsAlertSeverity = "info" | "warning" | "critical"

export interface OpsAlert {
  id: string
  severity: OpsAlertSeverity
  message: string
}

export interface OpsAnalytics {
  total: number
  completed: number
  completionRate: number
  onTimePercent: number | null
  awaitingAssignment: number
  awaitingPayment: number
  cancelled: number
  urgentUnassigned: number
  backlog: number
  upcomingWithin24h: number
  alerts: OpsAlert[]
}

const HOURS_1 = 60
const HOURS_2 = 120
const HOURS_24 = 24 * 60
const HOURS_168 = 7 * 24 * 60
const ON_TIME_THRESHOLD_MINUTES = 15

const relevantStatuses = new Set([
  "pending",
  "awaiting_payment",
  "confirmed",
  "assigned",
  "en_route",
  "arrived",
  "on_trip",
  "completed",
])

const safeNumber = (value: unknown) => (typeof value === "number" ? value : null)

const getPickupDate = (booking: BookingItem): Date | null => {
  const timestamp = safeNumber(booking.schedule?.pickupTimestamp)
  if (timestamp != null) {
    return new Date(timestamp)
  }

  const pickupDate = booking.schedule?.pickupDate
  if (!pickupDate) return null
  const pickupTime = booking.schedule?.pickupTime ?? "00:00"
  const candidate = new Date(`${pickupDate}T${pickupTime}:00`)
  return Number.isNaN(candidate.getTime()) ? null : candidate
}

const getStatusTimestamp = (booking: BookingItem, status: string): number | null => {
  if (!Array.isArray(booking.statusHistory)) return null
  for (let index = booking.statusHistory.length - 1; index >= 0; index -= 1) {
    const entry = booking.statusHistory[index]
    if (entry?.status === status && entry.timestamp != null) {
      return entry.timestamp
    }
  }
  return null
}

const isCompletedOnTime = (booking: BookingItem, pickup: Date | null): boolean | null => {
  if (!pickup) return null
  const completedAt = getStatusTimestamp(booking, "completed")
  if (completedAt == null) return null
  const diffMinutes = differenceInMinutes(new Date(completedAt), pickup)
  return diffMinutes <= ON_TIME_THRESHOLD_MINUTES
}

const isAwaitingAssignment = (booking: BookingItem) => {
  const status = booking.status ?? "pending"
  if (!relevantStatuses.has(status)) return false
  return !booking.assignment?.driverId
}

export const deriveOpsAnalytics = (
  bookings: BookingItem[],
  now: Date = new Date(),
): OpsAnalytics => {
  const total = bookings.length
  const completedBookings = bookings.filter((booking) => booking.status === "completed")
  let onTimeCount = 0
  let withTimingCount = 0

  completedBookings.forEach((booking) => {
    const pickup = getPickupDate(booking)
    const result = isCompletedOnTime(booking, pickup)
    if (result != null) {
      withTimingCount += 1
      if (result) onTimeCount += 1
    }
  })

  const onTimePercent =
    withTimingCount === 0 ? null : Math.round((onTimeCount / withTimingCount) * 100)

  const awaitingPayment = bookings.filter((booking) => booking.status === "awaiting_payment").length
  const cancelled = bookings.filter((booking) => booking.status === "cancelled").length

  let awaitingAssignment = 0
  let urgentUnassigned = 0
  let backlog = 0
  let upcomingWithin24h = 0

  bookings.forEach((booking) => {
    const pickup = getPickupDate(booking)
    if (!pickup) return
    const diff = differenceInMinutes(pickup, now)
    if (diff < -HOURS_24) return

    const awaiting = isAwaitingAssignment(booking)

    if (diff <= HOURS_24 && diff >= 0) {
      upcomingWithin24h += 1
      if (awaiting) {
        awaitingAssignment += 1
        if (diff <= HOURS_2) {
          urgentUnassigned += 1
        }
      }
    } else if (diff > HOURS_24 && diff <= HOURS_168) {
      if (awaiting) backlog += 1
    } else if (diff < 0 && diff >= -HOURS_1 && awaiting) {
      urgentUnassigned += 1
    } else if (awaiting && diff >= 0) {
      awaitingAssignment += 1
    }
  })

  const completionRate =
    total === 0 ? 0 : Math.round((completedBookings.length / total) * 100)

  const alerts: OpsAlert[] = []

  if (urgentUnassigned > 0) {
    alerts.push({
      id: "urgent-unassigned",
      severity: urgentUnassigned >= 3 ? "critical" : "warning",
      message: `${urgentUnassigned} ride${urgentUnassigned === 1 ? "" : "s"} need a driver within 2 hours.`,
    })
  }

  if (awaitingPayment > 0) {
    alerts.push({
      id: "awaiting-payment",
      severity: awaitingPayment >= 5 ? "warning" : "info",
      message: `${awaitingPayment} booking${awaitingPayment === 1 ? "" : "s"} waiting on payment.`,
    })
  }

  if (backlog > 0) {
    alerts.push({
      id: "backlog",
      severity: backlog >= 10 ? "warning" : "info",
      message: `${backlog} future booking${backlog === 1 ? "" : "s"} still unassigned.`,
    })
  }

  if (alerts.length === 0 && onTimePercent != null && onTimePercent < 90) {
    alerts.push({
      id: "on-time",
      severity: "warning",
      message: `On-time performance at ${onTimePercent}%. Investigate delays.`,
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-clear",
      severity: "info",
      message: "All KPIs tracking within targets.",
    })
  }

  return {
    total,
    completed: completedBookings.length,
    completionRate,
    onTimePercent,
    awaitingAssignment,
    awaitingPayment,
    cancelled,
    urgentUnassigned,
    backlog,
    upcomingWithin24h,
    alerts,
  }
}
