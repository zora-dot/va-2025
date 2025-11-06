import { useMemo, useState } from "react"
import { clsx } from "clsx"
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isWithinInterval,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import {
  paymentQueues,
  analyticsWidgets,
} from "../AdminPortal"
import {
  Receipt,
  SquareStack,
  Share2,
  Wallet,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import { useRealtimeBookings } from "@/features/bookings/hooks"
import type { BookingItem } from "@/features/bookings/types"

type ViewMode = "week" | "30d"

interface ChartPoint {
  label: string
  current: number
  previous?: number
}

interface AnalyticsSummary {
  current: number
  previous: number
  change: number | null
}

interface AnalyticsView {
  chart: ChartPoint[]
  summary: AnalyticsSummary
}

const getPickupDate = (booking: BookingItem): Date | null => {
  const timestamp = booking.schedule?.pickupTimestamp
  if (typeof timestamp === "number") return new Date(timestamp)
  const pickupDate = booking.schedule?.pickupDate
  if (!pickupDate) return null
  const pickupTime = booking.schedule?.pickupTime ?? "00:00"
  const candidate = new Date(`${pickupDate}T${pickupTime}:00`)
  return Number.isNaN(candidate.getTime()) ? null : candidate
}

const computeAnalytics = (bookings: BookingItem[], mode: ViewMode): AnalyticsView => {
  const now = new Date()
  const withPickup = bookings
    .map((booking) => ({ booking, pickup: getPickupDate(booking) }))
    .filter((entry): entry is { booking: BookingItem; pickup: Date } => entry.pickup != null)

  if (mode === "week") {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
    const previousWeekStart = subWeeks(weekStart, 1)
    const previousWeekEnd = subWeeks(weekEnd, 1)

    const currentWeekBookings = withPickup.filter((entry) =>
      isWithinInterval(entry.pickup, { start: weekStart, end: weekEnd }),
    )
    const previousWeekBookings = withPickup.filter((entry) =>
      isWithinInterval(entry.pickup, { start: previousWeekStart, end: previousWeekEnd }),
    )

    const chart = eachDayOfInterval({ start: weekStart, end: weekEnd }).map((day) => {
      const current = currentWeekBookings.filter((entry) => isSameDay(entry.pickup, day)).length
      const previousDay = subWeeks(day, 1)
      const previous = previousWeekBookings.filter((entry) =>
        isSameDay(entry.pickup, previousDay),
      ).length
      return {
        label: format(day, "EEE"),
        current,
        previous,
      }
    })

    const currentTotal = currentWeekBookings.length
    const previousTotal = previousWeekBookings.length
    const change =
      previousTotal === 0 ? null : ((currentTotal - previousTotal) / previousTotal) * 100

    return {
      chart,
      summary: {
        current: currentTotal,
        previous: previousTotal,
        change,
      },
    }
  }

  // 30-day view
  const intervalStart = subDays(now, 29)
  const intervalEnd = now
  const previousIntervalStart = subDays(intervalStart, 30)
  const previousIntervalEnd = subDays(intervalStart, 1)

  const currentIntervalBookings = withPickup.filter((entry) =>
    isWithinInterval(entry.pickup, { start: intervalStart, end: intervalEnd }),
  )
  const previousIntervalBookings = withPickup.filter((entry) =>
    isWithinInterval(entry.pickup, { start: previousIntervalStart, end: previousIntervalEnd }),
  )

  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })
  const chart: ChartPoint[] = Array.from({ length: 4 }).map((_, index) => {
    const weekStart = subWeeks(currentWeekStart, 3 - index)
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    const value = currentIntervalBookings.filter((entry) =>
      isWithinInterval(entry.pickup, { start: weekStart, end: weekEnd }),
    ).length
    return {
      label: format(weekStart, "MMM d"),
      current: value,
    }
  })

  const currentTotal = currentIntervalBookings.length
  const previousTotal = previousIntervalBookings.length
  const change =
    previousTotal === 0 ? null : ((currentTotal - previousTotal) / previousTotal) * 100

  return {
    chart,
    summary: {
      current: currentTotal,
      previous: previousTotal,
      change,
    },
  }
}

const formatChange = (change: number | null) => {
  if (change == null) return { label: "—", tone: "neutral" as const }
  const rounded = Math.round(change)
  if (rounded === 0) return { label: "0% vs prior", tone: "neutral" as const }
  if (rounded > 0) return { label: `+${rounded}% vs prior`, tone: "up" as const }
  return { label: `${rounded}% vs prior`, tone: "down" as const }
}

const MiniBarChart = ({ data }: { data: ChartPoint[] }) => {
  const maxValue = data.reduce((max, point) => {
    const values = [point.current, point.previous ?? 0]
    const localMax = Math.max(...values)
    return localMax > max ? localMax : max
  }, 0)

  const safeMax = maxValue === 0 ? 1 : maxValue

  return (
    <div className="mt-6 flex items-end gap-4 overflow-x-auto pb-2">
      {data.map((point) => {
        const currentHeight = Math.round((point.current / safeMax) * 100)
        const previousHeight =
          point.previous != null ? Math.round((point.previous / safeMax) * 100) : null
        return (
          <div key={point.label} className="flex flex-col items-center gap-2 text-sm text-midnight/70">
            <div className="relative flex h-36 w-12 items-end justify-center">
              {previousHeight != null ? (
                <div
                  className="absolute bottom-0 w-8 rounded-t-full bg-horizon/15"
                  style={{ height: `${previousHeight}%` }}
                />
              ) : null}
              <div
                className="relative z-10 w-8 rounded-t-full bg-horizon text-white"
                style={{ height: `${currentHeight}%` }}
                aria-label={`${point.label} ${point.current}`}
              />
            </div>
            <span className="font-semibold text-midnight/80">{point.current}</span>
            <span className="text-xs uppercase tracking-[0.3em] text-midnight/50">{point.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export const AdminAnalyticsPage = () => {
  const [view, setView] = useState<ViewMode>("week")
  const { bookings, loading, refresh } = useRealtimeBookings({
    scope: "all",
    limit: 200,
    enabled: true,
  })

  const analytics = useMemo(() => computeAnalytics(bookings, view), [bookings, view])
  const changeMeta = formatChange(analytics.summary.change)

  return (
    <RoleGate
      allowedRoles={["admin"]}
      headline="Finance & analytics"
      description="Manage payouts, refunds, and explore performance dashboards."
      requireProfile
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Payments & payouts</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
                Finance console
              </h2>
            </div>
            <Wallet className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {paymentQueues.map((queue) => (
              <div
                key={queue.label}
                className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80"
              >
                <p className="font-semibold text-midnight/90">{queue.label}</p>
                <p className="text-xs text-midnight/60">
                  {queue.count} items · {queue.amount}
                </p>
                <p className="mt-1 text-xs text-midnight/60">{queue.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.3em] text-horizon/70">
            <button className="inline-flex items-center gap-2 rounded-full border border-horizon/30 px-4 py-1">
              <Receipt className="h-4 w-4" aria-hidden />
              Approve refunds
            </button>
            <button className="inline-flex items-center gap-2 rounded-full border border-horizon/30 px-4 py-1">
              <SquareStack className="h-4 w-4" aria-hidden />
              Export ledger
            </button>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Operational load</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
                Ride volume trend
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em]">
              <div className="flex items-center gap-1 rounded-full border border-horizon/20 bg-white/80 p-1">
                <button
                  type="button"
                  onClick={() => setView("week")}
                  className={clsx(
                    "rounded-full px-4 py-2 transition",
                    view === "week" ? "bg-horizon text-white" : "text-midnight/60 hover:bg-horizon/10",
                  )}
                >
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => setView("30d")}
                  className={clsx(
                    "rounded-full px-4 py-2 transition",
                    view === "30d" ? "bg-horizon text-white" : "text-midnight/60 hover:bg-horizon/10",
                  )}
                >
                  30 day
                </button>
              </div>
              <button
                type="button"
                onClick={refresh}
                className="va-button va-button--ghost px-4 py-2"
              >
                Refresh
              </button>
            </div>
          </header>

          {loading ? (
            <p className="mt-6 text-sm text-midnight/70">Loading analytics…</p>
          ) : (
            <>
              <MiniBarChart data={analytics.chart} />
              <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-horizon/15 bg-white/70 px-5 py-4 text-sm text-midnight/80">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-midnight/50">Current period</p>
                  <p className="mt-1 text-lg font-semibold text-midnight/90">
                    {analytics.summary.current} rides
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-midnight/50">Prior period</p>
                  <p className="mt-1 text-lg font-semibold text-midnight/90">
                    {analytics.summary.previous}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em]">
                  {changeMeta.tone === "up" ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />
                  ) : changeMeta.tone === "down" ? (
                    <TrendingDown className="h-4 w-4 text-amber-600" aria-hidden />
                  ) : null}
                  <span
                    className={clsx(
                      changeMeta.tone === "up" && "text-emerald-600",
                      changeMeta.tone === "down" && "text-amber-600",
                      changeMeta.tone === "neutral" && "text-midnight/60",
                    )}
                  >
                    {changeMeta.label}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-midnight/60">
                Values sourced from the latest {view === "week" ? "7 days" : "30 days"} of confirmed pickups. Historical totals recalc automatically as bookings update.
              </p>
            </>
          )}
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Analytics hub</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
                Insights library
              </h2>
            </div>
            <BarChart3 className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {analyticsWidgets.map((widget) => (
              <div
                key={widget.title}
                className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80"
              >
                <p className="font-semibold text-midnight/90">{widget.title}</p>
                <p className="text-xs text-midnight/60">{widget.insight}</p>
                <button className="mt-2 inline-flex items-center gap-2 rounded-full border border-horizon/30 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-horizon/70">
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  Save & share
                </button>
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}
