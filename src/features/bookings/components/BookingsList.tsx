import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { FirebaseError } from "firebase/app"
import { format, formatDistanceToNow } from "date-fns"
import { clsx } from "clsx"
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Share2,
  Timer,
  User2,
  Waypoints,
} from "lucide-react"
import { EmptyState, ErrorBanner, SkeletonCard } from "@/components/ui/Feedback"
import { useAuth } from "@/lib/hooks/useAuth"
import {
  formatFare,
  scopeLabel,
  useRealtimeBookings,
} from "@/features/bookings/hooks"
import type { BookingItem, BookingScope } from "@/features/bookings/types"
import { summarizeVehicleSelections } from "@/features/booking/vehicleOptions"
import { getLocationMetadata } from "@/data/locationDirectory"

export type BookingStatusActionTone = "primary" | "secondary" | "warning" | "success" | "danger"

export interface BookingStatusAction {
  label: string
  value: string
  tone?: BookingStatusActionTone
  disabled?: boolean
  tooltip?: string
}

export interface BookingsListProps {
  scope?: BookingScope
  status?: string
  title?: string
  subtitle?: string
  customerMode?: boolean
  emptyTitle?: string
  emptyDescription?: string
  limitOptions?: number[]
  initialLimit?: number
  showLimitPicker?: boolean
  extraControls?: ReactNode
  footer?: ReactNode
  onAssignDriver?: (booking: BookingItem) => void
  assignLabel?: string
  onData?: (bookings: BookingItem[]) => void
  selectable?: boolean
  selectedIds?: Set<string> | string[]
  onSelectionChange?: (booking: BookingItem, selected: boolean) => void
  statusActions?: BookingStatusAction[]
  getStatusActions?: (booking: BookingItem) => BookingStatusAction[] | undefined
  onStatusAction?: (booking: BookingItem, action: BookingStatusAction) => void
  filterFn?: (booking: BookingItem) => boolean
  renderBookingActions?: (booking: BookingItem) => ReactNode
  conflictReasons?: Record<string, string>
  slaTimers?: Record<string, SlaTimerInfo>
  onRefreshReady?: (refresh: () => void) => void
}

const DEFAULT_LIMIT_OPTIONS = [10, 20]
const ACTIVITY_PAGE_SIZE = 3

type SlaTimerInfo = {
  diffMinutes: number
  overdue: boolean
}

export const BookingsList = ({
  scope = "upcoming",
  status,
  title = "Bookings",
  subtitle,
  emptyTitle = "No bookings found",
  emptyDescription,
  limitOptions = DEFAULT_LIMIT_OPTIONS,
  initialLimit = 10,
  showLimitPicker = true,
  extraControls,
  footer,
  onAssignDriver,
  assignLabel = "Assign driver",
  onData,
  selectable = false,
  selectedIds,
  onSelectionChange,
  statusActions,
  getStatusActions,
  onStatusAction,
  filterFn,
  renderBookingActions,
  conflictReasons,
  slaTimers,
  onRefreshReady,
  customerMode = false,
}: BookingsListProps) => {
  const auth = useAuth()
  const { location } = useRouterState()
  const [selectedLimit, setSelectedLimit] = useState(initialLimit)
  const pageIncrement = limitOptions?.[0] ?? initialLimit ?? 10
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedLimit(initialLimit)
  }, [scope, status, initialLimit])

  useEffect(() => {
    setExpandedId(null)
  }, [scope, status])

  const canFetch = Boolean(auth.user)
  const {
    bookings,
    loading,
    refreshing,
    error,
    hasMore,
    refresh,
  } = useRealtimeBookings({
    scope,
    status,
    limit: selectedLimit,
    enabled: canFetch,
  })

  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(refresh)
    }
  }, [onRefreshReady, refresh])

  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(refresh)
    }
  }, [onRefreshReady, refresh])

  useEffect(() => {
    if (onData) {
      onData(bookings)
    }
  }, [bookings, onData])

  const selectedSet = useMemo(() => {
    if (!selectable || !selectedIds) return new Set<string>()
    if (selectedIds instanceof Set) return selectedIds
    return new Set(selectedIds)
  }, [selectable, selectedIds])

  const visibleBookings = useMemo(
    () => (filterFn ? bookings.filter(filterFn) : bookings),
    [bookings, filterFn],
  )

  const lastSelectedIndexRef = useRef<number | null>(null)

  const handleSelectionToggle = useCallback(
    (
      booking: BookingItem,
      index: number,
      nextSelected: boolean,
      event?: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      if (!selectable || !onSelectionChange) return
      if (event?.shiftKey && lastSelectedIndexRef.current != null) {
        const start = Math.min(lastSelectedIndexRef.current, index)
        const end = Math.max(lastSelectedIndexRef.current, index)
        for (let i = start; i <= end; i += 1) {
          const target = visibleBookings[i]
          if (!target) continue
          onSelectionChange(target, nextSelected)
        }
      } else {
        onSelectionChange?.(booking, nextSelected)
      }
      lastSelectedIndexRef.current = index
    },
    [onSelectionChange, selectable, visibleBookings],
  )

  const isInitialLoading = loading && bookings.length === 0
  const isEmpty = !isInitialLoading && visibleBookings.length === 0 && !error
  const permissionDenied =
    error instanceof FirebaseError && error.code === "permission-denied"
  const lookupError = error?.message === "NO_LOOKUP_KEYS"
  const transientAuthError =
    error instanceof FirebaseError && (error.code === "failed-precondition" || error.code === "unavailable")

  const limitPicker = showLimitPicker ? (
    <label className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-midnight/60">
      View
      <select
        value={selectedLimit}
        onChange={(event) => setSelectedLimit(Number(event.target.value))}
        className="rounded-full border border-horizon/20 bg-white/80 px-3 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-midnight/70 focus:border-horizon focus:outline-none"
      >
        {limitOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  ) : null

  if (!auth.user) {
    return (
      <section className="flex flex-col gap-4">
        <BookingsHeader
          title={title}
          subtitle={subtitle ?? "Sign in to see your recent rides and assignments."}
          controls={
            <div className="flex items-center gap-3">
              {extraControls}
              {limitPicker}
            </div>
          }
        />
        <EmptyState
          title="Sign in required"
          description="Once you’re signed in, this dashboard shows live booking data tailored to your role."
        />
        {footer}
      </section>
    )
  }

  const unauthorized = permissionDenied || lookupError

  return (
    <section className="flex flex-col gap-4">
      <BookingsHeader
        title={title}
        subtitle={subtitle ?? scopeLabel(scope)}
        controls={
          <div className="flex items-center gap-3">
            {extraControls}
            {limitPicker}
            <button
              className="va-button va-button--subtle px-4 py-[0.55rem]"
              onClick={() => refresh()}
              disabled={refreshing}
              type="button"
            >
              {refreshing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Refreshing
                </>
              ) : (
                "Refresh"
              )}
            </button>
          </div>
        }
      />

      {error && !unauthorized ? (
        <ErrorBanner
          title="We couldn’t load bookings"
          message={
            error.message ||
            "Please try again or contact support if the issue continues."
          }
        />
      ) : null}

      {unauthorized && !transientAuthError ? (
        <EmptyState
          title="Access required"
          description={`You're signed in as ${auth.user?.email ?? "this account"}, but you don't have permission to view these bookings.${error ? ` (Error: ${(error as { code?: string })?.code ?? error.message ?? "unknown"})` : ""}`}
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href="mailto:info@valleyairporter.ca?subject=Portal access request"
                className="va-button va-button--secondary px-5 py-[0.6rem]"
              >
                Request access
              </a>
              <Link
                to="/auth"
                search={{ redirect: `${location.pathname}${location.search ?? ""}${location.hash ?? ""}` }}
                className="va-button va-button--ghost px-5 py-[0.6rem]"
              >
                Switch account
              </Link>
            </div>
          }
        />
      ) : null}

      {transientAuthError ? (
        <EmptyState
          title="Temporarily unavailable"
          description="We couldn't reach the bookings service. Please try again in a moment."
          action={
            <button
              className="va-button va-button--secondary px-5 py-[0.6rem]"
              onClick={() => refresh()}
              type="button"
            >
              Retry
            </button>
          }
        />
      ) : null}

      {isInitialLoading && !transientAuthError ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} lines={4} />
          ))}
        </div>
      ) : null}

      {!isInitialLoading && !unauthorized && !transientAuthError ? (
        <>
          {isEmpty ? (
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={
                <Link to="/booking" className="va-button va-button--primary px-5 py-[0.6rem]">
                  Book a ride
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
          {visibleBookings.map((booking, index) => {
            const resolvedStatusActions =
              getStatusActions?.(booking) ?? statusActions ?? []
            const isSelected = selectedSet.has(booking.id)
            const conflictReason = conflictReasons?.[booking.id]
            const slaTimer = slaTimers?.[booking.id]
            const expanded = expandedId === booking.id
            return (
              <BookingCard
                key={booking.id}
                booking={booking}
                expanded={expanded}
                onToggle={() =>
                  setExpandedId((current) => (current === booking.id ? null : booking.id))
                }
                position={index + 1}
                onAssignDriver={onAssignDriver}
                assignLabel={assignLabel}
                selectable={selectable}
                selected={isSelected}
                onSelectionToggle={
                  selectable && onSelectionChange
                    ? (selected, event) =>
                        handleSelectionToggle(booking, index, selected, event)
                    : undefined
                }
                statusActions={resolvedStatusActions}
                onStatusAction={
                  resolvedStatusActions.length && onStatusAction
                    ? (action) => onStatusAction(booking, action)
                    : undefined
                }
                renderActions={renderBookingActions}
                conflictReason={conflictReason}
                slaTimer={slaTimer}
                customerMode={customerMode}
              />
            )
          })}
            </div>
          )}

          {hasMore ? (
            <div className="flex justify-center">
              <button
                className="va-button va-button--secondary px-6 py-3"
                onClick={() =>
                  setSelectedLimit((current) => current + pageIncrement)
                }
                type="button"
              >
                Load more
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {footer}
    </section>
  )
}

const BookingsHeader = ({
  title,
  subtitle,
  controls,
}: {
  title: string
  subtitle?: string
  controls?: ReactNode
}) => (
  <header className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 className="font-heading text-xs uppercase tracking-[0.32em] text-horizon/80">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1 text-sm text-midnight/70">{subtitle}</p>
      ) : null}
    </div>
    {controls ? <div className="flex items-center gap-3">{controls}</div> : null}
  </header>
)

const statusTone: Record<string, string> = {
  confirmed: "border-emerald-300 bg-emerald-50 text-emerald-700",
  pending: "border-amber-300 bg-amber-50 text-amber-700",
  awaiting_payment: "border-sky-300 bg-sky-50 text-sky-700",
  cancelled: "border-rose-300 bg-rose-50 text-rose-700",
  completed: "border-horizon/30 bg-white text-horizon",
  assigned: "border-horizon/30 bg-white text-horizon",
  en_route: "border-sky/50 bg-sky/20 text-horizon",
  arrived: "border-glacier/60 bg-white text-horizon",
  on_trip: "border-horizon/30 bg-white text-horizon",
}

const getStatusTone = (status?: string) => {
  if (!status) return "border-horizon/20 bg-white/80 text-horizon"
  return statusTone[status] ?? "border-horizon/20 bg-white/80 text-horizon"
}

const resolveLocationDisplay = (
  label: string | null | undefined,
  address: string | null | undefined,
  fallback: string,
) => {
  const trimmedLabel = label?.trim() ?? ""
  const trimmedAddress = address?.trim() ?? ""
  if (trimmedLabel) {
    const metadata = getLocationMetadata(trimmedLabel)
    if (metadata) {
      return `${trimmedLabel} (${metadata.formattedAddress})`
    }
  }
  if (trimmedAddress) return trimmedAddress
  if (trimmedLabel) return trimmedLabel
  return fallback
}

const formatPickup = (booking: BookingItem) => {
  const { schedule } = booking

  const pickupDate =
    typeof schedule.pickupTimestamp === "number"
      ? new Date(schedule.pickupTimestamp)
      : schedule.pickupDate
        ? new Date(`${schedule.pickupDate}T${schedule.pickupTime ?? "00:00"}:00`)
        : null

  if (!pickupDate || Number.isNaN(pickupDate.getTime())) {
    return {
      label: "Pickup time pending",
      relative: null,
    }
  }

  return {
    label: format(pickupDate, "EEE, MMM d • h:mm a"),
    relative: formatDistanceToNow(pickupDate, { addSuffix: true }),
  }
}

const formatReturn = (booking: BookingItem) => {
  const { schedule } = booking
  const returnTimestamp =
    typeof schedule.returnPickupTimestamp === "number"
      ? new Date(schedule.returnPickupTimestamp)
      : schedule.returnPickupDate
        ? new Date(`${schedule.returnPickupDate}T${schedule.returnPickupTime ?? "00:00"}:00`)
        : null

  if (!returnTimestamp || Number.isNaN(returnTimestamp.getTime())) {
    return null
  }

  return format(returnTimestamp, "EEE, MMM d • h:mm a")
}

const computeCountdownLabel = (target: Date, nowTs: number) => {
  const diffMs = target.getTime() - nowTs
  if (Number.isNaN(diffMs)) return null
  if (diffMs <= 0) return "Now"
  const diffMinutes = Math.round(diffMs / 60000)
  if (diffMinutes < 1) return "<1m"
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  if (hours >= 48) {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}d${remainingHours ? ` ${remainingHours}h` : ""}`
  }
  if (hours >= 1) {
    return `${hours}h${minutes ? ` ${minutes}m` : ""}`
  }
  return `${minutes}m`
}

const formatCalendarTimestamp = (date: Date) => {
  const iso = date.toISOString()
  return iso.replace(/[-:]/g, "").split(".")[0] + "Z"
}

const actionToneStyles: Record<BookingStatusActionTone, string> = {
  primary: "va-button va-button--primary px-4 py-[0.55rem]",
  secondary: "va-button va-button--secondary px-4 py-[0.55rem]",
  success: "va-button va-button--secondary border-sky/40 text-horizon px-4 py-[0.55rem]",
  warning: "va-button va-button--secondary border-slate/40 text-slate px-4 py-[0.55rem]",
  danger: "va-button va-button--danger px-4 py-[0.55rem]",
}

const BookingCard = ({
  booking,
  expanded = false,
  onToggle,
  onAssignDriver,
  assignLabel,
  selectable,
  selected,
  onSelectionToggle,
  statusActions,
  onStatusAction,
  renderActions,
  conflictReason,
  slaTimer,
  customerMode = false,
  position,
}: {
  booking: BookingItem
  expanded?: boolean
  onToggle?: () => void
  onAssignDriver?: (booking: BookingItem) => void
  assignLabel: string
  selectable?: boolean
  selected?: boolean
  onSelectionToggle?: (selected: boolean, event?: ReactMouseEvent<HTMLButtonElement>) => void
  statusActions?: BookingStatusAction[]
  onStatusAction?: (action: BookingStatusAction) => void
  renderActions?: (booking: BookingItem) => ReactNode
  conflictReason?: string
  slaTimer?: SlaTimerInfo
  customerMode?: boolean
  position?: number
}) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (typeof window === "undefined") return
    const interval = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(interval)
  }, [])

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  useEffect(() => {
    if (!copiedKey) return
    if (typeof window === "undefined") return
    const timeout = window.setTimeout(() => setCopiedKey(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [copiedKey])

  const [activityPage, setActivityPage] = useState(0)
  useEffect(() => {
    setActivityPage(0)
  }, [booking.id])

  const pickup = formatPickup(booking)
  const returnLabel = formatReturn(booking)
  const totalFare = formatFare(booking.payment?.totalCents, booking.payment?.currency ?? "CAD")
  const paxCount = booking.trip?.passengerCount
  const assignedAt =
    typeof booking.assignment?.assignedAt === "number"
      ? new Date(booking.assignment.assignedAt)
      : null
  const assignmentLines = [
    booking.assignment?.driverName ?? "Unassigned",
    booking.assignment?.driverId ? `Driver ID ${booking.assignment.driverId}` : "",
    assignedAt ? `Assigned ${formatDistanceToNow(assignedAt, { addSuffix: true })}` : "",
  ].filter((line) => line && line.trim().length > 0)

  const bookingNumber = typeof booking.bookingNumber === "number" ? booking.bookingNumber : null
  const tipCents =
    typeof booking.payment?.tipCents === "number"
      ? booking.payment?.tipCents
      : typeof (booking.payment as Record<string, unknown>)?.tipAmountCents === "number"
        ? ((booking.payment as Record<string, number>).tipAmountCents ?? 0)
        : 0
  const tipDisplay = tipCents > 0 ? formatFare(tipCents, booking.payment?.currency ?? "CAD") : "—"
  const paymentMethod =
    booking.payment?.preference === "pay_now" ? "Pay Now (online)" : "Pay on Arrival"
  const transferType = booking.trip?.includeReturn ? "Return" : "One Way"
  const createdAt =
    typeof booking.createdAt === "number" ? new Date(booking.createdAt) : null
  const bookedOnDisplay = createdAt ? format(createdAt, "PPP • p") : null
  const originDisplay = resolveLocationDisplay(
    booking.trip?.origin ?? null,
    booking.trip?.originAddress ?? null,
    "Origin TBD",
  )
  const destinationDisplay = resolveLocationDisplay(
    booking.trip?.destination ?? null,
    booking.trip?.destinationAddress ?? null,
    "Destination TBD",
  )
  const flightNumber =
    booking.schedule?.flightNumber && booking.schedule.flightNumber.trim().length > 0
      ? booking.schedule.flightNumber
      : null
  const baggageLabel =
    booking.passenger?.baggage && booking.passenger.baggage.trim().length > 0
      ? booking.passenger.baggage.trim()
      : "Normal"
  const specialNotesLabel =
    booking.passenger?.specialNotes && booking.passenger.specialNotes.trim().length > 0
      ? booking.passenger.specialNotes.trim()
      : "None"
  const paymentPreference = booking.payment?.preference
  const canSwitchToOnline = paymentPreference === "pay_on_arrival"
  const paidStatus = paymentPreference === "pay_now"
    ? booking.payment?.link ? "Unpaid" : "Paid"
    : booking.payment?.link ? "Unpaid" : "Pending"
  const bookingOptionsSearch = {
    payment: paymentPreference ?? undefined,
    canSwitchToOnline,
    bookingNumber: bookingNumber ?? undefined,
    status: booking.status ?? undefined,
    passengerName: booking.passenger?.primaryPassenger ?? undefined,
  } as const
  const positionLabel = customerMode && typeof position === "number" ? `${position}.` : null
  const distanceKm =
    typeof booking.pricing?.distanceDetails?.km === "number"
      ? (booking.pricing.distanceDetails?.km as number)
      : null
  const driveMinutes =
    typeof booking.pricing?.distanceDetails?.durationMinutes === "number"
      ? (booking.pricing.distanceDetails?.durationMinutes as number)
      : null
  const distanceLine =
    distanceKm != null
      ? `Distance: ${distanceKm.toFixed(1)} km${driveMinutes ? ` • ~${Math.round(driveMinutes)} min drive` : ""}`
      : null
  const vehicleSummary = summarizeVehicleSelections(booking.trip?.vehicleSelections)
  const pickupDateTime =
    typeof booking.schedule?.pickupTimestamp === "number"
      ? new Date(booking.schedule.pickupTimestamp)
      : booking.schedule?.pickupDate
        ? new Date(`${booking.schedule.pickupDate}T${booking.schedule.pickupTime ?? "00:00"}:00`)
        : null
  const countdownLabel =
    pickupDateTime && !Number.isNaN(pickupDateTime.getTime())
      ? computeCountdownLabel(pickupDateTime, now)
      : null
  const calendarLinks = useMemo(() => {
    if (!customerMode) return null
    if (!pickupDateTime || Number.isNaN(pickupDateTime.getTime())) return null
    const endEstimate = new Date(
      pickupDateTime.getTime() + (driveMinutes != null ? driveMinutes : 90) * 60000,
    )
    const startStamp = formatCalendarTimestamp(pickupDateTime)
    const endStamp = formatCalendarTimestamp(endEstimate)
    const eventTitle = `Valley Airporter • ${originDisplay} → ${destinationDisplay}`
    const descriptionParts = [
      `Booking ID: ${booking.id}`,
      bookingNumber ? `Form #: ${bookingNumber}` : null,
      `Pickup: ${originDisplay}`,
      `Drop-off: ${destinationDisplay}`,
      paxCount ? `Passengers: ${paxCount}` : null,
      totalFare ? `Fare: ${totalFare}` : null,
    ].filter(Boolean) as string[]
    const description = descriptionParts.join("\\n")
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      eventTitle,
    )}&dates=${startStamp}/${endStamp}&details=${encodeURIComponent(
      description,
    )}&location=${encodeURIComponent(destinationDisplay ?? "")}`
    const nowStamp = formatCalendarTimestamp(new Date())
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Valley Airporter//Customer Portal//EN",
      "BEGIN:VEVENT",
      `UID:${booking.id}@valleyairporter`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${startStamp}`,
      `DTEND:${endStamp}`,
      `SUMMARY:${eventTitle}`,
      `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
      `LOCATION:${destinationDisplay ?? ""}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")
    const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`
    return { googleUrl, icsHref }
  }, [
    customerMode,
    pickupDateTime ? pickupDateTime.toISOString() : null,
    driveMinutes,
    originDisplay,
    destinationDisplay,
    booking.id,
    bookingNumber,
    paxCount,
    totalFare,
  ])
  const shareSummary = useMemo(() => {
    if (!customerMode) return null
    const pickupLabel =
      pickupDateTime && !Number.isNaN(pickupDateTime.getTime())
        ? format(pickupDateTime, "EEE, MMM d • h:mm a")
        : "Pickup time pending"
    const lines = [
      "Valley Airporter ride details",
      `Booking: ${bookingNumber ? `Form #${bookingNumber}` : booking.id}`,
      `Pickup: ${pickupLabel}`,
      `Route: ${originDisplay} \u2192 ${destinationDisplay}`,
      totalFare ? `Fare: ${totalFare}` : null,
    ].filter(Boolean)
    return lines.join("\n")
  }, [
    customerMode,
    booking.id,
    bookingNumber,
    originDisplay,
    destinationDisplay,
    totalFare,
    pickupDateTime ? pickupDateTime.toISOString() : null,
  ])
  const handleShareTrip = useCallback(async () => {
    if (!customerMode || !shareSummary) return
    const title = bookingNumber ? `Form #${bookingNumber}` : `Booking ${booking.id}`
    const shareData = {
      title: `Valley Airporter ${title}`,
      text: shareSummary,
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData)
        return
      } catch {
        // User cancelled or share failed, fallback to clipboard
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareSummary)
        setCopiedKey("share")
      } catch {
        // ignore clipboard errors
      }
    }
  }, [booking.id, bookingNumber, customerMode, shareSummary])
  const handleCopy = useCallback(
    async (text: string, key: string) => {
      if (typeof navigator === "undefined" || !navigator.clipboard) return
      try {
        await navigator.clipboard.writeText(text)
        setCopiedKey(key)
      } catch {
        // ignore clipboard errors
      }
    },
    [],
  )
  const renderAddressLine = useCallback(
    (label: string, value: string | null | undefined, key: string) => {
      if (!value) return null
      if (!customerMode) return `${label}: ${value}`
      const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
      const appleUrl = `https://maps.apple.com/?q=${encodeURIComponent(value)}`
      const copyKey = `${key}-address`
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-midnight">{`${label}: ${value}`}</span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void handleCopy(value, copyKey)
              }}
              className="rounded-full border border-horizon/30 bg-white/70 p-1 text-horizon/70 transition hover:bg-horizon/10"
              title="Copy address"
            >
              {copiedKey === copyKey ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[0.65rem] uppercase tracking-[0.28em] text-horizon/70">
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-horizon"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Google Maps
            </a>
            <a
              href={appleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-horizon"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Apple Maps
            </a>
          </div>
        </div>
      )
    },
    [copiedKey, customerMode, handleCopy],
  )
  const pickupLine = renderAddressLine("Pickup", originDisplay, "pickup")
  const dropoffLine = renderAddressLine("Drop-off", destinationDisplay, "dropoff")
  const passengersLine = (
    <span>
      <strong>Passengers:</strong>{" "}
      {paxCount != null ? `${paxCount} passenger${paxCount === 1 ? "" : "s"}` : "Pending"}
    </span>
  )

  const chips: ReactNode[] = []
  const normalizedConflict = conflictReason?.trim()
  if (normalizedConflict) {
    chips.push(
      <span
        key="conflict"
        className="inline-flex items-center gap-1 rounded-full border border-ember/60 bg-ember/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-ember"
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        {normalizedConflict}
      </span>,
    )
  }

  if (slaTimer?.overdue) {
    const rounded = Math.max(0, Math.abs(Math.round(slaTimer.diffMinutes)))
    const isOverdue = slaTimer.diffMinutes <= 0
    const tone = isOverdue
      ? "border-ember/60 bg-ember/10 text-ember"
      : "border-amber-300 bg-amber-50 text-amber-700"
    const label = isOverdue
      ? `Pickup overdue ${rounded}m`
      : `Pickup in ${rounded}m`
    chips.push(
      <span
        key="sla"
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em]",
          tone,
        )}
      >
        <Timer className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>,
    )
  }

  const quoteMeta = booking.system?.quoteRequest
  const quoteActor = quoteMeta?.approvedBy
  const quoteDisplayName =
    typeof quoteActor?.displayName === "string" ? quoteActor.displayName.trim() : ""
  const quoteEmail =
    typeof quoteActor?.email === "string" ? quoteActor.email.trim() : ""
  const quoteUid =
    typeof quoteActor?.uid === "string" ? quoteActor.uid.trim() : ""
  const quoteOperatorLabel =
    quoteDisplayName.length > 0
      ? quoteDisplayName
      : quoteEmail.length > 0
        ? quoteEmail
        : quoteUid.length > 0
          ? quoteUid
          : null
  const quoteApprovedAt =
    typeof quoteMeta?.approvedAt === "number" ? new Date(quoteMeta.approvedAt) : null
  if (quoteOperatorLabel) {
    const approvedAgo = quoteApprovedAt ? formatDistanceToNow(quoteApprovedAt, { addSuffix: true }) : null
    chips.push(
      <span
        key="quoteActor"
        className="inline-flex items-center gap-1 rounded-full border border-horizon/30 bg-horizon/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-horizon/80"
      >
        <DollarSign className="h-3.5 w-3.5" aria-hidden />
        {`Quote by ${quoteOperatorLabel}${approvedAgo ? ` · ${approvedAgo}` : ""}`}
      </span>,
    )
  }

  const statusActionButtons = statusActions?.filter(Boolean) ?? []
  const confirmationState = booking.system?.notifications?.email?.bookingConfirmation
  const confirmationAt =
    typeof confirmationState?.at === "number" ? new Date(confirmationState.at) : null
  const driverAssignmentEmail = booking.system?.notifications?.email?.driverAssignment
  const driverAssignmentAt =
    typeof driverAssignmentEmail?.at === "number" ? new Date(driverAssignmentEmail.at) : null
  const statusChangeEmail = booking.system?.notifications?.email?.statusChange
  const statusEmailAt =
    typeof statusChangeEmail?.at === "number" ? new Date(statusChangeEmail.at) : null
  const statusChangeRecord = booking.system?.notifications?.statusChange
  const statusChangeAt =
    typeof statusChangeRecord?.at === "number" ? new Date(statusChangeRecord.at) : null
  const confirmationResentAt =
    typeof confirmationState?.lastResentAt === "number"
      ? new Date(confirmationState.lastResentAt)
      : null
  const confirmationResentBy =
    confirmationState?.lastResentBy?.name ??
    confirmationState?.lastResentBy?.uid ??
    null
  const confirmationResendCount =
    typeof confirmationState?.resendCount === "number"
      ? confirmationState.resendCount
      : null
  const adjustedAt =
    typeof booking.payment?.adjustedAt === "number"
      ? new Date(booking.payment.adjustedAt)
      : null
  const statusHistoryEntries = Array.isArray(booking.statusHistory)
    ? [...booking.statusHistory].reverse()
    : []
  const prioritizedHistory = statusHistoryEntries.filter((entry) => {
    if (!entry) return false
    if (entry.actor?.role === "admin") return true
    if (!entry.status) return false
    return ["pricing_adjusted", "confirmation_resent"].includes(entry.status)
  })
  const activitySource =
    prioritizedHistory.length > 0 ? prioritizedHistory : statusHistoryEntries
  const totalActivityPages =
    activitySource.length === 0 ? 0 : Math.ceil(activitySource.length / ACTIVITY_PAGE_SIZE)

  useEffect(() => {
    if (totalActivityPages === 0) {
      if (activityPage !== 0) {
        setActivityPage(0)
      }
      return
    }
    const maxPage = totalActivityPages - 1
    if (activityPage > maxPage) {
      setActivityPage(maxPage)
    }
  }, [activityPage, totalActivityPages])

  const currentActivityPage =
    totalActivityPages === 0 ? 0 : Math.min(activityPage, totalActivityPages - 1)
  const activitySliceStart = currentActivityPage * ACTIVITY_PAGE_SIZE
  const activityLines = activitySource
    .slice(activitySliceStart, activitySliceStart + ACTIVITY_PAGE_SIZE)
    .map((entry) => {
      const label = entry.status ? entry.status.replace(/_/g, " ") : "Status update"
      const actorName =
        entry.actor?.name ??
        entry.actor?.uid ??
        (entry.actor ? entry.actor.role ?? "Team" : "System")
      const timestamp =
        typeof entry.timestamp === "number" ? new Date(entry.timestamp) : null
      const timeLabel = timestamp ? formatDistanceToNow(timestamp, { addSuffix: true }) : ""
      const note = entry.note ? ` (${entry.note})` : ""
      return `${actorName} → ${label}${note}${timeLabel ? ` · ${timeLabel}` : ""}`
    })
  const showActivityPagination = totalActivityPages > 1
  const activityPagination = showActivityPagination ? (
    <div className="flex flex-col gap-2 rounded-full bg-white/70 px-4 py-3 text-xs text-midnight/80">
      <div className="flex items-center justify-between gap-4">
        <span className="font-semibold uppercase tracking-[0.26em] text-horizon/70">
          Page {currentActivityPage + 1} of {totalActivityPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActivityPage((page) => Math.max(0, page - 1))}
            disabled={currentActivityPage === 0}
            className="rounded-full border border-horizon/20 bg-white px-3 py-1 text-[0.65rem] uppercase tracking-[0.24em] text-horizon transition hover:border-horizon/40 hover:text-horizon disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous activity page"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() =>
              setActivityPage((page) =>
                Math.min(totalActivityPages - 1, page + 1),
              )
            }
            disabled={currentActivityPage >= totalActivityPages - 1}
            className="rounded-full border border-horizon/20 bg-white px-3 py-1 text-[0.65rem] uppercase tracking-[0.24em] text-horizon transition hover:border-horizon/40 hover:text-horizon disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next activity page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  ) : null

  const summaryInteractive = Boolean(onToggle)
  const handleSummaryKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!summaryInteractive) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onToggle?.()
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-horizon/25 bg-gradient-to-br from-white via-sky-50/70 to-white/95 shadow-sm backdrop-blur">
      <div
        className={clsx(
          "rounded-2xl p-5 transition",
          summaryInteractive ? "cursor-pointer hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-horizon/40" : "",
          expanded ? "bg-white" : "",
        )}
        role={summaryInteractive ? "button" : undefined}
        tabIndex={summaryInteractive ? 0 : undefined}
        aria-expanded={summaryInteractive ? expanded : undefined}
        onClick={summaryInteractive ? onToggle : undefined}
        onKeyDown={summaryInteractive ? handleSummaryKeyDown : undefined}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-start gap-4">
              {positionLabel ? (
                <span className="mt-1 text-lg font-semibold text-emerald-600">{positionLabel}</span>
              ) : null}
              {selectable ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onSelectionToggle?.(!selected, event)
                  }}
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full border transition",
                    selected
                      ? "border-horizon bg-horizon text-white shadow-md"
                      : "border-horizon/30 bg-white text-horizon/80 hover:bg-horizon/10",
                  )}
                  aria-pressed={selected}
                  aria-label={selected ? "Deselect booking" : "Select booking"}
                >
                  {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                </button>
              ) : null}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.28em] text-horizon/70">Trip</p>
                <div className="flex gap-3 text-sm text-midnight">
                  <Waypoints className="mt-1 h-4 w-4 text-horizon/80" aria-hidden />
                  <div className="space-y-1">
                    <p>
                      <span className="font-semibold">From:</span> {originDisplay}
                    </p>
                    <p>
                      <span className="font-semibold">To:</span> {destinationDisplay}
                    </p>
                  </div>
                </div>
                {bookingNumber ? (
                  <p className="text-base uppercase tracking-[0.2em] text-midnight/50">
                    Form #{bookingNumber}
                  </p>
                ) : null}
                {chips.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">{chips}</div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-sm">
              <div className="flex items-center gap-2 text-midnight">
                <CalendarDays className="h-4 w-4 text-horizon/80" aria-hidden />
                <span>{pickup.label}</span>
              </div>
              {countdownLabel ? (
                <div className="text-xs tracking-[0.24em] text-midnight/60">
                  Time remaining: {countdownLabel}
                </div>
              ) : null}
            </div>

            {customerMode ? (
              <div className="flex flex-wrap items-center gap-3 text-[0.65rem] uppercase tracking-[0.28em] text-horizon/80">
                <span className="font-semibold">Add to calendar</span>
                {calendarLinks ? (
                  <>
                    <a
                      href={calendarLinks.googleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-horizon/30 px-3 py-1 font-medium transition hover:border-horizon/50 hover:text-horizon"
                    >
                      Google
                    </a>
                    <a
                      href={calendarLinks.icsHref}
                      download={`valley-airporter-${booking.id}.ics`}
                      className="inline-flex items-center gap-1 rounded-full border border-horizon/30 px-3 py-1 font-medium transition hover:border-horizon/50 hover:text-horizon"
                    >
                      Apple / ICS
                    </a>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void handleShareTrip()
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-horizon/30 px-3 py-1 font-medium text-horizon/80 transition hover:border-horizon/50 hover:text-horizon"
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  Share trip
                </button>
                {copiedKey === "share" ? (
                  <span className="text-[0.65rem] uppercase tracking-[0.24em] text-emerald-600">
                    Copied
                  </span>
                ) : null}
              </div>
            ) : null}

            {returnLabel ? (
              <p className="text-xs text-midnight/70">
                Return ride scheduled for <span className="font-medium text-midnight">{returnLabel}</span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-2">
          {bookingNumber ? (
            <span className="va-chip va-chip--emphasis bg-white/80 text-midnight/80">
              Form #{bookingNumber}
            </span>
          ) : null}
          <span className={clsx("va-chip", getStatusTone(booking.status))}>
            {booking.status ? booking.status.replace(/_/g, " ") : "Status pending"}
          </span>
          <p className="text-sm font-semibold text-midnight">{totalFare}</p>
          {summaryInteractive ? (
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-midnight/50">
              {expanded ? "Hide details" : "View details"}
              {expanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            </div>
          ) : null}
        </div>
      </div>
      </div>
      {expanded ? (
        <div className="border-t border-horizon/10 px-5 pb-5 pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoBlock
              index={0}
              title="Booking"
              lines={[
                bookingNumber ? <span><strong>Form #:</strong> {bookingNumber}</span> : "",
                bookedOnDisplay ? <span><strong>Booked on:</strong> {bookedOnDisplay}</span> : "",
                <span><strong>Transfer type:</strong> {transferType}</span>,
                passengersLine,
              ]}
            />
            <InfoBlock
              index={1}
              title="Passenger"
              lines={[
                booking.passenger?.primaryPassenger ?? "TBD",
                booking.passenger?.phone ?? "",
                booking.passenger?.email ?? "",
              ]}
              icons={[
                <User2 key="user" className="h-4 w-4 text-horizon/80" />,
                <Phone key="phone" className="h-4 w-4 text-horizon/80" />,
                <Mail key="mail" className="h-4 w-4 text-horizon/80" />,
              ]}
            />
            <InfoBlock
              index={2}
              title="Trip details"
              lines={[
                pickupLine,
                dropoffLine,
                distanceLine,
                booking.schedule?.notes ? `Notes: ${booking.schedule.notes}` : "",
              ]}
              icons={[
                <MapPin key="origin" className="h-4 w-4 text-horizon/80" />,
                <MapPin key="dest" className="h-4 w-4 rotate-180 text-horizon/80" />,
              ]}
            />
            <InfoBlock
              index={3}
              title="Payment"
              lines={[
                <span><strong>Method:</strong> {paymentMethod}</span>,
                <span><strong>Total:</strong> {totalFare}</span>,
                <span><strong>Tip:</strong> {tipDisplay}</span>,
                booking.payment?.link ? <span><strong>Status:</strong> Payment link active</span> : "",
                <span><strong>Paid status:</strong> {paidStatus}</span>,
                booking.payment?.adjustedManually
                  ? adjustedAt
                    ? `Manually adjusted ${formatDistanceToNow(adjustedAt, { addSuffix: true })}`
                    : "Manually adjusted"
                  : "",
                booking.payment?.adjustedByName
                  ? `Adjusted by ${booking.payment.adjustedByName}`
                  : booking.payment?.adjustedBy
                    ? `Adjusted by ${booking.payment.adjustedBy}`
                    : "",
                booking.payment?.adjustmentNote ?? "",
              ]}
            />
            <InfoBlock
              index={4}
              title="Driver assignment"
              lines={assignmentLines}
              action={
                onAssignDriver ? (
                  <button
                    className="va-button va-button--secondary mt-3 px-4 py-[0.55rem]"
                    onClick={() => onAssignDriver(booking)}
                    type="button"
                  >
                    {assignLabel}
                  </button>
                ) : null
              }
            />
            <InfoBlock
              index={5}
              title="Flight & baggage"
              lines={[
                <span><strong>Arrival flight number:</strong> {flightNumber ?? "Not provided"}</span>,
                <span><strong>Baggage:</strong> {baggageLabel}</span>,
                <span><strong>Special notes:</strong> {specialNotesLabel}</span>,
                vehicleSummary ? <span><strong>Vehicle type:</strong> {vehicleSummary}</span> : "",
              ]}
            />
            <InfoBlock
              index={6}
              title="Notifications"
              lines={[
                confirmationAt
                  ? `Confirmation sent ${formatDistanceToNow(confirmationAt, { addSuffix: true })}`
                  : "Confirmation pending",
                confirmationState?.to?.length ? <span><strong>To:</strong> {confirmationState.to.join(", ")}</span> : "",
                confirmationState?.cc?.length ? <span><strong>Cc:</strong> {confirmationState.cc.join(", ")}</span> : "",
                confirmationResentAt
                  ? `Resent by ${confirmationResentBy ?? "Admin"} ${formatDistanceToNow(confirmationResentAt, { addSuffix: true })}`
                  : confirmationResentBy
                    ? `Resent by ${confirmationResentBy}`
                    : "",
                confirmationResendCount && confirmationResendCount > 0
                  ? `Resent ${confirmationResendCount} time${confirmationResendCount === 1 ? "" : "s"}`
                  : "",
                driverAssignmentEmail?.sent
                  ? `Driver assignment sent ${driverAssignmentAt ? formatDistanceToNow(driverAssignmentAt, { addSuffix: true }) : "just now"}`
                  : driverAssignmentEmail ? "Driver assignment pending" : "",
                driverAssignmentEmail?.driverTo?.length
                  ? `Driver email: ${driverAssignmentEmail.driverTo.join(", ")}`
                  : "",
                driverAssignmentEmail?.customerTo?.length
                  ? `Customer notified: ${driverAssignmentEmail.customerTo.join(", ")}`
                  : "",
                statusChangeEmail?.sent
                  ? `Status email ${statusEmailAt ? formatDistanceToNow(statusEmailAt, { addSuffix: true }) : "triggered"}`
                  : "",
                statusChangeRecord?.status && statusChangeAt
                  ? `Last status ${statusChangeRecord.status} ${formatDistanceToNow(statusChangeAt, { addSuffix: true })}`
                  : statusChangeRecord?.status
                    ? `Last status ${statusChangeRecord.status}`
                    : "",
              ]}
            />
            <InfoBlock
              index={7}
              title="Activity"
              lines={activityLines}
              action={activityPagination}
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <Link
                to="/portal/customer/bookings/$bookingId/options"
                params={{ bookingId: booking.id }}
                search={bookingOptionsSearch}
                className="flex h-full items-center justify-center rounded-2xl border border-horizon/30 bg-gradient-to-br from-horizon/15 via-sky-100 to-white px-4 py-6 text-sm font-semibold uppercase tracking-[0.32em] text-horizon transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                More options
              </Link>
            </div>
          </div>
          {customerMode ? (
            <div className="mt-6 md:hidden">
              <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 rounded-2xl border border-horizon/25 bg-white/95 p-3 text-[0.7rem] uppercase tracking-[0.26em] text-horizon shadow-lg backdrop-blur">
                <Link
                  to="/portal/customer/bookings/$bookingId/options"
                  params={{ bookingId: booking.id }}
                  search={bookingOptionsSearch}
                  className="flex-1 rounded-full bg-horizon px-3 py-2 text-center font-semibold text-white shadow-sm"
                >
                  Reschedule
                </Link>
                <Link
                  to="/portal/customer/bookings/$bookingId/options"
                  params={{ bookingId: booking.id }}
                  search={bookingOptionsSearch}
                  className="flex-1 rounded-full border border-horizon/20 bg-white px-3 py-2 text-center font-semibold text-horizon"
                >
                  Change pickup
                </Link>
                <Link
                  to="/portal/customer/bookings/$bookingId/options"
                  params={{ bookingId: booking.id }}
                  search={bookingOptionsSearch}
                  className="flex-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-center font-semibold text-rose-600"
                >
                  Cancel
                </Link>
                {canSwitchToOnline ? (
                  <Link
                    to="/portal/customer/bookings/$bookingId/options"
                    params={{ bookingId: booking.id }}
                    search={bookingOptionsSearch}
                    className="flex-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-center font-semibold text-emerald-700"
                  >
                    Pay now
                  </Link>
                ) : null}
                <a
                  href="tel:+16047516688"
                  className="flex-1 rounded-full border border-horizon/20 bg-white px-3 py-2 text-center font-semibold text-horizon"
                >
                  Contact
                </a>
              </div>
              <div className="mt-2 text-center text-[0.65rem] text-midnight/60">
                Need help fast? Call or text&nbsp;
                <a className="font-semibold text-horizon underline-offset-2" href="tel:+16047516688">
                  (604) 751-6688
                </a>
              </div>
              <div className="mt-1 text-center text-[0.6rem] text-midnight/45">
                <a href="/faq#cancellations" className="underline-offset-2 hover:underline">
                  Refund &amp; cancel policy
                </a>
              </div>
            </div>
          ) : null}
          {statusActionButtons.length > 0 && onStatusAction ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {statusActionButtons.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  className={actionToneStyles[action.tone ?? "secondary"]}
                  onClick={() => {
                    if (!action.disabled) onStatusAction(action)
                  }}
                  disabled={action.disabled}
                  title={action.tooltip}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}

          {renderActions ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {renderActions(booking)}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

const InfoBlock = ({
  title,
  lines,
  icons,
  action,
  index,
}: {
  title: string
  lines: Array<ReactNode | string | null | undefined>
  icons?: ReactNode[]
  action?: ReactNode
  index: number
}) => {
  const infoBlockBackgrounds = [
    "bg-gradient-to-br from-emerald-50 via-emerald-100 to-white",
    "bg-gradient-to-br from-sky-50 via-sky-100 to-white",
    "bg-gradient-to-br from-amber-50 via-amber-100 to-white",
  ]

  const formatted = lines
    .map((line, lineIndex) => {
      if (line == null) return null
      if (typeof line === "string") {
        const trimmed = line.trim()
        if (!trimmed) return null
        return { node: trimmed, icon: icons?.[lineIndex] }
      }
      return { node: line, icon: icons?.[lineIndex] }
    })
    .filter((entry): entry is { node: ReactNode | string; icon?: ReactNode } => Boolean(entry))

  if (formatted.length === 0 && !action) return null

  const rowOffset = Math.floor(index / infoBlockBackgrounds.length)
  const backgroundIndex = (index + rowOffset) % infoBlockBackgrounds.length

  return (
    <div
      className={clsx(
        "rounded-2xl border border-horizon/40 p-4 shadow-sm",
        infoBlockBackgrounds[backgroundIndex],
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/80">{title}</p>
      {formatted.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm text-midnight/80">
          {formatted.map(({ node, icon }, lineIndex) => (
            <li key={lineIndex} className="flex items-start gap-2">
              {icon ?? null}
              <span className="flex-1">{node}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {action ? <div className={formatted.length > 0 ? "mt-4" : ""}>{action}</div> : null}
    </div>
  )
}
