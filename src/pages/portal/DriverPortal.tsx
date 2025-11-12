import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Link } from "@tanstack/react-router"
import { clsx } from "clsx"
import { AlertTriangle, Bell, Briefcase, CheckCircle2, Compass, User } from "lucide-react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { useToast } from "@/components/ui/ToastProvider"
import { BookingsList, type BookingStatusAction } from "@/features/bookings/components/BookingsList"
import { useUpdateBookingStatus } from "@/features/bookings/hooks"
import type { BookingItem, BookingScope } from "@/features/bookings/types"

const driverStageActions: BookingStatusAction[] = [
  { label: "En route", value: "en_route", tone: "primary" },
  { label: "Arrived", value: "arrived", tone: "secondary" },
  { label: "Passenger onboard", value: "on_trip", tone: "secondary" },
  { label: "Completed", value: "completed", tone: "success" },
]

const driverStatusOrder = ["assigned", "en_route", "arrived", "on_trip", "completed"]
const BREAK_STORAGE_KEY = "va-driver-next-break-at"
const DEFAULT_BREAK_MINUTES = 80

const quickActions = [
  { label: "Start Route", icon: Compass, tone: "success" as const },
  { label: "Arrived", icon: CheckCircle2, tone: "info" as const },
  { label: "Passenger On Board", icon: User, tone: "info" as const },
  { label: "Report Issue", icon: AlertTriangle, tone: "danger" as const },
  { label: "Drop-off Complete", icon: Briefcase, tone: "success" as const },
]

export const DriverPortal = () => {
  const now = new Date()
  const { present } = useToast()
  const updateStatusMutation = useUpdateBookingStatus()
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)
  const [bookingScope, setBookingScope] = useState<BookingScope>("upcoming")
  const [bookingsRefresh, setBookingsRefresh] = useState<(() => void) | null>(null)
  const bookingScopes: BookingScope[] = ["upcoming", "past"]
  const [nextBreakAt, setNextBreakAt] = useState<number>(() => {
    if (typeof window === "undefined") {
      return Date.now() + DEFAULT_BREAK_MINUTES * 60 * 1000
    }
    const stored = window.localStorage.getItem(BREAK_STORAGE_KEY)
    if (stored) {
      const parsed = Number.parseInt(stored, 10)
      if (Number.isFinite(parsed)) return parsed
    }
    const scheduled = Date.now() + DEFAULT_BREAK_MINUTES * 60 * 1000
    window.localStorage.setItem(BREAK_STORAGE_KEY, String(scheduled))
    return scheduled
  })
  const [breakCountdown, setBreakCountdown] = useState<string>("")

  const bookingEmptyCopy =
    bookingScope === "upcoming"
      ? {
          title: "No trips assigned",
          description: "Dispatch will ping you here the moment your next ride is ready.",
        }
      : {
          title: "No recent trips",
          description: "Completed rides will show here for quick review.",
        }

  const getDriverActions = (booking: BookingItem): BookingStatusAction[] => {
    const normalizedStatus = booking.status ?? "assigned"
    const currentIndexRaw = driverStatusOrder.indexOf(normalizedStatus)
    const currentIndex = currentIndexRaw === -1 ? -1 : currentIndexRaw

    return driverStageActions.map((action) => {
      const actionIndex = driverStatusOrder.indexOf(action.value)
      const isNextStep =
        actionIndex !== -1 &&
        ((currentIndex === -1 && actionIndex === 0) || actionIndex === currentIndex + 1)
      const disabled =
        action.value === booking.status ||
        statusUpdating === booking.id ||
        (currentIndex >= 0 && actionIndex <= currentIndex) ||
        (actionIndex !== -1 && !isNextStep)
      return {
        ...action,
        disabled,
        tooltip:
          currentIndex >= 0 && actionIndex < currentIndex
            ? "Already progressed past this stage"
            : actionIndex !== -1 && !isNextStep
              ? "Complete the previous step first"
            : undefined,
      }
    })
  }

  const handleStatusAction = async (booking: BookingItem, action: BookingStatusAction) => {
    if (action.disabled) return
    const confirmed = window.confirm(
      `Mark booking ${booking.bookingNumber ?? booking.id} as ${action.label}?`,
    )
    if (!confirmed) return
    setStatusUpdating(booking.id)
    try {
      await updateStatusMutation.mutateAsync({
        bookingId: booking.id,
        status: action.value,
      })
      present({
        title: "Status updated",
        description: `Marked booking ${booking.id} as ${action.label.toLowerCase()}.`,
        tone: "success",
      })
      bookingsRefresh?.()
      if (navigator.vibrate) {
        navigator.vibrate(35)
      }
    } catch (error) {
      present({
        title: "Unable to update",
        description: error instanceof Error ? error.message : "Please try again in a moment.",
        tone: "danger",
      })
    } finally {
      setStatusUpdating(null)
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(BREAK_STORAGE_KEY, String(nextBreakAt))
  }, [nextBreakAt])

  useEffect(() => {
    const updateCountdown = () => {
      const diff = nextBreakAt - Date.now()
      if (diff <= 0) {
        setBreakCountdown("Due now")
        return
      }
      const totalSeconds = Math.floor(diff / 1000)
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      if (hours > 0) {
        setBreakCountdown(`${hours}h ${minutes.toString().padStart(2, "0")}m`)
      } else {
        setBreakCountdown(`${minutes.toString().padStart(2, "0")}m ${seconds
          .toString()
          .padStart(2, "0")}s`)
      }
    }
    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(interval)
  }, [nextBreakAt])

  const resetBreakTimer = () => {
    const scheduled = Date.now() + DEFAULT_BREAK_MINUTES * 60 * 1000
    setNextBreakAt(scheduled)
  }

  return (
    <RoleGate
      allowedRoles={["driver", "admin"]}
      headline="Driver portal"
      description="Stay updated on your assignments and keep dispatch in the loop."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="flex flex-col gap-5 p-7">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/70">
                Driver Home
              </p>
              <h1 className="mt-3 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
                Welcome back, Alex 👋
              </h1>
              <p className="mt-2 text-sm text-midnight/70">
                {format(now, "EEEE, MMMM d • h:mm a")} • ☀️ Clear • 9°C
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em]">
              <span className="va-chip border-sky/40 bg-white/85 text-horizon">On Duty</span>
              <button
                type="button"
                onClick={resetBreakTimer}
                className="va-chip border-sky/30 bg-white/85 text-horizon transition hover:border-horizon/40"
              >
                Next break in {breakCountdown || "–"}
              </button>
            </div>
          </header>
          <p className="text-sm text-midnight/75">
            When you receive a new ride, it will appear below. Use the quick actions to keep dispatch up to date.
          </p>
        </GlassPanel>

        <div className="sticky top-4 z-20">
          <GlassPanel className="flex items-center justify-between gap-3 p-4">
            <div className="text-xs uppercase tracking-[0.3em] text-midnight/70">
              Shift status
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em]">
              <span className="va-chip border-sky/40 bg-white/85 text-horizon">On Duty</span>
              <span className="va-chip border-sky/30 bg-white/85 text-horizon">
                Next break {breakCountdown || "–"}
              </span>
              <span className="va-chip border-sky/30 bg-white/85 text-horizon">
                Last sync just now
              </span>
            </div>
          </GlassPanel>
        </div>

        <GlassPanel className="p-7">
          <BookingsList
            scope={bookingScope}
            title="Your assignments"
          subtitle="Live bookings assigned to you."
            emptyTitle={bookingEmptyCopy.title}
            emptyDescription={bookingEmptyCopy.description}
            getStatusActions={getDriverActions}
            onStatusAction={handleStatusAction}
            onRefreshReady={(fn) => setBookingsRefresh(() => fn)}
            extraControls={
              <div className="flex items-center gap-1 rounded-full border border-horizon/20 bg-white/80 p-1">
                {bookingScopes.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setBookingScope(option)}
                    className={clsx(
                      "rounded-full px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] transition",
                      option === bookingScope
                        ? "bg-horizon text-white shadow-sm"
                        : "text-midnight/60 hover:bg-horizon/10",
                    )}
                  >
                    {option === "upcoming" ? "Upcoming" : "Past"}
                  </button>
                ))}
              </div>
            }
          />
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/80">Quick actions</p>
              <h2 className="font-heading text-sm uppercase tracking-[0.32em] text-horizon">
                Stay on schedule
              </h2>
            </div>
            <Bell className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="flex items-center gap-2 rounded-2xl border border-horizon/15 bg-white/80 px-4 py-3 text-sm text-midnight/80 transition hover:-translate-y-0.5"
                onClick={() =>
                  present({
                    title: action.label,
                    description: "Dispatch has been notified.",
                    tone: action.tone === "danger" ? "danger" : "success",
                  })
                }
              >
                <action.icon className="h-4 w-4 text-horizon" aria-hidden />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-midnight/70">
            <p>
              Need help? Call
              <a className="mx-1 text-horizon underline-offset-2 hover:underline" href="tel:+16047516688">
                (604) 751-6688
              </a>
              or text
              <a className="mx-1 text-horizon underline-offset-2 hover:underline" href="sms:+16047516688">
                dispatch
              </a>
              , or submit an issue.
            </p>
            <Link to="/portal/driver/tools" className="va-button va-button--secondary px-5 py-[0.6rem] text-xs">
              Open driver toolbox
            </Link>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <h2 className="font-heading text-sm uppercase tracking-[0.32em] text-horizon/80">
            Driver tips
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-midnight/80">
            <li>• Confirm assignment updates within 60 seconds to keep dispatch in sync.</li>
            <li>• Tap “Report Issue” if traffic or delays impact your ETA.</li>
            <li>• Review the toolbox for vehicle checklists and document uploads.</li>
          </ul>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}
