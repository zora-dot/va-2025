import { useEffect, useMemo, useState } from "react"
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns"
import { clsx } from "clsx"
import { Loader2, RefreshCcw, UserCheck, Users, CalendarDays, MapPin, CheckCircle2 } from "lucide-react"
import { RoleGate } from "@/components/layout/RoleGate"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { EmptyState, ErrorBanner } from "@/components/ui/Feedback"
import { useAssignDriver, useRealtimeBookings } from "@/features/bookings/hooks"
import type { BookingItem } from "@/features/bookings/types"
import { useDriversDirectory, type DriverProfile } from "@/features/drivers/hooks"
import { useToast } from "@/components/ui/ToastProvider"
import { useFirebase } from "@/lib/hooks/useFirebase"
import { doc, getDoc } from "firebase/firestore"

type AssignableDriver = DriverProfile & { seeded?: boolean }

const seededDrivers: AssignableDriver[] = [
  {
    id: "driver-zora",
    name: "Zora",
    phone: "+1 778-878-0546",
    email: "zora.randhawa@outlook.com",
    calendarId:
      "7329704e607f46a6c18ba1549ca73ea5cf246657989f02e2a2789ad4039ba5a3@group.calendar.google.com",
    vehicle: "Fleet reserve",
    status: "available",
    seeded: true,
    active: true,
    note: "Seed driver for testing",
  },
]

const UNASSIGNED_PAGE_SIZE = 10
const CALENDAR_PAGE_SIZE = 10

const getPickupDate = (booking: BookingItem) => {
  const ts = booking.schedule?.pickupTimestamp
  if (typeof ts === "number" && Number.isFinite(ts)) {
    return new Date(ts)
  }
  const date = booking.schedule?.pickupDate
  if (typeof date === "string" && date.trim().length > 0) {
    const parsed = Date.parse(date)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed)
    }
  }
  return null
}

const formatPickupLabel = (booking: BookingItem) => {
  const date = getPickupDate(booking)
  if (date) {
    return `${format(date, "EEE, MMM d")} • ${format(date, "h:mm a")}`
  }
  const dateLabel = booking.schedule?.pickupDate ?? "Date pending"
  const timeLabel = booking.schedule?.pickupTime ? ` • ${booking.schedule.pickupTime}` : ""
  return `${dateLabel}${timeLabel}`
}

const formatRelativeLabel = (booking: BookingItem) => {
  const date = getPickupDate(booking)
  if (!date) return "Schedule pending"
  return formatDistanceToNow(date, { addSuffix: true })
}

const formatBookingNumberDisplay = (booking: BookingItem) => {
  if (typeof booking.bookingNumber === "number") {
    return booking.bookingNumber.toString().padStart(5, "0")
  }
  return "—"
}

const bookingSearchText = (booking: BookingItem) => {
  const parts = [
    booking.passenger?.primaryPassenger,
    booking.passenger?.phone,
    booking.trip?.origin,
    booking.trip?.originAddress,
    booking.trip?.destination,
    booking.trip?.destinationAddress,
    booking.bookingNumber ? booking.bookingNumber.toString() : null,
  ]
  return parts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase()
}

const driverSearchText = (name?: string | null, phone?: string | null, email?: string | null) =>
  [name, phone, email]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase()

export const AdminAssignPage = () => {
  const assignDriverMutation = useAssignDriver()
  const { bookings, loading, refreshing, error, refresh } = useRealtimeBookings({
    scope: "upcoming",
    limit: 120,
  })
  const { drivers, loading: driversLoading } = useDriversDirectory()
  const { present } = useToast()
  const firebase = useFirebase()

  const assignableDrivers = useMemo<AssignableDriver[]>(() => {
    if (drivers.length > 0) {
      return drivers.map((driver) => ({ ...driver, seeded: false }))
    }
    return seededDrivers
  }, [drivers])

  const usingSeededDrivers = drivers.length === 0

  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set())
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set())
  const [driverSearch, setDriverSearch] = useState("")
  const [bookingSearch, setBookingSearch] = useState("")
  const [notifyOptions, setNotifyOptions] = useState({ email: true, sms: true })
  const [unassignedPage, setUnassignedPage] = useState(0)
  const [calendarPage, setCalendarPage] = useState(0)

  const unassignedBookings = useMemo(
    () => bookings.filter((booking) => !booking.assignment?.driverId),
    [bookings],
  )
  const assignedBookings = useMemo(
    () => bookings.filter((booking) => Boolean(booking.assignment?.driverId)),
    [bookings],
  )

  const selectedBookings = useMemo(
    () => bookings.filter((booking) => selectedBookingIds.has(booking.id)),
    [bookings, selectedBookingIds],
  )

  const selectedDrivers = useMemo(
    () => assignableDrivers.filter((driver) => selectedDriverIds.has(driver.id)),
    [assignableDrivers, selectedDriverIds],
  )

  const selectedAssignedBookingIds = useMemo(
    () =>
      bookings
        .filter((booking) => selectedBookingIds.has(booking.id) && Boolean(booking.assignment?.driverId))
        .map((booking) => booking.id),
    [bookings, selectedBookingIds],
  )

  const filteredDrivers = useMemo(() => {
    if (!driverSearch.trim()) return assignableDrivers
    const term = driverSearch.trim().toLowerCase()
    return assignableDrivers.filter((driver) =>
      driverSearchText(driver.name, driver.phone, driver.email).includes(term),
    )
  }, [assignableDrivers, driverSearch])

  const filteredUnassigned = useMemo(() => {
    if (!bookingSearch.trim()) return unassignedBookings
    const term = bookingSearch.trim().toLowerCase()
    return unassignedBookings.filter((booking) => bookingSearchText(booking).includes(term))
  }, [bookingSearch, unassignedBookings])

  const unassignedPageCount = Math.max(1, Math.ceil(filteredUnassigned.length / UNASSIGNED_PAGE_SIZE))
  const pagedUnassigned = useMemo(() => {
    const start = unassignedPage * UNASSIGNED_PAGE_SIZE
    return filteredUnassigned.slice(start, start + UNASSIGNED_PAGE_SIZE)
  }, [filteredUnassigned, unassignedPage])

  const calendarDays = useMemo(() => {
    const map = new Map<string, { date: Date; label: string; bookings: BookingItem[] }>()
    bookings.forEach((booking) => {
      const pickupDate = getPickupDate(booking)
      if (!pickupDate) return
      const key = format(pickupDate, "yyyy-MM-dd")
      if (!map.has(key)) {
        map.set(key, {
          date: pickupDate,
          label: format(pickupDate, "EEE, MMM d"),
          bookings: [],
        })
      }
      map.get(key)!.bookings.push(booking)
    })

    return Array.from(map.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((entry) => ({
        ...entry,
        bookings: entry.bookings.sort((a, b) => {
          const aDate = getPickupDate(a)?.getTime() ?? 0
          const bDate = getPickupDate(b)?.getTime() ?? 0
          return aDate - bDate
        }),
      }))
  }, [bookings])

  const calendarPageCount = Math.max(1, Math.ceil(calendarDays.length / CALENDAR_PAGE_SIZE))
  const pagedCalendarDays = useMemo(() => {
    const start = calendarPage * CALENDAR_PAGE_SIZE
    return calendarDays.slice(start, start + CALENDAR_PAGE_SIZE)
  }, [calendarDays, calendarPage])

  useEffect(() => {
    setUnassignedPage((current) => {
      const maxPage = Math.max(unassignedPageCount - 1, 0)
      return current > maxPage ? maxPage : current
    })
  }, [unassignedPageCount])

  useEffect(() => {
    setCalendarPage((current) => {
      const maxPage = Math.max(calendarPageCount - 1, 0)
      return current > maxPage ? maxPage : current
    })
  }, [calendarPageCount])

  useEffect(() => {
    setUnassignedPage(0)
  }, [bookingSearch])

  const toggleBooking = (bookingId: string) => {
    setSelectedBookingIds((current) => {
      const next = new Set(current)
      if (next.has(bookingId)) {
        next.delete(bookingId)
      } else {
        next.add(bookingId)
      }
      return next
    })
  }

  const toggleDriver = (driverId: string) => {
    setSelectedDriverIds((current) => {
      const next = new Set(current)
      if (next.has(driverId)) {
        next.delete(driverId)
      } else {
        next.add(driverId)
      }
      return next
    })
  }

  const clearSelections = () => {
    setSelectedBookingIds(new Set())
  }

  const clearDrivers = () => {
    setSelectedDriverIds(new Set())
  }

  const handleAssign = async () => {
    if (selectedBookingIds.size === 0 || selectedDriverIds.size === 0) return
    try {
      const fallbackDriver = selectedDrivers.find((driver) => driver.seeded)
      const seedsSelected = Boolean(fallbackDriver)
      if (seedsSelected && firebase.firestore) {
        const driverRef = doc(firebase.firestore, "drivers", fallbackDriver.id)
        const snap = await getDoc(driverRef)
        if (!snap.exists()) {
          console.error("[AdminAssign] Driver doc missing", fallbackDriver.id)
          present({
            title: "Driver record missing",
            tone: "danger",
            description:
              "Create the driver_zora profile in Firestore (drivers collection) before assigning.",
          })
          return
        }
      }

      console.debug("[AdminAssign] Assign payload", {
        bookingIds: Array.from(selectedBookingIds),
        driverIds: Array.from(selectedDriverIds),
        fallback: fallbackDriver?.id,
      })

      await assignDriverMutation.mutateAsync({
        bookingIds: Array.from(selectedBookingIds),
        driverIds: Array.from(selectedDriverIds),
        driverId: fallbackDriver?.id,
        driverName: fallbackDriver?.name,
        driverContact: fallbackDriver
          ? {
              phone: fallbackDriver.phone ?? undefined,
              email: fallbackDriver.email ?? undefined,
              calendarId: fallbackDriver.calendarId ?? undefined,
            }
          : undefined,
        notify: notifyOptions,
      })
      present({
        title: "Assignments sent",
        tone: "success",
        description: `${selectedBookingIds.size} booking${selectedBookingIds.size === 1 ? "" : "s"} shared with ${selectedDriverIds.size} driver${selectedDriverIds.size === 1 ? "" : "s"}.`,
      })
      setSelectedBookingIds(new Set())
    } catch (assignmentError) {
      console.error("[AdminAssign] Assignment failed", assignmentError)
      present({
        title: "Assignment failed",
        tone: "danger",
        description:
          assignmentError instanceof Error
            ? `${assignmentError.message}${
                (assignmentError as { status?: number }).status
                  ? ` (status ${(assignmentError as { status?: number }).status})`
                  : ""
              }`
            : "Unable to assign drivers right now.",
      })
    }
  }

  const handleUnassign = async () => {
    if (!canUnassign) return
    try {
      await assignDriverMutation.mutateAsync({
        bookingIds: selectedAssignedBookingIds,
        driverIds: [],
        unassign: true,
        notify: notifyOptions,
      })
      present({
        title: "Bookings unassigned",
        tone: "success",
        description: `${selectedAssignedBookingIds.length} booking${selectedAssignedBookingIds.length === 1 ? "" : "s"} returned to the queue.`,
      })
      setSelectedBookingIds(new Set())
    } catch (assignmentError) {
      console.error("[AdminAssign] Unassign failed", assignmentError)
      present({
        title: "Unassign failed",
        tone: "danger",
        description:
          assignmentError instanceof Error
            ? `${assignmentError.message}${
                (assignmentError as { status?: number }).status
                  ? ` (status ${(assignmentError as { status?: number }).status})`
                  : ""
              }`
            : "Unable to unassign bookings right now.",
      })
    }
  }

  const toggleNotify = (key: keyof typeof notifyOptions) => {
    setNotifyOptions((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const canAssign =
    selectedBookingIds.size > 0 && selectedDriverIds.size > 0 && !assignDriverMutation.isPending

  const canUnassign = selectedAssignedBookingIds.length > 0 && !assignDriverMutation.isPending
  const canClearDrivers = selectedDriverIds.size > 0
  const canClearBookings = selectedBookingIds.size > 0

  const summaryLabel = selectedBookings.length
    ? `${selectedBookings.length} booking${selectedBookings.length === 1 ? "" : "s"} selected`
    : "Select bookings to assign"

  return (
    <RoleGate
      allowedRoles={["admin", "assign"]}
      fallback={<EmptyState title="Admins only" description="Sign in with an admin or assign account to access this tool." />}
    >
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-horizon/70">Dispatch</p>
          <h1 className="mt-2 text-3xl font-heading uppercase tracking-[0.35em] text-horizon">Admin Assign</h1>
          <p className="mt-3 text-base text-midnight/70">
            Match unassigned rides with available drivers without leaving the portal. Select bookings on the right,
            choose one or more drivers on the left, then send assignments with a single tap. All updates sync to Google
            Calendar automatically.
          </p>
        </header>

        <GlassPanel className="p-5">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-horizon/70">Selection</p>
                <p className="mt-1 text-xl font-semibold text-horizon">{summaryLabel}</p>
                {selectedDrivers.length ? (
                  <p className="text-sm text-midnight/70">
                    Drivers: {selectedDrivers.map((driver) => driver.name).join(", ")}
                  </p>
                ) : (
                  <p className="text-sm text-midnight/70">Pick at least one driver to enable assignments.</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-horizon/60">Delivery method</p>
                <div className="flex flex-wrap items-center gap-3">
                  {(["email", "sms"] as const).map((key) => {
                    const active = notifyOptions[key]
                    const label = key === "email" ? "Driver email" : key === "sms" ? "Driver SMS" : "Push"
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleNotify(key)}
                        className={clsx(
                          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition",
                          active
                            ? "border-emerald-300 bg-emerald-500/90 text-white shadow-glow"
                            : "border-horizon/30 bg-white/80 text-horizon",
                        )}
                      >
                        {active ? (
                          <span className="rounded-full bg-white/20 p-1">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                        ) : null}
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleAssign}
                disabled={!canAssign}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.25em]",
                  canAssign ? "bg-emerald-500 text-white shadow-lg" : "bg-midnight/10 text-midnight/40",
                )}
              >
                {assignDriverMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Assign now
              </button>
            </div>
          </div>
        </GlassPanel>

        {error ? <ErrorBanner title="Unable to load bookings" description={error.message} /> : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-horizon/70">Drivers</p>
                <p className="text-lg font-semibold text-horizon">{assignableDrivers.length} available</p>
                {usingSeededDrivers ? (
                  <p className="text-xs uppercase tracking-[0.3em] text-midnight/50">
                    Using test driver until live profiles are added.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={clearDrivers}
                  disabled={!canClearDrivers}
                  className={clsx(
                    "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]",
                    canClearDrivers ?
                      "border-horizon/30 text-horizon" :
                      "border-midnight/10 text-midnight/40 cursor-not-allowed",
                  )}
                >
                  Clear drivers
                </button>
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex items-center gap-2 rounded-full border border-horizon/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-horizon"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </div>
            <input
              type="search"
              placeholder="Search by name or phone"
              value={driverSearch}
              onChange={(event) => setDriverSearch(event.target.value)}
              className="mt-4 w-full rounded-2xl border border-horizon/20 bg-white/80 px-4 py-3 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            />
            <div className="mt-4 flex flex-col gap-3">
              {driversLoading && drivers.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-midnight/70">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading drivers...
                </div>
              ) : filteredDrivers.length === 0 ? (
                <EmptyState title="No drivers" description="Add drivers in the Fleet page to assign rides." />
              ) : (
                filteredDrivers.map((driver) => {
                  const selected = selectedDriverIds.has(driver.id)
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => toggleDriver(driver.id)}
                      className={clsx(
                        "relative rounded-3xl border px-4 py-4 text-left transition",
                        selected
                          ? "border-[5px] border-emerald-400 bg-white shadow-glow"
                          : "border-white/30 bg-white/70 hover:border-horizon/30",
                      )}
                    >
                      {selected ? (
                        <span className="absolute -top-3 -right-3 rounded-full bg-emerald-500 p-1.5 text-white shadow-lg">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      ) : null}
                      <p className="text-base font-semibold text-horizon">{driver.name}</p>
                      <p className="text-sm text-midnight/70">
                        {driver.phone ?? "No phone"} · {driver.email ?? "No email"}
                      </p>
                      {driver.vehicle ? (
                        <p className="text-xs uppercase tracking-[0.3em] text-midnight/50">{driver.vehicle}</p>
                      ) : null}
                      {!selected ? (
                        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-midnight/50">Tap to assign</p>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-horizon/70">Unassigned queue</p>
                <p className="text-lg font-semibold text-horizon">{unassignedBookings.length} bookings</p>
                {refreshing ? (
                  <p className="text-xs uppercase tracking-[0.3em] text-midnight/50">Refreshing…</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={clearSelections}
                  disabled={!canClearBookings}
                  className={clsx(
                    "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]",
                    canClearBookings ?
                      "border-horizon/30 text-horizon" :
                      "border-midnight/10 text-midnight/40 cursor-not-allowed",
                  )}
                >
                  Clear bookings
                </button>
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex items-center gap-2 rounded-full border border-horizon/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-horizon"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </div>
            <input
              type="search"
              placeholder="Search passenger, address, or booking #"
              value={bookingSearch}
              onChange={(event) => setBookingSearch(event.target.value)}
              className="mt-4 w-full rounded-2xl border border-horizon/20 bg-white/80 px-4 py-3 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            />
            <div className="mt-4 flex flex-col gap-3">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-midnight/70">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading bookings…
                </div>
              ) : filteredUnassigned.length === 0 ? (
                <EmptyState title="All set" description="No rides need assignment right now." />
              ) : (
                pagedUnassigned.map((booking) => {
                  const selected = selectedBookingIds.has(booking.id)
                  const pax = booking.trip?.passengerCount ?? 1
                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => toggleBooking(booking.id)}
                      className={clsx(
                        "relative rounded-3xl border px-4 py-4 text-left transition",
                        selected
                          ? "border-[5px] border-emerald-400 bg-white shadow-glow"
                          : "border-white/30 bg-white/70 hover:border-horizon/30",
                      )}
                    >
                      {selected ? (
                        <span className="absolute -top-3 -right-3 rounded-full bg-emerald-500 p-1.5 text-white shadow-lg">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      ) : null}
                      <p className="text-base font-semibold text-horizon">{formatPickupLabel(booking)}</p>
                      <p className="text-xs uppercase tracking-[0.3em] text-midnight/50">
                        {formatRelativeLabel(booking)}
                      </p>
                      <p className="text-sm font-semibold text-horizon">
                        Booking #{formatBookingNumberDisplay(booking)}
                      </p>
                      <p className="mt-2 text-sm text-midnight/80">
                        From {booking.trip?.origin ?? booking.trip?.originAddress ?? "TBD"}
                      </p>
                      <p className="text-sm text-midnight/80">
                        To {booking.trip?.destination ?? booking.trip?.destinationAddress ?? "TBD"}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.3em] text-midnight/50">
                        Passenger: {booking.passenger?.primaryPassenger ?? "Unknown"} • {pax} pax
                      </p>
                    </button>
                  )
                })
              )}
            </div>
            {filteredUnassigned.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-midnight/70">
                <span>
                  Page {unassignedPage + 1} of {unassignedPageCount}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={unassignedPage === 0}
                    onClick={() => setUnassignedPage((current) => Math.max(current - 1, 0))}
                    className={clsx(
                      "rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.3em]",
                      unassignedPage === 0 ?
                        "border-midnight/10 text-midnight/30" :
                        "border-horizon/30 text-horizon",
                    )}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={unassignedPage + 1 >= unassignedPageCount}
                    onClick={() =>
                      setUnassignedPage((current) =>
                        Math.min(current + 1, Math.max(unassignedPageCount - 1, 0)),
                      )
                    }
                    className={clsx(
                      "rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.3em]",
                      unassignedPage + 1 >= unassignedPageCount ?
                        "border-midnight/10 text-midnight/30" :
                        "border-horizon/30 text-horizon",
                    )}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </GlassPanel>
        </div>

        <GlassPanel className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-horizon/70">Unassign a booking</p>
              <p className="text-lg font-semibold text-horizon">{assignedBookings.length} active assignments</p>
            </div>
            <Users className="h-5 w-5 text-horizon/70" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {assignedBookings.length === 0 ? (
              <EmptyState title="No active rides" description="Assigned trips will show here for quick re-routing." />
            ) : (
              assignedBookings.slice(0, 9).map((booking) => {
                const selected = selectedBookingIds.has(booking.id)
                return (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => toggleBooking(booking.id)}
                    className={clsx(
                      "relative rounded-3xl border px-4 py-4 text-left transition",
                      selected
                        ? "border-[5px] border-emerald-400 bg-white shadow-glow"
                        : "border-white/30 bg-white/70 hover:border-horizon/30",
                    )}
                  >
                    {selected ? (
                      <span className="absolute -top-3 -right-3 rounded-full bg-emerald-500 p-1.5 text-white shadow-lg">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    ) : null}
                    <p className="text-sm font-semibold text-horizon">{formatPickupLabel(booking)}</p>
                    <p className="text-xs uppercase tracking-[0.3em] text-midnight/50">
                      Driver: {booking.assignment?.driverName ?? "Unlisted"}
                    </p>
                    <p className="mt-1 text-xs text-midnight/70">
                      {booking.trip?.origin ?? booking.trip?.originAddress ?? "TBD"} → {" "}
                      {booking.trip?.destination ?? booking.trip?.destinationAddress ?? "TBD"}
                    </p>
                  </button>
                )
              })
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={!canUnassign}
              onClick={handleUnassign}
              className={clsx(
                "rounded-full border border-horizon/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]",
                canUnassign ? "bg-emerald-500 text-white" : "bg-midnight/10 text-midnight/40",
              )}
            >
              Unassign selected bookings
            </button>
          </div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-horizon/70">Assignment calendar</p>
              <p className="text-lg font-semibold text-horizon">Next few days</p>
            </div>
            <CalendarDays className="h-5 w-5 text-horizon/70" />
          </div>
          {calendarDays.length === 0 ? (
            <EmptyState title="No upcoming trips" description="New bookings will populate this calendar automatically." />
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pagedCalendarDays.map((day) => (
                <div key={day.label} className="rounded-3xl border border-white/40 bg-white/70 p-4">
                  <p className="text-sm font-semibold text-horizon">
                    {day.label}
                    {isToday(day.date) ? " • Today" : isTomorrow(day.date) ? " • Tomorrow" : ""}
                  </p>
                  <div className="mt-3 flex flex-col gap-3">
                    {day.bookings.map((booking) => {
                      const assigned = Boolean(booking.assignment?.driverId)
                      return (
                        <div key={booking.id} className="rounded-2xl border border-horizon/10 bg-white/80 p-3 text-sm">
                          <p className="font-semibold text-horizon">{formatPickupLabel(booking)}</p>
                          <p className="text-xs uppercase tracking-[0.3em] text-midnight/50">
                            {assigned ? `Driver: ${booking.assignment?.driverName ?? "TBD"}` : "Needs assignment"}
                          </p>
                          <div className="mt-2 space-y-1 text-xs text-midnight/70">
                            <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {booking.trip?.origin ?? booking.trip?.originAddress ?? "TBD"}</p>
                            <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {booking.trip?.destination ?? booking.trip?.destinationAddress ?? "TBD"}</p>
                            <p className="flex items-center gap-1"><Users className="h-3 w-3" /> {booking.trip?.passengerCount ?? 1} pax</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {calendarDays.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-midnight/70">
              <span>
                Page {calendarPage + 1} of {calendarPageCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={calendarPage === 0}
                  onClick={() => setCalendarPage((current) => Math.max(current - 1, 0))}
                  className={clsx(
                    "rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.3em]",
                    calendarPage === 0 ?
                      "border-midnight/10 text-midnight/30" :
                      "border-horizon/30 text-horizon",
                  )}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={calendarPage + 1 >= calendarPageCount}
                  onClick={() =>
                    setCalendarPage((current) =>
                      Math.min(current + 1, Math.max(calendarPageCount - 1, 0)),
                    )
                  }
                  className={clsx(
                    "rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.3em]",
                    calendarPage + 1 >= calendarPageCount ?
                      "border-midnight/10 text-midnight/30" :
                      "border-horizon/30 text-horizon",
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </GlassPanel>
      </div>
    </RoleGate>
  )
}

export default AdminAssignPage
