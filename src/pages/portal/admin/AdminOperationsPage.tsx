import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { clsx } from "clsx"
import { addDays, addMinutes, differenceInMinutes, format, formatDistanceToNow, startOfDay } from "date-fns"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { useToast } from "@/components/ui/ToastProvider"
import { EmptyState, ErrorBanner } from "@/components/ui/Feedback"
import {
  useAssignDriver,
  useRealtimeBookings,
  useSendBulkBookingSms,
  useUpdateBookingPricing,
  useUpdateBookingStatus,
} from "@/features/bookings/hooks"
import type { BookingAssignment, BookingItem, BookingScope } from "@/features/bookings/types"
import { PRICING_ADJUST_REASON_CODES, STATUS_REASON_CODES } from "@/features/bookings/constants"
import { useSavedBookingViews } from "@/features/admin/useSavedBookingViews"
import { useDriversDirectory, type DriverProfile } from "@/features/drivers/hooks"
import { useFirebase } from "@/lib/hooks/useFirebase"
import {
  Timestamp,
  collection,
  doc,
  limit as limitFn,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"
import type { User } from "firebase/auth"
import type { LucideIcon } from "lucide-react"
import {
  Navigation,
  PanelLeftClose,
  AlignVerticalJustifyStart,
  Timer,
  Loader2,
  UserCheck,
  MessageSquare,
  DollarSign,
  RefreshCcw,
  CalendarDays,
  ListFilter,
  AlertTriangle,
  MoveLeft,
  MoveRight,
  Undo2,
  Clock,
} from "lucide-react"

const MINUTES_IN_DAY = 24 * 60
const MS_PER_MINUTE = 60_000
const DEFAULT_TRIP_DURATION_MIN = 75
const MIN_TRIP_DURATION_MIN = 45
const TURNAROUND_BUFFER_MIN = 30
const MIN_WIDTH_RATIO = 0.045
const TIMELINE_HOUR_WIDTH = 56
const LANE_HEIGHT_PX = 88
const LANE_GAP_PX = 18

const STATUS_CHIP_TONES: Record<"warning" | "primary" | "info" | "success" | "danger", string> = {
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  primary: "border-sky-200 bg-sky-50 text-sky-700",
  info: "border-indigo-200 bg-indigo-50 text-indigo-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
}

const STATUS_BADGE_CLASSES: Record<
  "primary" | "secondary" | "warning" | "success" | "danger",
  string
> = {
  primary: "border-sky-200 bg-sky-50 text-sky-700",
  secondary: "border-slate-200 bg-slate-50 text-slate-600",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
}

const STATUS_BORDER_CLASSES: Record<
  "primary" | "secondary" | "warning" | "success" | "danger",
  string
> = {
  primary: "border-sky-300",
  secondary: "border-slate-200",
  warning: "border-amber-300",
  success: "border-emerald-300",
  danger: "border-rose-300",
}

const QUEUE_DROP_ID = "unassigned-queue"

type TimelinePlacement = {
  booking: BookingItem
  lane: number
  leftRatio: number
  widthRatio: number
  startMinutes: number
  durationMinutes: number
  conflict: boolean
  gapMinutes: number | null
  warnings: string[]
}

type UndoEntry = {
  bookingId: string
  previousAssignment: BookingAssignment | null
}

type DispatcherFilters = {
  pickupWindow: "all" | "next2h" | "morning" | "afternoon" | "evening" | "overnight"
  airport: string
  pax: "all" | "1-2" | "3-4" | "5+"
  luggage: "all" | "none" | "standard" | "heavy"
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  assigned: "Assigned",
  en_route: "En route",
  arrived: "Arrived",
  on_trip: "On trip",
  completed: "Completed",
  cancelled: "Cancelled",
}

const STATUS_TONES: Record<string, "primary" | "secondary" | "warning" | "success" | "danger"> = {
  pending: "secondary",
  awaiting_payment: "warning",
  confirmed: "primary",
  assigned: "secondary",
  en_route: "primary",
  arrived: "secondary",
  on_trip: "primary",
  completed: "success",
  cancelled: "danger",
}

const ADMIN_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["awaiting_payment", "confirmed", "cancelled"],
  awaiting_payment: ["confirmed", "cancelled"],
  confirmed: ["assigned", "cancelled"],
  assigned: ["en_route", "confirmed", "cancelled"],
  en_route: ["arrived", "assigned", "cancelled"],
  arrived: ["on_trip", "en_route", "cancelled"],
  on_trip: ["completed", "arrived", "cancelled"],
  completed: [],
  cancelled: [],
}

const STATUS_REASON_REQUIRED = new Set(["cancelled"])

const TRANSITION_REASON_REQUIRED = new Set([
  "assigned:confirmed",
  "en_route:assigned",
  "arrived:en_route",
  "on_trip:arrived",
])

const requiresReason = (currentStatus: string, nextStatus: string) => {
  const normalizedCurrent = currentStatus || "pending"
  const normalizedNext = nextStatus || "pending"
  return (
    STATUS_REASON_REQUIRED.has(normalizedNext) ||
    TRANSITION_REASON_REQUIRED.has(`${normalizedCurrent}:${normalizedNext}`)
  )
}

type BookingViewFilters = {
  id: string
  name: string
  scope: BookingScope
  status: string
  driver: string
  payment: string
}

const DEFAULT_VIEWS: BookingViewFilters[] = [
  { id: "upcoming", name: "Upcoming", scope: "upcoming", status: "all", driver: "all", payment: "all" },
  { id: "assigned", name: "Assigned", scope: "upcoming", status: "assigned", driver: "all", payment: "all" },
  { id: "pay-now", name: "Pay now", scope: "upcoming", status: "all", driver: "all", payment: "pay_now" },
  { id: "past", name: "Past 30d", scope: "past", status: "all", driver: "all", payment: "all" },
]

export const AdminOperationsPage = () => {
  return (
    <RoleGate
      allowedRoles={["admin"]}
      headline="Operations hub"
      description="Deep dive into dispatch, overrides, and coverage planning."
    >
      <section className="flex flex-col gap-6 pb-24">
        <DispatchWorkspace />

        <GlassPanel className="flex flex-col gap-4 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Assignment board</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Dispatch queue</h2>
            </div>
            <Navigation className="h-5 w-5 text-horizon/70" aria-hidden />
          </header>
          <div className="rounded-2xl border border-horizon/15 bg-white/70 p-5 text-sm text-midnight/70">
            Real-time assignment queues appear once dispatch begins staging rides. Choose a view above and the bookings list will populate with live trips scoped to your filters.
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Dispatch console</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Override tools</h2>
            </div>
            <PanelLeftClose className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <p className="mt-4 rounded-2xl border border-horizon/15 bg-white/70 px-4 py-5 text-sm text-midnight/70">
            Configure override presets in the admin console to expose quick actions here when you need to adjust pickup windows, capacity, or fares mid-shift.
          </p>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Schedule & availability</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Coverage grid</h2>
            </div>
            <Timer className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <p className="mt-4 rounded-2xl border border-horizon/15 bg-white/70 px-4 py-5 text-sm text-midnight/70">
            Once schedule templates are configured, on-call coverage and staffing gaps will populate here in real time.
          </p>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}

const DispatchWorkspace = () => {
  const { present } = useToast()
  const firebase = useFirebase()
  const updateStatus = useUpdateBookingStatus()
  const assignDriver = useAssignDriver()
  const sendBulkSms = useSendBulkBookingSms()
  const updatePricing = useUpdateBookingPricing()
  const {
    views,
    removeView,
    loading: viewsLoading,
  } = useSavedBookingViews()

  const [selected, setSelected] = useState<Record<string, BookingItem>>({})
  const [activePanel, setActivePanel] = useState<"status" | "assign" | "sms" | "pricing">("status")
  const [statusForm, setStatusForm] = useState({
    status: "assigned",
    reasonCode: "",
    note: "",
  })
  const [assignForm, setAssignForm] = useState({
    driverId: "",
    driverName: "",
    phone: "",
    email: "",
    notifyDriver: true,
    notifyPassenger: false,
  })
  const [smsForm, setSmsForm] = useState({
    recipient: "passenger" as "passenger" | "driver" | "both",
    message: "",
  })
  const [pricingForm, setPricingForm] = useState({
    base: "",
    gst: "",
    tip: "",
    total: "",
    reasonCode: "",
    reasonNote: "",
    requireSecondApproval: false,
  })
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequestItem[]>([])

  const savedViewFilters = useMemo<BookingViewFilters[]>(
    () =>
      views.map((view) => ({
        id: view.id,
        name: view.name,
        scope: view.scope,
        status: view.status ?? "all",
        driver: view.driver ?? "all",
        payment: view.payment ?? "all",
      })),
    [views],
  )

  const allViews = useMemo<BookingViewFilters[]>(() => [...DEFAULT_VIEWS, ...savedViewFilters], [savedViewFilters])

  const [currentViewId, setCurrentViewId] = useState<string>(DEFAULT_VIEWS[0]?.id ?? "upcoming")

  const currentView = useMemo<BookingViewFilters>(() => {
    const fallback = DEFAULT_VIEWS[0]
    return allViews.find((view) => view.id === currentViewId) ?? fallback ?? {
        id: "fallback",
        name: "Upcoming",
        scope: "upcoming",
        status: "all",
        driver: "all",
        payment: "all",
      }
  }, [allViews, currentViewId])

  useEffect(() => {
    if (!allViews.some((view) => view.id === currentViewId) && allViews.length > 0) {
      setCurrentViewId(allViews[0].id)
    }
  }, [allViews, currentViewId])

  useEffect(() => {
    if (!firebase.firestore) return
    setQuoteLoading(true)
    setQuoteError(null)
    const q = query(
      collection(firebase.firestore, "quoteRequests"),
      orderBy("createdAt", "desc"),
      limitFn(25),
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: QuoteRequestItem[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>
          const createdAtValue = data.createdAt
          let createdAt: Date | null = null
          if (createdAtValue instanceof Timestamp) {
            createdAt = createdAtValue.toDate()
          }
          const responseRaw = (data.response ?? {}) as Record<string, unknown>
          let decidedAt: Date | null = null
          const decidedAtValue = responseRaw.decidedAt
          if (decidedAtValue instanceof Timestamp) {
            decidedAt = decidedAtValue.toDate()
          } else if (decidedAtValue instanceof Date) {
            decidedAt = decidedAtValue
          }
          let decidedBy: QuoteDecisionActor | null = null
          const decidedByRaw = responseRaw.decidedBy
          if (decidedByRaw && typeof decidedByRaw === "object") {
            const decidedRecord = decidedByRaw as Record<string, unknown>
            const displayName =
              typeof decidedRecord.displayName === "string" && decidedRecord.displayName.trim().length > 0
                ? decidedRecord.displayName.trim()
                : null
            const email =
              typeof decidedRecord.email === "string" && decidedRecord.email.trim().length > 0
                ? decidedRecord.email.trim()
                : null
            const uid =
              typeof decidedRecord.uid === "string" && decidedRecord.uid.trim().length > 0
                ? decidedRecord.uid.trim()
                : null
            decidedBy = { displayName, email, uid }
          }
          const response: QuoteRequestItem["response"] = {
            status: typeof responseRaw.status === "string" ? responseRaw.status : null,
            message: typeof responseRaw.message === "string" ? responseRaw.message : null,
            amountCents: typeof responseRaw.amountCents === "number" ? responseRaw.amountCents : null,
            decidedAt,
            decidedBy,
          }
          return {
            id: docSnap.id,
            status: typeof data.status === "string" ? data.status : "open",
            trip: (data.trip as QuoteRequestItem["trip"]) ?? {},
            passenger: (data.passenger as QuoteRequestItem["passenger"]) ?? {},
            schedule: (data.schedule as QuoteRequestItem["schedule"]) ?? null,
            createdAt,
            response,
          }
        })
        setQuoteRequests(items)
        setQuoteEdits((prev) => {
          const next = { ...prev }
          items.forEach((item) => {
            if (!next[item.id]) {
              const amount = item.response?.amountCents
              next[item.id] = {
                amount: typeof amount === "number" ? (amount / 100).toFixed(2) : "",
                note: item.response?.message ?? "",
              }
            }
          })
          return next
        })
        setQuoteLoading(false)
      },
      (error) => {
        setQuoteError(error)
        setQuoteLoading(false)
      },
    )
    return () => unsubscribe()
  }, [firebase.firestore])

  const {
    bookings,
    loading: bookingsLoading,
    error: bookingsError,
    refresh: refreshBoard,
  } = useRealtimeBookings({
    scope: currentView.scope,
    status: currentView.status === "all" ? undefined : currentView.status,
    limit: 120,
  })

  const {
    drivers,
    loading: driversLoading,
    error: driversError,
  } = useDriversDirectory()

  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()))
  const [filters, setFilters] = useState<DispatcherFilters>({
    pickupWindow: "all",
    airport: "all",
    pax: "all",
    luggage: "all",
  })
  const [draggedBookingId, setDraggedBookingId] = useState<string | null>(null)
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [auditOpen, setAuditOpen] = useState(false)

  const triggerRefresh = useCallback(() => {
    refreshBoard()
  }, [refreshBoard])

  const dayStartMs = selectedDate.getTime()
  const dayEndMs = dayStartMs + MINUTES_IN_DAY * MS_PER_MINUTE

  const bookingsMatchingView = useMemo(
    () => bookings.filter((booking) => viewFilterFn(booking)),
    [bookings, viewFilterFn],
  )

  const bookingLookup = useMemo(() => {
    const map = new Map<string, BookingItem>()
    bookingsMatchingView.forEach((booking) => {
      map.set(booking.id, booking)
    })
    return map
  }, [bookingsMatchingView])

  const bookingsForDay = useMemo(
    () =>
      bookingsMatchingView.filter((booking) => {
        const pickup = getPickupTimestamp(booking)
        if (pickup === null) return false
        return pickup >= dayStartMs && pickup < dayEndMs
      }),
    [bookingsMatchingView, dayStartMs, dayEndMs],
  )

  const selectedIds = useMemo(() => Object.keys(selected), [selected])
  const selectedBookings = useMemo(
    () => selectedIds.map((id) => bookingLookup.get(id) ?? selected[id]).filter(Boolean),
    [bookingLookup, selected, selectedIds],
  )
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const airportOptions = useMemo(() => {
    const codes = new Set<string>()
    bookingsForDay.forEach((booking) => {
      const airport = extractAirportCode(booking)
      if (airport) {
        codes.add(airport)
      }
    })
    return Array.from(codes).sort((a, b) => a.localeCompare(b))
  }, [bookingsForDay])

  const matchesQueueFilters = useCallback(
    (booking: BookingItem) => {
      const pickup = getPickupTimestamp(booking)
      if (pickup === null) return false
      if (pickup < dayStartMs || pickup >= dayEndMs) return false
      if (filters.pickupWindow !== "all" && !matchesPickupWindow(filters.pickupWindow, pickup)) {
        return false
      }
      const airport = extractAirportCode(booking) ?? "other"
      if (filters.airport !== "all" && filters.airport !== airport) {
        return false
      }
      const paxBucket = classifyPassengerBucket(booking)
      if (filters.pax !== "all" && filters.pax !== paxBucket) {
        return false
      }
      const luggageBucket = classifyLuggageBucket(booking)
      if (filters.luggage !== "all" && filters.luggage !== luggageBucket) {
        return false
      }
      return true
    },
    [dayEndMs, dayStartMs, filters],
  )

  const unassignedQueue = useMemo(
    () => bookingsForDay.filter((booking) => !booking.assignment?.driverId && matchesQueueFilters(booking)),
    [bookingsForDay, matchesQueueFilters],
  )

  const driverMap = useMemo(() => {
    const map = new Map<string, DriverProfile>()
    drivers.forEach((driver) => {
      map.set(driver.id, driver)
    })
    bookingsForDay.forEach((booking) => {
      const driverId = booking.assignment?.driverId
      if (driverId && !map.has(driverId)) {
        map.set(driverId, {
          id: driverId,
          name: booking.assignment?.driverName ?? `Driver ${driverId.slice(0, 4)}`,
          status: null,
          rating: null,
          vehicle: booking.trip.vehicleSelections?.[0] ?? null,
          phone: booking.assignment?.driverPhone ?? null,
          email: booking.assignment?.driverEmail ?? null,
          active: null,
          note: null,
          dutyStatus: null,
          shiftStart: null,
          shiftEnd: null,
          compliance: {},
        })
      }
    })
    return map
  }, [bookingsForDay, drivers])

  const driverColumns = useMemo(
    () =>
      Array.from(driverMap.values())
        .map((driver) => ({
          driver,
          bookings: bookingsForDay.filter((booking) => booking.assignment?.driverId === driver.id),
        }))
        .sort((a, b) => a.driver.name.localeCompare(b.driver.name)),
    [driverMap, bookingsForDay],
  )

  const driverBoards = useMemo(
    () =>
      driverColumns.map(({ driver, bookings }) => ({
        driver,
        ...buildTimelinePlacements(bookings, dayStartMs, dayEndMs),
      })),
    [driverColumns, dayStartMs, dayEndMs],
  )

  const statusSummary = useMemo(() => {
    const summary = {
      unassigned: 0,
      assigned: 0,
      enRoute: 0,
      completed: 0,
      cancelled: 0,
    }
    bookingsForDay.forEach((booking) => {
      const status = (booking.status ?? "pending").toLowerCase()
      if (!booking.assignment?.driverId) {
        summary.unassigned += 1
      } else {
        summary.assigned += 1
      }
      if (status === "en_route" || status === "on_trip") {
        summary.enRoute += 1
      }
      if (status === "completed") {
        summary.completed += 1
      }
      if (status === "cancelled") {
        summary.cancelled += 1
      }
    })
    return summary
  }, [bookingsForDay])

  const bookingsErrorMessage = bookingsError?.message ?? null
  const driversErrorMessage = driversError?.message ?? null

  const handleAssignToDriver = useCallback(
    async (booking: BookingItem, driver: DriverProfile) => {
      if (booking.assignment?.driverId === driver.id) {
        present({
          title: "Already assigned",
          description: `${driver.name} already has this trip.`,
          tone: "warning",
        })
        return
      }
      const previous = booking.assignment ?? null
      setUndoStack((stack) => [{ bookingId: booking.id, previousAssignment: previous }, ...stack].slice(0, 20))
      try {
        await assignDriver.mutateAsync({
          bookingIds: [booking.id],
          driverId: driver.id,
          driverName: driver.name,
          driverContact: {
            phone: driver.phone ?? previous?.driverPhone ?? null,
            email: driver.email ?? previous?.driverEmail ?? null,
          },
          notify: {
            sms: false,
            email: false,
          },
        })
        present({
          title: "Assignment updated",
          description: `${booking.bookingNumber ?? booking.id} → ${driver.name}`,
          tone: "success",
        })
        triggerRefresh()
      } catch (error) {
        setUndoStack((stack) => stack.slice(1))
        present({
          title: "Unable to assign",
          description: error instanceof Error ? error.message : "Please try again shortly.",
          tone: "danger",
        })
      }
    },
    [assignDriver, present, triggerRefresh],
  )

  const handleUnassignBooking = useCallback(
    async (booking: BookingItem) => {
      if (!booking.assignment?.driverId) {
        present({
          title: "Already unassigned",
          description: "This booking is already in the queue.",
          tone: "warning",
        })
        return
      }
      const previous = booking.assignment ?? null
      setUndoStack((stack) => [{ bookingId: booking.id, previousAssignment: previous }, ...stack].slice(0, 20))
      try {
        await assignDriver.mutateAsync({
          bookingIds: [booking.id],
          driverId: "",
          driverName: null,
          driverContact: { phone: null, email: null },
          notify: { sms: false, email: false },
        })
        present({
          title: "Booking returned",
          description: `${booking.bookingNumber ?? booking.id} moved to unassigned queue.`,
          tone: "warning",
        })
        triggerRefresh()
      } catch (error) {
        setUndoStack((stack) => stack.slice(1))
        present({
          title: "Unable to unassign",
          description: error instanceof Error ? error.message : "Please try again shortly.",
          tone: "danger",
        })
      }
    },
    [assignDriver, present, triggerRefresh],
  )

  const handleDropOnDriver = useCallback(
    (driverId: string, bookingId: string) => {
      setActiveDropTarget(null)
      setDraggedBookingId(null)
      const booking = bookingLookup.get(bookingId)
      const driver = driverMap.get(driverId)
      if (!booking || !driver) return
      void handleAssignToDriver(booking, driver)
    },
    [bookingLookup, driverMap, handleAssignToDriver],
  )

  const handleDropToQueue = useCallback(
    (bookingId: string) => {
      setActiveDropTarget(null)
      setDraggedBookingId(null)
      const booking = bookingLookup.get(bookingId)
      if (!booking) return
      void handleUnassignBooking(booking)
    },
    [bookingLookup, handleUnassignBooking],
  )

  const handleUndoAssignment = useCallback(async () => {
    if (!undoStack.length) {
      present({
        title: "Nothing to undo",
        description: "Assignments will appear here once you move bookings.",
        tone: "warning",
      })
      return
    }
    const [latest, ...rest] = undoStack
    setUndoStack(rest)
    const booking = bookingLookup.get(latest.bookingId)
    if (!booking) {
      present({
        title: "Undo unavailable",
        description: "That booking is no longer in view.",
        tone: "warning",
      })
      return
    }
    const previous = latest.previousAssignment
    try {
      if (previous?.driverId) {
        await assignDriver.mutateAsync({
          bookingIds: [latest.bookingId],
          driverId: previous.driverId,
          driverName: previous.driverName ?? null,
          driverContact: {
            phone: previous.driverPhone ?? null,
            email: previous.driverEmail ?? null,
          },
          notify: { sms: false, email: false },
        })
        present({
          title: "Assignment restored",
          description: `${booking.bookingNumber ?? booking.id} reassigned to ${previous.driverName ?? previous.driverId}.`,
          tone: "success",
        })
      } else {
        await assignDriver.mutateAsync({
          bookingIds: [latest.bookingId],
          driverId: "",
          driverName: null,
          driverContact: { phone: null, email: null },
          notify: { sms: false, email: false },
        })
        present({
          title: "Assignment cleared",
          description: `${booking.bookingNumber ?? booking.id} returned to the unassigned queue.`,
          tone: "success",
        })
      }
      triggerRefresh()
    } catch (error) {
      setUndoStack((stack) => [latest, ...stack])
      present({
        title: "Undo failed",
        description: error instanceof Error ? error.message : "Please try again shortly.",
        tone: "danger",
      })
    }
  }, [assignDriver, bookingLookup, present, triggerRefresh, undoStack])

  const handleBookingCardClick = useCallback(
    (booking: BookingItem) => {
      const nextSelected = !selectedIdSet.has(booking.id)
      handleSelectionChange(booking, nextSelected)
      if (nextSelected) {
        setAuditOpen(true)
      }
    },
    [handleSelectionChange, selectedIdSet],
  )

  const handleDragEnd = useCallback(() => {
    setDraggedBookingId(null)
    setActiveDropTarget(null)
  }, [])

  const goToPreviousDay = useCallback(() => {
    setSelectedDate((prev) => startOfDay(addDays(prev, -1)))
  }, [])

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => startOfDay(addDays(prev, 1)))
  }, [])

  const goToToday = useCallback(() => {
    setSelectedDate(startOfDay(new Date()))
  }, [])

  const statusChips = [
    { key: "unassigned", label: "Unassigned", value: statusSummary.unassigned, tone: "warning" as const },
    { key: "assigned", label: "Assigned", value: statusSummary.assigned, tone: "primary" as const },
    { key: "en-route", label: "En-route", value: statusSummary.enRoute, tone: "info" as const },
    { key: "completed", label: "Completed", value: statusSummary.completed, tone: "success" as const },
    { key: "cancelled", label: "Canceled", value: statusSummary.cancelled, tone: "danger" as const },
  ]

  const pickupWindowOptions: Array<{ value: DispatcherFilters["pickupWindow"]; label: string }> = [
    { value: "all", label: "All windows" },
    { value: "next2h", label: "Next 2 hours" },
    { value: "morning", label: "Morning (5a–12p)" },
    { value: "afternoon", label: "Afternoon (12p–5p)" },
    { value: "evening", label: "Evening (5p–10p)" },
    { value: "overnight", label: "Overnight" },
  ]

  const paxOptions: Array<{ value: DispatcherFilters["pax"]; label: string }> = [
    { value: "all", label: "All pax" },
    { value: "1-2", label: "1–2 pax" },
    { value: "3-4", label: "3–4 pax" },
    { value: "5+", label: "5+ pax" },
  ]

  const luggageOptions: Array<{ value: DispatcherFilters["luggage"]; label: string }> = [
    { value: "all", label: "All luggage" },
    { value: "none", label: "No luggage" },
    { value: "standard", label: "Standard load" },
    { value: "heavy", label: "Heavy/Oversize" },
  ]

  const airportFilterOptions = ["all", ...airportOptions]
  const totalTripsForDay = bookingsForDay.length
  const timelineWidthPx = TIMELINE_HOUR_WIDTH * 24

  const filteredQuoteRequests = useMemo(() => {
    const normalizedSearch = quoteSearch.trim().toLowerCase()
    return quoteRequests.filter((quote) => {
      const normalizedStatus = quote.status?.toLowerCase() ?? "open"
      if (quoteFilter !== "all" && normalizedStatus !== quoteFilter) {
        return false
      }
      if (!normalizedSearch) return true
      const haystack = [
        quote.id,
        quote.trip.origin,
        quote.trip.destination,
        quote.passenger.name,
        quote.passenger.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [quoteFilter, quoteRequests, quoteSearch])
  const primaryBooking = selectedBookings[0] ?? null
  const selectedCount = selectedBookings.length
  const selectionSummary = selectedCount
    ? `${selectedCount} booking${selectedCount === 1 ? "" : "s"} selected`
    : `Viewing: ${currentView.name}`

  useEffect(() => {
    if (!primaryBooking) {
      return
    }
    setPricingForm((prev) => ({
      ...prev,
      base: centsToDollars(primaryBooking.payment?.baseCents),
      gst: centsToDollars(primaryBooking.payment?.gstCents),
      tip: centsToDollars(
        typeof primaryBooking.payment?.tipCents === "number"
          ? primaryBooking.payment?.tipCents
          : typeof (primaryBooking.payment as Record<string, number> | undefined)?.tipAmountCents ===
              "number"
            ? (primaryBooking.payment as Record<string, number>).tipAmountCents
            : undefined,
      ),
      total: centsToDollars(primaryBooking.payment?.totalCents),
      reasonCode: prev.reasonCode,
    }))
  }, [primaryBooking])

  const clearSelection = useCallback(() => {
    setSelected({})
    setAuditOpen(false)
  }, [])

  const selectionTargets = selectedBookings.length
    ? selectedBookings
    : primaryBooking
      ? [primaryBooking]
      : []

  const viewFilterFn = useCallback(
    (booking: BookingItem) => {
      const driverFilter = currentView.driver?.toLowerCase()
      const paymentFilter = currentView.payment
      const driverMatches =
        !driverFilter ||
        driverFilter === "all" ||
        (booking.assignment?.driverId && booking.assignment.driverId.toLowerCase().includes(driverFilter)) ||
        (booking.assignment?.driverName && booking.assignment.driverName.toLowerCase().includes(driverFilter))

      const paymentMatches =
        !paymentFilter ||
        paymentFilter === "all" ||
        (booking.payment?.preference ?? "pay_on_arrival") === paymentFilter

      return driverMatches && paymentMatches
    },
    [currentView.driver, currentView.payment],
  )

  const handleViewSelect = useCallback((viewId: string) => {
    setCurrentViewId(viewId)
    setSelected({})
  }, [])

  const handleRemoveView = useCallback(
    async (viewId: string) => {
      const view = savedViewFilters.find((candidate) => candidate.id === viewId)
      if (!view) return
      const confirmed =
        typeof window === "undefined"
          ? true
          : window.confirm(`Remove saved view “${view.name}”? This can’t be undone.`)
      if (!confirmed) return
      try {
        await removeView(viewId)
        if (currentViewId === viewId && DEFAULT_VIEWS.length > 0) {
          setCurrentViewId(DEFAULT_VIEWS[0].id)
        }
        present({
          title: "View removed",
          description: `${view.name} deleted.`,
          tone: "success",
        })
      } catch (error) {
        present({
          title: "Unable to remove view",
          description: error instanceof Error ? error.message : "Please try again later.",
          tone: "danger",
        })
      }
    },
    [currentViewId, present, removeView, savedViewFilters],
  )

  const handleQuoteEditChange = useCallback((id: string, field: "amount" | "note", value: string) => {
    setQuoteEdits((prev) => ({
      ...prev,
      [id]: {
        amount: field === "amount" ? value : prev[id]?.amount ?? "",
        note: field === "note" ? value : prev[id]?.note ?? "",
      },
    }))
  }, [])

  const handleQuoteDecision = useCallback(
    async (quote: QuoteRequestItem, action: "approved" | "declined") => {
      if (!firebase.firestore) return
      const edit = quoteEdits[quote.id] ?? { amount: "", note: "" }
      if (action === "approved") {
        const amountNumber = Number.parseFloat(edit.amount)
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
          present({
            title: "Enter amount",
            description: "Provide the approved fare before confirming.",
            tone: "warning",
          })
          return
        }
      } else if (!edit.note.trim()) {
        present({
          title: "Add context",
          description: "Share a quick note explaining why this quote was declined.",
          tone: "warning",
        })
        return
      }

      try {
        setQuoteActionState((prev) => ({ ...prev, [quote.id]: true }))
        const docRef = doc(firebase.firestore, "quoteRequests", quote.id)
        const amountNumber = Number.parseFloat(edit.amount)
        const currentUser = firebase.auth?.currentUser ?? null
        const decidedBy = buildDecidedByPayload(currentUser)
        await updateDoc(docRef, {
          response: {
            status: action,
            amountCents:
              action === "approved" && Number.isFinite(amountNumber)
                ? Math.round(amountNumber * 100)
                : null,
            message: edit.note.trim() || null,
            decidedAt: serverTimestamp(),
            decidedBy: decidedBy ?? null,
          },
          status: action,
          updatedAt: serverTimestamp(),
          lastActionBy: decidedBy ?? null,
        } as Record<string, unknown>)
        present({
          title: action === "approved" ? "Quote approved" : "Quote declined",
          description:
            action === "approved"
              ? `${quote.trip.origin ?? "Origin"} → ${quote.trip.destination ?? "Destination"}`
              : "Passenger will be notified of the update.",
          tone: action === "approved" ? "success" : "warning",
        })
        logSmokeEvent("dispatch_quote_decision", {
          action,
          quoteId: quote.id,
          operator: resolveActorLabel(decidedBy) ?? "dispatch",
          operatorUid: decidedBy?.uid ?? null,
          operatorEmail: decidedBy?.email ?? null,
        })
      } catch (error) {
        present({
          title: "Unable to update quote",
          description: error instanceof Error ? error.message : "Try again shortly.",
          tone: "danger",
        })
      } finally {
        setQuoteActionState((prev) => ({ ...prev, [quote.id]: false }))
      }
    },
    [firebase.auth, firebase.firestore, present, quoteEdits],
  )

  const requireReasonForForm = selectionTargets.some((booking) =>
    requiresReason(booking.status ?? "pending", statusForm.status),
  )

  const handleSelectionChange = useCallback((booking: BookingItem, nextSelected: boolean) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (nextSelected) {
        next[booking.id] = booking
      } else {
        delete next[booking.id]
      }
      return next
    })
  }, [])

  const handleStatusSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectionTargets.length) {
      present({
        title: "Select bookings",
        description: "Choose at least one booking to update.",
        tone: "warning",
      })
      return
    }
    if (requireReasonForForm && !statusForm.reasonCode) {
      present({
        title: "Reason required",
        description: "Pick a reason code before submitting.",
        tone: "warning",
      })
      return
    }
    try {
      await Promise.all(
        selectionTargets.map((booking) =>
          updateStatus.mutateAsync({
            bookingId: booking.id,
            status: statusForm.status,
            reasonCode: requireReasonForForm ? statusForm.reasonCode : statusForm.reasonCode || undefined,
            note: statusForm.note?.trim() || undefined,
          }),
        ),
      )
      present({
        title: "Statuses updated",
        description: `Applied ${STATUS_LABELS[statusForm.status] ?? statusForm.status} to ${
          selectionTargets.length
        } booking${selectionTargets.length === 1 ? "" : "s"}.`,
        tone: "success",
      })
      setStatusForm((prev) => ({ ...prev, note: "" }))
      triggerRefresh()
    } catch (error) {
      present({
        title: "Unable to update status",
        description: error instanceof Error ? error.message : "Please try again soon.",
        tone: "danger",
      })
    }
  }

  const handleAssignSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectionTargets.length) {
      present({
        title: "Select bookings",
        description: "Choose at least one booking to assign.",
        tone: "warning",
      })
      return
    }
    if (!assignForm.driverId.trim()) {
      present({
        title: "Driver ID required",
        description: "Provide the driver’s ID before assigning.",
        tone: "warning",
      })
      return
    }
    try {
      await assignDriver.mutateAsync({
        bookingIds: selectionTargets.map((booking) => booking.id),
        driverId: assignForm.driverId.trim(),
        driverName: assignForm.driverName.trim() || null,
        driverContact: {
          phone: assignForm.phone.trim() || null,
          email: assignForm.email.trim() || null,
        },
        notify: {
          sms: assignForm.notifyDriver,
          email: assignForm.notifyPassenger,
        },
      })
      present({
        title: "Drivers assigned",
        description: `Updated ${selectionTargets.length} booking${selectionTargets.length === 1 ? "" : "s"}.`,
        tone: "success",
      })
      triggerRefresh()
    } catch (error) {
      present({
        title: "Assignment failed",
        description: error instanceof Error ? error.message : "Please try again.",
        tone: "danger",
      })
    }
  }

  const handleSmsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectionTargets.length) {
      present({
        title: "Select bookings",
        description: "Choose at least one booking to message.",
        tone: "warning",
      })
      return
    }
    if (!smsForm.message.trim()) {
      present({
        title: "Message required",
        description: "Enter a short SMS update before sending.",
        tone: "warning",
      })
      return
    }
    try {
      const response = await sendBulkSms.mutateAsync({
        bookingIds: selectionTargets.map((booking) => booking.id),
        message: smsForm.message.trim(),
        recipient: smsForm.recipient,
      })
      present({
        title: "SMS sent",
        description: `Queued ${response.totalRecipients ?? selectionTargets.length} message(s).`,
        tone: "success",
      })
      setSmsForm((prev) => ({ ...prev, message: "" }))
    } catch (error) {
      present({
        title: "SMS failed",
        description: error instanceof Error ? error.message : "Please try again shortly.",
        tone: "danger",
      })
    }
  }

  const handlePricingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectionTargets.length) {
      present({
        title: "Select bookings",
        description: "Choose at least one booking before adjusting pricing.",
        tone: "warning",
      })
      return
    }
    const baseCents = dollarsToCents(pricingForm.base)
    const gstCents = dollarsToCents(pricingForm.gst)
    const tipCents = dollarsToCents(pricingForm.tip || "0")
    const totalCents = dollarsToCents(pricingForm.total)
    if ([baseCents, gstCents, totalCents].some((value) => Number.isNaN(value))) {
      present({
        title: "Invalid amount",
        description: "Enter numeric amounts before saving.",
        tone: "warning",
      })
      return
    }
    if (!pricingForm.reasonCode) {
      present({
        title: "Reason required",
        description: "Select a pricing adjustment reason.",
        tone: "warning",
      })
      return
    }
    try {
      await Promise.all(
        selectionTargets.map((booking) =>
          updatePricing.mutateAsync({
            bookingId: booking.id,
            baseCents,
            gstCents,
            tipCents: Number.isNaN(tipCents) ? 0 : tipCents,
            totalCents,
            reasonCode: pricingForm.reasonCode,
            reasonNote: pricingForm.reasonNote?.trim() || undefined,
            note: pricingForm.reasonNote?.trim() || undefined,
            requireSecondApproval: pricingForm.requireSecondApproval,
            secondApprover: null,
          }),
        ),
      )
      present({
        title: "Pricing updated",
        description: `Applied adjustments to ${selectionTargets.length} booking${
          selectionTargets.length === 1 ? "" : "s"
        }.`,
        tone: "success",
      })
      triggerRefresh()
    } catch (error) {
      present({
        title: "Pricing update failed",
        description: error instanceof Error ? error.message : "Please try again later.",
        tone: "danger",
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="p-6">
      <header className="flex flex-col gap-4 border-b border-horizon/15 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Dispatch workspace</p>
          <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">Dispatcher board</h2>
          <p className="mt-1 text-sm text-midnight/70">{selectionSummary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {statusChips.map((chip) => (
              <span
                key={chip.key}
                className={clsx(
                  "rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em]",
                  STATUS_CHIP_TONES[chip.tone],
                )}
              >
                {chip.label} · {chip.value}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em]">
          <button
            type="button"
            onClick={triggerRefresh}
            className="va-button va-button--subtle flex items-center gap-2 px-4 py-2"
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            Sync data
          </button>
            <button
              type="button"
              onClick={handleUndoAssignment}
              className="va-button va-button--ghost flex items-center gap-2 px-4 py-2"
              disabled={!undoStack.length}
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              Undo
            </button>
          <button
            type="button"
            onClick={clearSelection}
            className="va-button va-button--ghost flex items-center gap-2 px-4 py-2"
          >
            Clear selection
          </button>
        </div>
      </header>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {allViews.map((view) => {
          const isActive = currentView.id === view.id
          const isSaved = savedViewFilters.some((saved) => saved.id === view.id)
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => handleViewSelect(view.id)}
              className={clsx(
                "group flex items-center gap-2 rounded-full border px-4 py-2 text-xs uppercase tracking-[0.3em]",
                isActive ? "border-horizon bg-horizon text-white" : "border-horizon/25 bg-white/80 text-midnight/70",
              )}
            >
              {view.name}
              {isSaved ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleRemoveView(view.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      void handleRemoveView(view.id)
                    }
                  }}
                  className="rounded-full bg-white/20 px-1 text-[0.6rem] text-white/90 group-hover:bg-white/30"
                >
                  ×
                </span>
              ) : null}
            </button>
          )
        })}
        {viewsLoading ? (
          <span className="text-xs uppercase tracking-[0.3em] text-midnight/50">Syncing views…</span>
        ) : null}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[280px,1fr,360px]">

        <aside className="space-y-4">
          <div
            className={clsx(
              "rounded-3xl border border-horizon/15 bg-white/85 p-4 shadow-sm transition",
              activeDropTarget === QUEUE_DROP_ID ? "ring-2 ring-horizon/40" : "hover:border-horizon/30",
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setActiveDropTarget(QUEUE_DROP_ID)
            }}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget as Node | null
              if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                setActiveDropTarget(null)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              const bookingId = event.dataTransfer.getData("text/plain")
              if (bookingId) {
                handleDropToQueue(bookingId)
              }
            }}
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Unassigned queue</p>
                <h3 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">Backlog</h3>
              </div>
              <span className="rounded-full bg-horizon/10 px-3 py-1 text-xs font-semibold text-horizon">
                {unassignedQueue.length}
              </span>
            </header>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-midnight/60">
                <ListFilter className="h-4 w-4" aria-hidden />
                Filters
              </div>
              <div className="grid gap-3">
                <label className="flex flex-col text-[0.6rem] uppercase tracking-[0.3em] text-midnight/60">
                  Pickup window
                  <select
                    value={filters.pickupWindow}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        pickupWindow: event.target.value as DispatcherFilters["pickupWindow"],
                      }))
                    }
                    className="mt-1 w-full rounded-full border border-horizon/20 bg-white/85 px-3 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-midnight/70 focus:border-horizon focus:outline-none"
                  >
                    {pickupWindowOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col text-[0.6rem] uppercase tracking-[0.3em] text-midnight/60">
                  Airport
                  <select
                    value={filters.airport}
                    onChange={(event) => setFilters((prev) => ({ ...prev, airport: event.target.value }))}
                    className="mt-1 w-full rounded-full border border-horizon/20 bg-white/85 px-3 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-midnight/70 focus:border-horizon focus:outline-none"
                  >
                    {airportFilterOptions.length === 0 ? (
                      <option value="all">All airports</option>
                    ) : (
                      airportFilterOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === "all" ? "All airports" : option}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="flex flex-col text-[0.6rem] uppercase tracking-[0.3em] text-midnight/60">
                  Pax load
                  <select
                    value={filters.pax}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        pax: event.target.value as DispatcherFilters["pax"],
                      }))
                    }
                    className="mt-1 w-full rounded-full border border-horizon/20 bg-white/85 px-3 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-midnight/70 focus:border-horizon focus:outline-none"
                  >
                    {paxOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col text-[0.6rem] uppercase tracking-[0.3em] text-midnight/60">
                  Luggage
                  <select
                    value={filters.luggage}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        luggage: event.target.value as DispatcherFilters["luggage"],
                      }))
                    }
                    className="mt-1 w-full rounded-full border border-horizon/20 bg-white/85 px-3 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-midnight/70 focus:border-horizon focus:outline-none"
                  >
                    {luggageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
              {unassignedQueue.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-horizon/20 bg-white/70 px-4 py-6 text-center text-sm text-midnight/60">
                  Nothing waiting. Drag rides here to unassign or adjust your filters.
                </p>
              ) : (
                unassignedQueue.map((booking) => {
                  const pickup = getPickupTimestamp(booking)
                  const pickupLabel = pickup
                    ? format(new Date(pickup), "MMM d · h:mm a")
                    : booking.schedule?.pickupTime ?? "TBD"
                  const paxLabel =
                    booking.trip.passengerCount && booking.trip.passengerCount > 0
                      ? `${booking.trip.passengerCount} pax`
                      : "Pax ?"
                  const luggageLabel = getLuggageLabel(booking)
                  const status = booking.status ?? "pending"
                  const tone = STATUS_TONES[status] ?? "secondary"
                  const badgeClass = STATUS_BADGE_CLASSES[tone]
                  const isSelected = selectedIdSet.has(booking.id)
                  const isDragging = draggedBookingId === booking.id
                  return (
                    <div
                      key={booking.id}
                      className={clsx(
                        "cursor-pointer rounded-2xl border border-horizon/15 bg-white/90 p-4 shadow-sm transition",
                        isSelected ? "ring-2 ring-horizon/40" : "hover:border-horizon/30",
                        isDragging ? "opacity-60" : "",
                      )}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", booking.id)
                        event.dataTransfer.effectAllowed = "move"
                        setDraggedBookingId(booking.id)
                      }}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleBookingCardClick(booking)}
                    >
                      <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.3em]">
                        <span className={clsx("rounded-full border px-2 py-[0.3rem]", badgeClass)}>
                          {STATUS_LABELS[status] ?? status}
                        </span>
                        <span className="text-midnight/50">{pickupLabel}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-midnight">{formatRoute(booking)}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-midnight/60">
                        <span>{paxLabel}</span>
                        {luggageLabel ? <span>{luggageLabel}</span> : null}
                        {booking.trip.direction ? <span>{booking.trip.direction}</span> : null}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </aside>
        <section className="flex flex-col gap-4">
          <div className="rounded-3xl border border-horizon/15 bg-white/85 shadow-sm">
            <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Dispatcher board</p>
                <h3 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">
                  {format(selectedDate, "EEE, MMM d")}
                </h3>
                <p className="text-sm text-midnight/70">
                  {totalTripsForDay} trip{totalTripsForDay === 1 ? "" : "s"} scheduled
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-horizon/20 bg-white/85 px-3 py-1 text-xs uppercase tracking-[0.3em] text-midnight/70">
                  <button
                    type="button"
                    onClick={goToPreviousDay}
                    className="rounded-full border border-horizon/15 p-1 hover:border-horizon/40"
                  >
                    <MoveLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-horizon/60" aria-hidden />
                    {format(selectedDate, "MMM d")}
                  </div>
                  <button
                    type="button"
                    onClick={goToNextDay}
                    className="rounded-full border border-horizon/15 p-1 hover:border-horizon/40"
                  >
                    <MoveRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={goToToday}
                  className="va-button va-button--ghost px-4 py-2 text-xs uppercase tracking-[0.3em]"
                >
                  Today
                </button>
              </div>
            </div>
            <div className="border-t border-horizon/10">
              {bookingsErrorMessage ? (
                <div className="px-5 pt-5">
                  <ErrorBanner title="Bookings unavailable" message={bookingsErrorMessage} />
                </div>
              ) : null}
              {driversErrorMessage ? (
                <div className="px-5 pt-5">
                  <ErrorBanner title="Drivers unavailable" message={driversErrorMessage} />
                </div>
              ) : null}
              <div className="relative overflow-x-auto">
                <div className="min-w-[900px] px-5 py-6">
                  {bookingsLoading ? (
                    <div className="flex items-center justify-center py-24 text-midnight/60">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                      Syncing daily timeline…
                    </div>
                  ) : driverBoards.length === 0 ? (
                    <EmptyState
                      title="No drivers on deck"
                      description="Add drivers or adjust filters to see assignments for this day."
                    />
                  ) : (
                    <div className="flex gap-5">
                      {driverBoards.map(({ driver, placements, laneCount }) => {
                        const driverId = driver.id
                        const isActiveDrop = activeDropTarget === driverId
                        const timelineHeight =
                          Math.max(laneCount, 1) * LANE_HEIGHT_PX + Math.max(laneCount - 1, 0) * LANE_GAP_PX
                        const shiftLabel =
                          driver.shiftStart && driver.shiftEnd
                            ? `${format(new Date(driver.shiftStart), "h a")} – ${format(new Date(driver.shiftEnd), "h a")}`
                            : null
                        return (
                          <div
                            key={driverId}
                            className={clsx(
                              "flex min-w-[320px] flex-col rounded-3xl border border-horizon/15 bg-white/90 shadow-sm transition",
                              isActiveDrop ? "ring-2 ring-horizon/40" : "hover:border-horizon/30",
                            )}
                            onDragOver={(event) => {
                              event.preventDefault()
                              setActiveDropTarget(driverId)
                            }}
                            onDragLeave={(event) => {
                              const nextTarget = event.relatedTarget as Node | null
                              if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                                setActiveDropTarget(null)
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault()
                              const bookingId = event.dataTransfer.getData("text/plain")
                              if (bookingId) {
                                handleDropOnDriver(driverId, bookingId)
                              }
                            }}
                          >
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-horizon/60">{driver.name}</p>
                                <p className="text-xs text-midnight/60">
                                  {driver.vehicle ?? "Vehicle TBD"}
                                  {shiftLabel ? ` · ${shiftLabel}` : ""}
                                </p>
                              </div>
                              {driver.phone ? (
                                <span className="text-[0.6rem] uppercase tracking-[0.3em] text-midnight/40">{driver.phone}</span>
                              ) : null}
                            </div>
                            <div className="relative overflow-hidden border-t border-horizon/10 bg-sky-50/10 px-3 py-4">
                              <div
                                className="relative"
                                style={{
                                  width: `${timelineWidthPx}px`,
                                  height: `${Math.max(timelineHeight, LANE_HEIGHT_PX)}px`,
                                }}
                              >
                                {Array.from({ length: 25 }).map((_, index) => {
                                  const leftPercent = (index / 24) * 100
                                  return (
                                    <div
                                      key={`${driverId}-tick-${index}`}
                                      className={clsx(
                                        "absolute top-0 h-full border-l border-horizon/10",
                                        index === 0 ? "border-horizon/20" : "",
                                      )}
                                      style={{ left: `${leftPercent}%` }}
                                    >
                                      {index < 24 && index % 4 === 0 ? (
                                        <span className="absolute -top-5 text-[0.6rem] uppercase tracking-[0.3em] text-midnight/40">
                                          {format(new Date(dayStartMs + index * 60 * MS_PER_MINUTE), "haaa")}
                                        </span>
                                      ) : null}
                                    </div>
                                  )
                                })}
                                {placements.length === 0 ? (
                                  <p className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.3em] text-midnight/40">
                                    No trips assigned
                                  </p>
                                ) : null}
                                {placements.map((placement) => {
                                  const booking = placement.booking
                                  const pickup = getPickupTimestamp(booking)
                                  const pickupLabel = pickup
                                    ? format(new Date(pickup), "h:mm a")
                                    : booking.schedule?.pickupTime ?? "TBD"
                                  const status = booking.status ?? "pending"
                                  const tone = STATUS_TONES[status] ?? "secondary"
                                  const borderClass = STATUS_BORDER_CLASSES[tone]
                                  const badgeClass = STATUS_BADGE_CLASSES[tone]
                                  const isSelected = selectedIdSet.has(booking.id)
                                  const isDragging = draggedBookingId === booking.id
                                  const leftPx = placement.leftRatio * timelineWidthPx
                                  const widthPx = placement.widthRatio * timelineWidthPx
                                  return (
                                    <div
                                      key={booking.id}
                                      className={clsx(
                                        "absolute cursor-pointer rounded-2xl border bg-white/95 p-3 shadow-sm transition",
                                        borderClass,
                                        isSelected ? "ring-2 ring-horizon/40" : "hover:border-horizon/40",
                                        isDragging ? "opacity-60" : "",
                                      )}
                                      style={{
                                        left: `${leftPx}px`,
                                        width: `${widthPx}px`,
                                        top: `${placement.lane * (LANE_HEIGHT_PX + LANE_GAP_PX)}px`,
                                      }}
                                      draggable
                                      onDragStart={(event) => {
                                        event.dataTransfer.setData("text/plain", booking.id)
                                        event.dataTransfer.effectAllowed = "move"
                                        setDraggedBookingId(booking.id)
                                      }}
                                      onDragEnd={handleDragEnd}
                                      onClick={() => handleBookingCardClick(booking)}
                                    >
                                      <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.3em]">
                                        <span className={clsx("rounded-full border px-2 py-[0.3rem]", badgeClass)}>
                                          {STATUS_LABELS[status] ?? status}
                                        </span>
                                        <span>{pickupLabel}</span>
                                      </div>
                                      <p className="mt-2 text-sm font-semibold text-midnight">{formatRoute(booking)}</p>
                                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-midnight/60">
                                        <span>{booking.trip.passengerCount ?? "?"} pax</span>
                                        {booking.trip.direction ? <span>{booking.trip.direction}</span> : null}
                                      </div>
                                      <div className="mt-2 flex items-center gap-2 text-[0.65rem] text-midnight/60">
                                        <Clock className="h-3.5 w-3.5" aria-hidden />
                                        {Math.round(placement.durationMinutes)} min est.
                                      </div>
                                      {placement.warnings.length ? (
                                        <div className="mt-3 flex items-start gap-2 text-[0.65rem] text-amber-700">
                                          <AlertTriangle className="mt-[0.1rem] h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                                          <span>{placement.warnings.join(" • ")}</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="space-y-4">
          <div className="rounded-3xl border border-horizon/15 bg-white/85 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Selection</p>
                <h3 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">Overview</h3>
              </div>
              <span className="rounded-full bg-horizon/10 px-3 py-1 text-xs font-semibold text-horizon">
                {selectedBookings.length}
              </span>
            </div>
            <p className="mt-3 text-sm text-midnight/70">{selectionSummary}</p>
            {primaryBooking ? (
              <div className="mt-3 space-y-2 text-xs text-midnight/60">
                <p>
                  <span className="uppercase tracking-[0.25em] text-midnight/50">Passenger</span>{" "}
                  {primaryBooking.passenger.primaryPassenger ?? "TBD"}
                </p>
                <p>
                  <span className="uppercase tracking-[0.25em] text-midnight/50">Status</span>{" "}
                  {STATUS_LABELS[primaryBooking.status ?? "pending"] ?? primaryBooking.status}
                </p>
                {primaryBooking.assignment?.driverName ? (
                  <p>
                    <span className="uppercase tracking-[0.25em] text-midnight/50">Driver</span>{" "}
                    {primaryBooking.assignment.driverName}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAuditOpen((open) => !open)}
                className="va-button va-button--ghost px-4 py-2 text-xs uppercase tracking-[0.3em]"
                disabled={!primaryBooking}
              >
                {auditOpen ? "Hide audit" : "Show audit"}
              </button>
            </div>
          </div>
          {auditOpen ? (
            <div className="rounded-3xl border border-horizon/15 bg-white/85 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-horizon/70">Audit trail</p>
                  <h4 className="font-heading text-base uppercase tracking-[0.3em] text-horizon">
                    {primaryBooking ? `#${primaryBooking.bookingNumber ?? primaryBooking.id.slice(0, 6)}` : "No booking"}
                  </h4>
                </div>
                <Clock className="h-4 w-4 text-horizon/60" aria-hidden />
              </div>
              <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                {primaryBooking?.statusHistory?.length ? (
                  primaryBooking.statusHistory
                    .slice()
                    .reverse()
                    .map((entry, index) => {
                      const timestamp = entry.timestamp ? new Date(entry.timestamp) : null
                      const relative = timestamp ? formatDistanceToNow(timestamp, { addSuffix: true }) : "Unknown"
                      return (
                        <div
                          key={`${entry.status}-${index}`}
                          className="rounded-2xl border border-horizon/10 bg-white/90 px-3 py-2 text-xs text-midnight/70"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-midnight/80">
                              {STATUS_LABELS[entry.status] ?? entry.status}
                            </span>
                            <span className="text-[0.6rem] uppercase tracking-[0.3em] text-midnight/40">{relative}</span>
                          </div>
                          {entry.actor?.name ? (
                            <p className="mt-1 text-[0.65rem] uppercase tracking-[0.25em] text-midnight/50">
                              By {entry.actor.name}
                            </p>
                          ) : null}
                          {entry.note ? <p className="mt-1 text-[0.7rem] text-midnight/60">{entry.note}</p> : null}
                        </div>
                      )
                    })
                ) : (
                  <p className="text-sm text-midnight/60">No audit events logged yet.</p>
                )}
              </div>
            </div>
          ) : null}
          <div className="space-y-4">
          <ActionCard
            title="Update status"
            description="Apply the next state and notify passengers as needed."
            icon={AlignVerticalJustifyStart}
            active={activePanel === "status"}
            onActivate={() => setActivePanel("status")}
          >
            <form className="space-y-3" onSubmit={handleStatusSubmit}>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Status
                <select
                  value={statusForm.status}
                  onChange={(event) =>
                    setStatusForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                >
                  {Object.keys(STATUS_LABELS).map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Reason code {requireReasonForForm ? "(required)" : "(optional)"}
                <select
                  value={statusForm.reasonCode}
                  onChange={(event) =>
                    setStatusForm((prev) => ({ ...prev, reasonCode: event.target.value }))
                  }
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                >
                  <option value="">Select reason</option>
                  {STATUS_REASON_CODES.map((code) => (
                    <option key={code.value} value={code.value}>
                      {code.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Internal note
                <textarea
                  value={statusForm.note}
                  onChange={(event) =>
                    setStatusForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  rows={2}
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                  placeholder="Optional note for audit trail"
                />
              </label>
              <button
                type="submit"
                className="va-button va-button--primary w-full justify-center px-4 py-2"
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Updating...
                  </>
                ) : (
                  "Apply status"
                )}
              </button>
            </form>
          </ActionCard>
          <ActionCard
            title="Assign driver"
            description="Dispatch selected bookings to a driver and notify the parties."
            icon={UserCheck}
            active={activePanel === "assign"}
            onActivate={() => setActivePanel("assign")}
          >
            <form className="space-y-3" onSubmit={handleAssignSubmit}>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Driver ID
                <input
                  type="text"
                  value={assignForm.driverId}
                  onChange={(event) =>
                    setAssignForm((prev) => ({ ...prev, driverId: event.target.value }))
                  }
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                  placeholder="ops-123"
                />
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Driver name
                <input
                  type="text"
                  value={assignForm.driverName}
                  onChange={(event) =>
                    setAssignForm((prev) => ({ ...prev, driverName: event.target.value }))
                  }
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                  placeholder="Mercedes Crew"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                  Phone
                  <input
                    type="tel"
                    value={assignForm.phone}
                    onChange={(event) =>
                      setAssignForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                    className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                    placeholder="604-555-0199"
                  />
                </label>
                <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                  Email
                  <input
                    type="email"
                    value={assignForm.email}
                    onChange={(event) =>
                      setAssignForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                    placeholder="driver@valleyairporter.ca"
                  />
                </label>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl border border-horizon/20 px-3 py-2 text-xs text-midnight/70">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-horizon/40"
                    checked={assignForm.notifyDriver}
                    onChange={(event) =>
                      setAssignForm((prev) => ({ ...prev, notifyDriver: event.target.checked }))
                    }
                  />
                  Notify driver via SMS
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-horizon/40"
                    checked={assignForm.notifyPassenger}
                    onChange={(event) =>
                      setAssignForm((prev) => ({ ...prev, notifyPassenger: event.target.checked }))
                    }
                  />
                  Email passenger assignment details
                </label>
              </div>
              <button
                type="submit"
                className="va-button va-button--secondary w-full justify-center px-4 py-2"
                disabled={assignDriver.isPending}
              >
                {assignDriver.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Assigning...
                  </>
                ) : (
                  "Assign driver"
                )}
              </button>
            </form>
          </ActionCard>
          <ActionCard
            title="Bulk SMS"
            description="Send a quick update to passengers or drivers."
            icon={MessageSquare}
            active={activePanel === "sms"}
            onActivate={() => setActivePanel("sms")}
          >
            <form className="space-y-3" onSubmit={handleSmsSubmit}>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Recipient
                <select
                  value={smsForm.recipient}
                  onChange={(event) =>
                    setSmsForm((prev) => ({
                      ...prev,
                      recipient: event.target.value as "passenger" | "driver" | "both",
                    }))
                  }
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                >
                  <option value="passenger">Passengers</option>
                  <option value="driver">Drivers</option>
                  <option value="both">Passengers + drivers</option>
                </select>
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Message
                <textarea
                  rows={3}
                  value={smsForm.message}
                  onChange={(event) =>
                    setSmsForm((prev) => ({ ...prev, message: event.target.value }))
                  }
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                  placeholder="Traffic delay of ~10 minutes, thank you for your patience."
                />
              </label>
              <button
                type="submit"
                className="va-button va-button--ghost w-full justify-center px-4 py-2"
                disabled={sendBulkSms.isPending}
              >
                {sendBulkSms.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Sending...
                  </>
                ) : (
                  "Send SMS"
                )}
              </button>
            </form>
          </ActionCard>
          <ActionCard
            title="Adjust pricing"
            description="Submit manual overrides with approval notes."
            icon={DollarSign}
            active={activePanel === "pricing"}
            onActivate={() => setActivePanel("pricing")}
          >
            <form className="space-y-3" onSubmit={handlePricingSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                {(["base", "gst", "tip", "total"] as const).map((field) => (
                  <label
                    key={field}
                    className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60"
                  >
                    {field.toUpperCase()} (CAD)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pricingForm[field]}
                      onChange={(event) =>
                        setPricingForm((prev) => ({ ...prev, [field]: event.target.value }))
                      }
                      className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                    />
                  </label>
                ))}
              </div>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Reason code
                <select
                  value={pricingForm.reasonCode}
                  onChange={(event) =>
                    setPricingForm((prev) => ({ ...prev, reasonCode: event.target.value }))
                  }
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                >
                  <option value="">Select reason</option>
                  {PRICING_ADJUST_REASON_CODES.map((code) => (
                    <option key={code.value} value={code.value}>
                      {code.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Approval notes
                <textarea
                  rows={2}
                  value={pricingForm.reasonNote}
                  onChange={(event) =>
                    setPricingForm((prev) => ({ ...prev, reasonNote: event.target.value }))
                  }
                  className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                  placeholder="Add context for finance/QA review."
                />
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-horizon/20 px-3 py-2 text-xs text-midnight/70">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-horizon/40"
                  checked={pricingForm.requireSecondApproval}
                  onChange={(event) =>
                    setPricingForm((prev) => ({ ...prev, requireSecondApproval: event.target.checked }))
                  }
                />
                Require second approval
              </label>
              <button
                type="submit"
                className="va-button va-button--secondary w-full justify-center px-4 py-2"
                disabled={updatePricing.isPending}
              >
                {updatePricing.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Saving...
                  </>
                ) : (
                  "Save pricing"
                )}
              </button>
            </form>
          </ActionCard>
          </div>
        </div>
      </div>
      </GlassPanel>

      <GlassPanel className="p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Manual quote queue</p>
          <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">Dispatch reviews</h2>
        </div>
        {quoteLoading ? (
          <span className="text-xs uppercase tracking-[0.3em] text-midnight/50">Syncing…</span>
        ) : null}
      </header>
      {quoteError ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {quoteError.message}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-midnight/60">
        <div className="flex items-center gap-1 rounded-full border border-horizon/20 bg-white/80 p-1">
          {[
            { id: "open", label: "Awaiting" },
            { id: "approved", label: "Approved" },
            { id: "declined", label: "Declined" },
            { id: "all", label: "All" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setQuoteFilter(option.id as typeof quoteFilter)}
              className={clsx(
                "rounded-full px-4 py-2 transition",
                quoteFilter === option.id
                  ? "bg-horizon text-white shadow-sm"
                  : "text-midnight/60 hover:bg-horizon/10",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            type="search"
            value={quoteSearch}
            onChange={(event) => setQuoteSearch(event.target.value)}
            placeholder="Search passenger, route, or ID"
            className="rounded-full border border-horizon/20 bg-white/80 px-4 py-2 pr-10 text-[0.75rem] uppercase tracking-[0.25em]"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-horizon/50 text-xs">
            🔍
          </span>
        </div>
      </div>
      {filteredQuoteRequests.length === 0 && !quoteLoading ? (
        <p className="mt-4 text-sm text-midnight/70">No manual quote requests match your filters.</p>
      ) : null}
      <div className="mt-4 space-y-4">
        {filteredQuoteRequests.map((quote) => {
          const edit = quoteEdits[quote.id] ?? { amount: "", note: "" }
          const responded = (quote.response?.status ?? quote.status)?.toLowerCase() !== "open"
          const createdAgo = quote.createdAt
            ? formatDistanceToNow(quote.createdAt, { addSuffix: true })
            : "Just now"
          const decidedAtDate = quote.response?.decidedAt ?? null
          const decidedAgo = decidedAtDate ? formatDistanceToNow(decidedAtDate, { addSuffix: true }) : null
          const decidedByLabel = resolveActorLabel(quote.response?.decidedBy)
          const chipTone =
            quote.status === "approved"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : quote.status === "declined"
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : "bg-sky-50 border-sky-200 text-sky-700"
          return (
            <div
              key={quote.id}
              className="rounded-3xl border border-horizon/15 bg-white/85 p-4 shadow-sm md:flex md:items-start md:justify-between md:gap-6"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em]">
                  <span className={clsx("rounded-full border px-3 py-1", chipTone)}>{quote.status}</span>
                  <span className="text-midnight/60">{createdAgo}</span>
                  <span className="text-midnight/60">ID {quote.id.slice(0, 6)}</span>
                </div>
                <p className="text-sm font-semibold text-midnight">{quote.trip.origin ?? "Origin"} → {quote.trip.destination ?? "Destination"}</p>
                <p className="text-sm text-midnight/70">
                  {quote.trip.direction} • {quote.trip.passengerCount ?? "?"} pax • Pickup {quote.schedule?.pickupDate ?? "TBD"} {quote.schedule?.pickupTime ?? ""}
                </p>
                <p className="text-sm text-midnight/70">
                  Passenger: {quote.passenger.name ?? "Unknown"} · {quote.passenger.email ?? "No email"}
                </p>
                {decidedAgo && decidedByLabel ? (
                  <p className="text-xs text-midnight/60">
                    Last action by {decidedByLabel} · {decidedAgo}
                  </p>
                ) : null}
                {quote.response?.message ? (
                  <p className="text-xs text-midnight/60">Last note: {quote.response.message}</p>
                ) : null}
              </div>
              <div className="mt-4 w-full space-y-3 md:mt-0 md:w-80">
                <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                  Approved fare (CAD)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={responded || quoteActionState[quote.id]}
                    value={edit.amount}
                    onChange={(event) => handleQuoteEditChange(quote.id, "amount", event.target.value)}
                    className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                    placeholder="eg. 245.00"
                  />
                </label>
                <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                  Notes for passenger
                  <textarea
                    rows={2}
                    disabled={quoteActionState[quote.id]}
                    value={edit.note}
                    onChange={(event) => handleQuoteEditChange(quote.id, "note", event.target.value)}
                    className="mt-2 rounded-2xl border border-horizon/30 px-3 py-2 text-base text-midnight"
                    placeholder="Share context or special routing info"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleQuoteDecision(quote, "approved")}
                    disabled={responded || quoteActionState[quote.id]}
                    className="va-button va-button--primary flex-1 justify-center px-4 py-2"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuoteDecision(quote, "declined")}
                    disabled={responded || quoteActionState[quote.id]}
                    className="va-button va-button--ghost flex-1 justify-center px-4 py-2 text-ember"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      </GlassPanel>
      <GlassPanel className="p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Smoke tests</p>
            <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
              QA event trail
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshSmokeLog}
              className="va-button va-button--ghost px-4 py-[0.55rem] text-xs"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleClearSmokeLog}
              className="va-button va-button--subtle px-4 py-[0.55rem] text-xs"
            >
              Clear log
            </button>
          </div>
        </header>
        {smokeEvents.length === 0 ? (
          <p className="mt-4 text-sm text-midnight/70">
            No smoke events captured yet. Run through the booking wizard or dispatch workflows to populate this log.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {smokeEvents.map((entry, index) => {
              const timestamp = entry.ts ? new Date(entry.ts) : null
              const relative = timestamp ? formatDistanceToNow(timestamp, { addSuffix: true }) : null
              return (
                <div
                  key={`${entry.ts}-${entry.event}-${index}`}
                  className="rounded-2xl border border-horizon/15 bg-white/80 px-4 py-3 text-sm text-midnight/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-midnight/90">{entry.event}</span>
                    <span className="text-xs uppercase tracking-[0.3em] text-midnight/50">
                      {relative ?? entry.ts}
                    </span>
                  </div>
                  {entry.meta ? (
                    <pre className="mt-3 max-h-44 overflow-y-auto rounded-xl bg-midnight/5 px-3 py-2 text-xs text-midnight/70">
                      {JSON.stringify(entry.meta, null, 2)}
                    </pre>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </GlassPanel>
    </div>
  )
}

const ActionCard = ({
  title,
  description,
  icon: Icon,
  children,
  active,
  onActivate,
}: {
  title: string
  description: string
  icon: LucideIcon
  children: ReactNode
  active?: boolean
  onActivate?: () => void
}) => (
  <div
    className={clsx(
      "rounded-2xl border border-horizon/15 bg-white/80 p-4 transition",
      active ? "ring-2 ring-horizon/40 shadow-glow" : "hover:border-horizon/40",
    )}
  >
    <button
      type="button"
      onClick={onActivate}
      className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-horizon/70"
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>{title}</span>
    </button>
    <p className="mt-1 text-xs text-midnight/70">{description}</p>
    <div className="mt-3 space-y-3">{children}</div>
  </div>
)

const centsToDollars = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return ""
  return (value / 100).toFixed(2)
}

const dollarsToCents = (value: string) => {
  if (!value || value.trim().length === 0) return NaN
  const sanitized = value.replace(/[^0-9.-]/g, "")
  const amount = Number.parseFloat(sanitized)
  if (!Number.isFinite(amount)) return NaN
  return Math.round(amount * 100)
}

function getPickupTimestamp(booking: BookingItem): number | null {
  const schedule = booking.schedule ?? {}
  const rawTimestamp = schedule.pickupTimestamp
  if (typeof rawTimestamp === "number" && Number.isFinite(rawTimestamp)) {
    return rawTimestamp
  }
  if (rawTimestamp && typeof (rawTimestamp as { toMillis?: () => number }).toMillis === "function") {
    try {
      return (rawTimestamp as { toMillis?: () => number }).toMillis?.() ?? null
    } catch {
      // fall through to parsing below
    }
  }
  if (typeof schedule.pickupDate === "string" && schedule.pickupDate) {
    const timePart = typeof schedule.pickupTime === "string" && schedule.pickupTime ? schedule.pickupTime : "00:00"
    const isoCandidate = `${schedule.pickupDate} ${timePart}`
    const parsed = new Date(isoCandidate)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime()
    }
  }
  return null
}

function matchesPickupWindow(window: DispatcherFilters["pickupWindow"], pickupMs: number) {
  if (window === "all") return true
  const pickupDate = new Date(pickupMs)
  const hour = pickupDate.getHours()
  if (window === "next2h") {
    return pickupMs <= Date.now() + 2 * 60 * MS_PER_MINUTE
  }
  if (window === "morning") {
    return hour >= 5 && hour < 12
  }
  if (window === "afternoon") {
    return hour >= 12 && hour < 17
  }
  if (window === "evening") {
    return hour >= 17 && hour < 22
  }
  if (window === "overnight") {
    return hour >= 22 || hour < 5
  }
  return true
}

function classifyPassengerBucket(booking: BookingItem): DispatcherFilters["pax"] {
  const count = Number.isFinite(booking.trip.passengerCount)
    ? (booking.trip.passengerCount as number)
    : 0
  if (count >= 5) return "5+"
  if (count >= 3) return "3-4"
  return "1-2"
}

function classifyLuggageBucket(booking: BookingItem): DispatcherFilters["luggage"] {
  const baggage = booking.passenger?.baggage?.toLowerCase() ?? ""
  if (!baggage.trim()) {
    return "none"
  }
  if (
    /\b(oversize|snowboard|ski|bike|stroller|heavy|large|4|5|6|7|8|9|10)\b/.test(baggage) ||
    baggage.includes("extra large")
  ) {
    return "heavy"
  }
  if (/\b(2|pair|checked)\b/.test(baggage) || baggage.includes("carry")) {
    return "standard"
  }
  return "standard"
}

function extractAirportCode(booking: BookingItem): string | null {
  const candidates = [booking.trip.destination, booking.trip.origin, booking.trip.destinationAddress, booking.trip.originAddress]
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean)
  for (const candidate of candidates) {
    const match = candidate.match(/\(([A-Z]{3,4})\)/)
    if (match) {
      return match[1]
    }
  }
  const fallback = candidates[0]?.split(",")[0]?.trim()
  return fallback?.length ? fallback : null
}

function getLuggageLabel(booking: BookingItem): string | null {
  const bucket = classifyLuggageBucket(booking)
  if (bucket === "none") return null
  if (bucket === "heavy") return "Heavy load"
  return "Standard load"
}

function formatRoute(booking: BookingItem): string {
  const origin = booking.trip.origin || booking.trip.originAddress || "Origin"
  const destination = booking.trip.destination || booking.trip.destinationAddress || "Destination"
  return `${origin} → ${destination}`
}

function estimateDurationMinutes(booking: BookingItem): number {
  const duration = booking.pricing?.distanceDetails?.durationMinutes
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    return Math.max(duration, MIN_TRIP_DURATION_MIN)
  }
  return DEFAULT_TRIP_DURATION_MIN
}

function buildTimelinePlacements(
  bookings: BookingItem[],
  dayStartMs: number,
  dayEndMs: number,
): { placements: TimelinePlacement[]; laneCount: number } {
  const entries = bookings
    .map((booking) => ({ booking, pickup: getPickupTimestamp(booking) }))
    .filter((entry): entry is { booking: BookingItem; pickup: number } => entry.pickup !== null)
    .filter((entry) => entry.pickup >= dayStartMs && entry.pickup < dayEndMs)
    .sort((a, b) => a.pickup - b.pickup)

  const placements: TimelinePlacement[] = []
  const laneEndMinutes: number[] = []
  let previousEndMinutes: number | null = null

  entries.forEach(({ booking, pickup }) => {
    const startMinutes = (pickup - dayStartMs) / MS_PER_MINUTE
    if (startMinutes >= MINUTES_IN_DAY) return
    const duration = estimateDurationMinutes(booking)
    const endMinutes = startMinutes + duration
    const clampedStart = Math.max(0, startMinutes)
    const clampedEnd = Math.min(MINUTES_IN_DAY, endMinutes)
    if (clampedEnd <= clampedStart) return

    let laneIndex = laneEndMinutes.findIndex((end) => startMinutes >= end + TURNAROUND_BUFFER_MIN)
    if (laneIndex === -1) {
      laneIndex = laneEndMinutes.length
      laneEndMinutes.push(endMinutes)
    } else {
      laneEndMinutes[laneIndex] = Math.max(endMinutes, laneEndMinutes[laneIndex])
    }

    const totalMinutes = Math.max(clampedEnd - clampedStart, MIN_TRIP_DURATION_MIN)
    const leftRatio = Math.max(0, Math.min(1, clampedStart / MINUTES_IN_DAY))
    const widthRatio = Math.min(1 - leftRatio, Math.max(totalMinutes / MINUTES_IN_DAY, MIN_WIDTH_RATIO))

    let gapMinutes: number | null = null
    let warnings: string[] = []
    if (previousEndMinutes !== null) {
      gapMinutes = clampedStart - previousEndMinutes
      if (gapMinutes < 0) {
        warnings.push("Overlaps with previous trip")
      }
      if (gapMinutes < TURNAROUND_BUFFER_MIN) {
        const rounded = Math.max(0, Math.round(gapMinutes))
        warnings.push(`Tight turnaround (${rounded} min)`)
      }
    }

    placements.push({
      booking,
      lane: laneIndex,
      leftRatio,
      widthRatio,
      startMinutes: clampedStart,
      durationMinutes: totalMinutes,
      conflict: gapMinutes !== null && gapMinutes < 0,
      gapMinutes,
      warnings,
    })

    previousEndMinutes = previousEndMinutes === null ? clampedEnd : Math.max(previousEndMinutes, clampedEnd)
  })

  return {
    placements,
    laneCount: Math.max(laneEndMinutes.length, 1),
  }
}
