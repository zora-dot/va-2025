/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { clsx } from "clsx"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import {
  BarChart3,
  ClipboardCheck,
  Coins,
  LifeBuoy,
  Megaphone,
  Navigation,
  PanelLeftClose,
  PlusCircle,
  Send,
  ShieldCheck,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react"
import { addDays, startOfDay } from "date-fns"
import { useAuth } from "@/lib/hooks/useAuth"
import { useFirebase } from "@/lib/hooks/useFirebase"
import {
  Timestamp,
  collection,
  limit as limitFn,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore"
export const complianceChecks = [
  { doc: "Driver’s License", owner: "Jordan Avery", status: "Expiring 14 days", tone: "border-amber-400 text-amber-600" },
  { doc: "Airport Permit", owner: "Priya Nair", status: "Verified", tone: "border-emerald-300 text-emerald-600" },
  { doc: "Commercial Insurance", owner: "VAN-08", status: "Upload pending", tone: "border-ember/40 text-ember" },
]

export const fleetInventory = [
  { unit: "VAN-12", model: "Mercedes Sprinter", capacity: "11 + bags", accessibility: "Lift + car seats", maintenance: "Due 03/24" },
  { unit: "SUV-04", model: "Ford Expedition", capacity: "6", accessibility: "Child seats", maintenance: "OK" },
  { unit: "VAN-08", model: "Mercedes Sprinter", capacity: "11 + bags", accessibility: "Lift", maintenance: "Detailing 14:00" },
]

export const pricingRules = [
  { name: "Base fare · Zone 1", value: "$118.00", status: "Active" },
  { name: "Late-night surcharge", value: "+12%", status: "Auto 22:00-04:30" },
  { name: "Luggage add-on", value: "$6 per oversized", status: "Manual apply" },
  { name: "Promo SPRING25", value: "-25%", status: "Expires Apr 30" },
]

export const serviceAreas = [
  { name: "YVR Terminal Map", status: "3 active geofences", lastUpdate: "Mar 12" },
  { name: "Abbotsford No-Pickup Zone", status: "Restricted 22:00-04:00", lastUpdate: "Yesterday" },
  { name: "Downtown Surge Polygon", status: "Live monitoring", lastUpdate: "3h ago" },
]

export const broadcastTemplates = [
  { title: "Runway delay briefing", audience: "All drivers", attachments: true },
  { title: "Customer ETA bump", audience: "Affected customers", attachments: false },
  { title: "Fleet sanitization reminder", audience: "Night shift", attachments: false },
]

export const incidents = [
  { id: "INC-2041", severity: "High", sla: "10m left", owner: "Dispatch A", summary: "Flat tire VAN-04 · Spare en route" },
  { id: "INC-2042", severity: "Medium", sla: "28m left", owner: "CSR 3", summary: "Passenger left luggage in shuttle" },
]

export const supportTickets = [
  { id: "SUP-1180", ride: "VA-48321", customer: "Taylor M.", status: "Awaiting follow-up", action: "Offer credit" },
  { id: "SUP-1181", ride: "VA-48355", customer: "Evan R.", status: "Resolved today", action: "Receipt sent" },
]

export const paymentQueues = [
  { label: "Stripe refunds", count: 2, amount: "$184.00", note: "Needs manager approval" },
  { label: "Square settlements", count: 7, amount: "$5,420", note: "Auto recon in progress" },
  { label: "Driver payouts", count: 32, amount: "$9,870", note: "Export CSV ready" },
]

export const analyticsWidgets = [
  { title: "Demand by hour", insight: "Peak 05:00-07:00 · +21% vs last week" },
  { title: "Lane profitability", insight: "Langley → YVR · $68 margin avg" },
  { title: "Cancellation reasons", insight: "Weather (40%), Flight change (33%)" },
  { title: "Customer retention", insight: "82% 90-day repeat · Save report" },
]

export const rolePermissions = [
  { role: "Admin", items: ["All access", "Impersonate"] },
  { role: "Dispatcher", items: ["Assignments", "Pricing view", "Messaging"] },
  { role: "Driver", items: ["Own schedule", "Inbox", "Vehicle logs"] },
  { role: "CSR", items: ["Support desk", "Refund queue", "Messaging"] },
]

export const auditLog = [
  { time: "05:42", actor: "Priya N.", action: "Adjusted fare -$12 loyalty credit", ref: "VA-48365" },
  { time: "05:18", actor: "Alex J.", action: "Moved assignment VA-48321 → Matt L.", ref: "Dispatch board" },
  { time: "04:55", actor: "System", action: "Auto-synced Stripe payouts batch #302", ref: "Finance" },
]

export const integrationStatus = [
  { name: "Google Maps", key: "AIza•••mX32", status: "Healthy", lastPing: "2m ago" },
  { name: "Slack Dispatch Channel", key: "Webhook #dispatch", status: "Queued", lastPing: "10m ago" },
  { name: "Calendar Sync", key: "Service acct", status: "Warning", lastPing: "45m ago" },
]

export const brandingSettings = [
  { label: "Logo", value: "valley-airporter.svg", action: "Upload new" },
  { label: "Primary color", value: "#1C3F4C (Horizon)", action: "Adjust" },
  { label: "Cancellation policy", value: "Free up to 2h, $25 after", action: "Edit copy" },
  { label: "Notification templates", value: "12 active", action: "Manage" },
]

type CategoryLink = {
  label: string
  to: string
  description?: string
  external?: boolean
}

type CategoryDefinition = {
  id: string
  title: string
  description: string
  icon: LucideIcon
  tone: string
  links: CategoryLink[]
}

const adminCategories: CategoryDefinition[] = [
  {
    id: "operations",
    title: "Operations & Dispatch",
    description: "Keep daily service running on time and coordinated.",
    icon: PanelLeftClose,
    tone: "bg-horizon/10 text-horizon",
    links: [
      { label: "Admin assign", to: "/admin/assign", description: "Queue + driver matching board." },
      { label: "Live operations", to: "/portal/admin/operations" },
      { label: "Driver directory", to: "/portal/admin/fleet", description: "Availability, duty status, and contacts." },
    ],
  },
  {
    id: "fleet",
    title: "Fleet & Compliance",
    description: "Monitor vehicles, documents, and readiness to operate.",
    icon: Truck,
    tone: "bg-emerald/10 text-emerald-600",
    links: [
      { label: "Fleet overview", to: "/portal/admin/fleet" },
      { label: "Compliance queue", to: "/portal/admin/documents", description: "Expiring permits and pending uploads." },
    ],
  },
  {
    id: "communications",
    title: "Communications & Support",
    description: "Respond to riders, drivers, and partners in real time.",
    icon: Megaphone,
    tone: "bg-aurora/10 text-aurora",
    links: [
      { label: "Communications", to: "/portal/admin/communications" },
    ],
  },
  {
    id: "analytics",
    title: "Finance & Analytics",
    description: "Track revenue, service levels, and pricing guardrails.",
    icon: BarChart3,
    tone: "bg-glacier/10 text-glacier",
    links: [
      { label: "Ops analytics", to: "/portal/admin/analytics" },
    ],
  },
  {
    id: "governance",
    title: "Alerts & Governance",
    description: "Keep teams aligned with policy, alerts, and oversight.",
    icon: ShieldCheck,
    tone: "bg-ember/10 text-ember",
    links: [
      { label: "Alerts matrix", to: "/portal/admin/alerts" },
    ],
  },
]

type SupportHighlight = {
  icon: LucideIcon
  label: string
  value: string
  description: string
  href?: string
}

const supportHighlights: SupportHighlight[] = [
  {
    icon: LifeBuoy,
    label: "Dispatch hotline",
    value: "(604) 751-6688",
    description: "Escalate operational or safety issues immediately.",
  },
  {
    icon: Send,
    label: "Operations email",
    value: "ops@valleyairporter.ca",
    description: "Use for non-urgent schedule or policy updates.",
  },
  {
    icon: Navigation,
    label: "HQ address",
    value: "31631 S Fraser Way #101, Abbotsford, BC",
    description: "Open 05:00-22:00 for driver support and walk-ins.",
  },
  {
    icon: Coins,
    label: "Finance desk",
    value: "finance@valleyairporter.ca",
    description: "Payout exceptions, refunds, and reconciliation.",
  },
  {
    icon: ClipboardCheck,
    label: "Ops playbook",
    value: "View handbook",
    description: "Standard operating procedures and checklists.",
    href: "https://valley-airporter.example.com/ops-playbook.pdf",
  },
]

type SnapshotCard = {
  id: string
  title: string
  total: string
  highlights: string[]
}

type SnapshotMetrics = {
  total: number
  assigned: number
  awaitingPayment: number
  payNow: number
  awaitingAssignment: number
  returnTrips: number
  completed: number
  cancelled: number
}

const DEFAULT_SNAPSHOT_CARDS: SnapshotCard[] = [
  { id: "today", title: "Today's bookings", total: "0 rides", highlights: ["0 assigned drivers", "0 awaiting payment", "0 pay-now online"] },
  { id: "week", title: "Next 7 days", total: "0 rides", highlights: ["0 assigned rides", "0 rides awaiting assignment", "0 return legs"] },
  { id: "month", title: "30-day outlook", total: "0 rides", highlights: ["0 completed rides", "0 cancelled rides", "0 pay-now bookings"] },
  { id: "past7", title: "Past 7 days", total: "0 rides", highlights: ["0 completed rides", "0 cancelled rides", "0 pay-now bookings"] },
  { id: "past30", title: "Past 30 days", total: "0 rides", highlights: ["0 completed rides", "0 cancelled rides", "0 pay-now bookings"] },
]

const getPickupMillis = (value: unknown): number | null => {
  if (!value) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
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

const formatRideCount = (count: number) => {
  const label = count === 1 ? "ride" : "rides"
  return `${count.toLocaleString()} ${label}`
}

const formatHighlight = (count: number, label: string, singularLabel?: string) => {
  const text = count === 1 && singularLabel ? singularLabel : label
  return `${count.toLocaleString()} ${text}`
}

const computeSnapshotMetrics = (
  bookings: DocumentData[],
  startMs: number,
  endMs: number,
): SnapshotMetrics => {
  const metrics: SnapshotMetrics = {
    total: 0,
    assigned: 0,
    awaitingPayment: 0,
    payNow: 0,
    awaitingAssignment: 0,
    returnTrips: 0,
    completed: 0,
    cancelled: 0,
  }

  for (const booking of bookings) {
    const schedule = (booking.schedule as Record<string, unknown>) ?? {}
    const pickupMs = getPickupMillis(schedule.pickupTimestamp)
    if (pickupMs == null || pickupMs < startMs || pickupMs >= endMs) continue

    metrics.total += 1

    const assignment = (booking.assignment as Record<string, unknown>) ?? {}
    const driverId = typeof assignment.driverId === "string" ? assignment.driverId.trim() : ""
    if (driverId) {
      metrics.assigned += 1
    } else {
      metrics.awaitingAssignment += 1
    }

    const status = typeof booking.status === "string" ? booking.status.trim() : ""
    if (status === "awaiting_payment") {
      metrics.awaitingPayment += 1
    }
    if (status === "completed") {
      metrics.completed += 1
    } else if (status === "cancelled") {
      metrics.cancelled += 1
    }

    const payment = (booking.payment as Record<string, unknown>) ?? {}
    if (payment.preference === "pay_now") {
      metrics.payNow += 1
    }
    const trip = (booking.trip as Record<string, unknown>) ?? {}
    if (trip.includeReturn) {
      metrics.returnTrips += 1
    }
  }

  return metrics
}

const useAdminBookingSnapshots = () => {
  const firebase = useFirebase()
  const auth = useAuth()
  const [cards, setCards] = useState<SnapshotCard[]>(DEFAULT_SNAPSHOT_CARDS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const authLoading = auth.loading
  const authUser = auth.user
  const isAdmin = auth.hasRole?.("admin") ?? false

  useEffect(() => {
    if (!firebase.firestore || !authUser || !isAdmin) {
      if (!authLoading) {
        setLoading(false)
        setError(null)
      }
      return
    }

    const start = startOfDay(new Date())
    const end = addDays(start, 30)
    const pastStart = addDays(start, -30)
    const collectionRef = collection(firebase.firestore, "bookings")
    const q = query(
      collectionRef,
      where("schedule.pickupTimestamp", ">=", Timestamp.fromDate(pastStart)),
      where("schedule.pickupTimestamp", "<", Timestamp.fromDate(end)),
      orderBy("schedule.pickupTimestamp", "asc"),
      limitFn(750),
    )

    setLoading(true)
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => doc.data())
        const startMs = start.getTime()
        const pastStartMs = pastStart.getTime()
        const todayEndMs = addDays(start, 1).getTime()
        const weekEndMs = addDays(start, 7).getTime()
        const monthEndMs = end.getTime()
        const past7StartMs = addDays(start, -7).getTime()

        const todayMetrics = computeSnapshotMetrics(docs, startMs, todayEndMs)
        const weekMetrics = computeSnapshotMetrics(docs, startMs, weekEndMs)
        const monthMetrics = computeSnapshotMetrics(docs, startMs, monthEndMs)
        const past7Metrics = computeSnapshotMetrics(docs, past7StartMs, startMs)
        const past30Metrics = computeSnapshotMetrics(docs, pastStartMs, startMs)

        const nextCards: SnapshotCard[] = [
          {
            id: "today",
            title: "Today's bookings",
            total: formatRideCount(todayMetrics.total),
            highlights: [
              formatHighlight(todayMetrics.assigned, "assigned drivers", "assigned driver"),
              formatHighlight(todayMetrics.awaitingPayment, "awaiting payment"),
              formatHighlight(todayMetrics.payNow, "pay-now online"),
            ],
          },
          {
            id: "week",
            title: "Next 7 days",
            total: formatRideCount(weekMetrics.total),
            highlights: [
              formatHighlight(weekMetrics.assigned, "assigned rides", "assigned ride"),
              formatHighlight(weekMetrics.awaitingAssignment, "rides awaiting assignment", "ride awaiting assignment"),
              formatHighlight(weekMetrics.returnTrips, "return legs", "return leg"),
            ],
          },
          {
            id: "month",
            title: "30-day outlook",
            total: formatRideCount(monthMetrics.total),
            highlights: [
              formatHighlight(monthMetrics.completed, "completed rides", "completed ride"),
              formatHighlight(monthMetrics.cancelled, "cancelled rides", "cancelled ride"),
              formatHighlight(monthMetrics.payNow, "pay-now bookings", "pay-now booking"),
            ],
          },
          {
            id: "past7",
            title: "Past 7 days",
            total: formatRideCount(past7Metrics.total),
            highlights: [
              formatHighlight(past7Metrics.completed, "completed rides", "completed ride"),
              formatHighlight(past7Metrics.cancelled, "cancelled rides", "cancelled ride"),
              formatHighlight(past7Metrics.payNow, "pay-now bookings", "pay-now booking"),
            ],
          },
          {
            id: "past30",
            title: "Past 30 days",
            total: formatRideCount(past30Metrics.total),
            highlights: [
              formatHighlight(past30Metrics.completed, "completed rides", "completed ride"),
              formatHighlight(past30Metrics.cancelled, "cancelled rides", "cancelled ride"),
              formatHighlight(past30Metrics.payNow, "pay-now bookings", "pay-now booking"),
            ],
          },
        ]

        setCards(nextCards)
        setLoading(false)
        setError(null)
      },
      (snapshotError) => {
        console.error("[AdminPortal] Failed to load booking snapshots", snapshotError)
        setError(snapshotError instanceof Error ? snapshotError : new Error("Failed to load booking snapshots"))
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [authLoading, authUser, firebase.firestore, isAdmin])

  return { cards, loading, error }
}

const SnapshotSkeleton = () => (
  <div className="animate-pulse rounded-2xl border border-horizon/15 bg-white/60 p-4 shadow-sm">
    <div className="h-3 w-28 rounded bg-horizon/15" />
    <div className="mt-4 h-7 w-24 rounded bg-midnight/10" />
    <div className="mt-5 space-y-2">
      <div className="h-3 w-40 rounded bg-midnight/10" />
      <div className="h-3 w-32 rounded bg-midnight/10" />
      <div className="h-3 w-36 rounded bg-midnight/10" />
    </div>
  </div>
)

const renderCategoryLink = (link: CategoryLink) => {
  const content = (
    <div className="flex w-full items-center justify-between gap-3 text-left">
      <div className="flex flex-col">
        <span className="font-medium text-sm text-midnight/90">{link.label}</span>
        {link.description ? (
          <span className="text-xs text-midnight/60">{link.description}</span>
        ) : null}
      </div>
      <span className="text-[0.65rem] uppercase tracking-[0.3em] text-midnight/40">
        {link.external ? "Open" : "Launch"}
      </span>
    </div>
  )

  if (link.external || link.to.startsWith("http")) {
    return (
      <a
        key={link.label}
        href={link.to}
        target="_blank"
        rel="noreferrer"
        className="va-button va-button--secondary justify-start px-4 py-3"
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      key={link.label}
      to={link.to}
      className="va-button va-button--secondary justify-start px-4 py-3"
    >
      {content}
    </Link>
  )
}

const SupportCard = ({ icon: Icon, label, value, description, href }: SupportHighlight) => {
  const Wrapper = (href ? "a" : "div") as "a" | "div"
  const wrapperProps = href
    ? {
        href,
        target: "_blank",
        rel: "noreferrer",
        className: "flex flex-col gap-1 rounded-2xl border border-horizon/15 bg-white/75 p-4 transition hover:border-horizon/40 hover:bg-white",
      }
    : {
        className: "flex flex-col gap-1 rounded-2xl border border-horizon/15 bg-white/75 p-4",
      }

  return (
    <Wrapper {...(wrapperProps as Record<string, unknown>)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-midnight/90">
        <span className="rounded-full bg-horizon/10 p-2 text-horizon">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {label}
      </div>
      <span className="text-sm text-midnight/70">{value}</span>
      <span className="text-xs text-midnight/50">{description}</span>
    </Wrapper>
  )
}

export const AdminPortal = () => {
  const auth = useAuth()
  const {
    cards: bookingSnapshots,
    loading: bookingSnapshotsLoading,
  } = useAdminBookingSnapshots()
  const greetingName =
    auth.user?.displayName?.split(" ")[0] ??
    auth.user?.email?.split("@")[0] ??
    "Zora"

  return (
    <RoleGate
      allowedRoles={["admin"]}
      headline="Admin console"
      description="Only Valley Airporter administrators can access this control center. Please contact leadership to request elevated permissions."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-7">
          <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/70">
                Welcome back, {greetingName}
              </p>
              <h1 className="mt-3 font-heading text-3xl uppercase tracking-[0.3em] text-horizon">
                Morning operations overview
              </h1>
              <p className="mt-3 text-sm text-midnight/75">
                Here’s the latest pulse across bookings, drivers, and alerts. When you’re ready, jump straight into the workspace you need most.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 text-xs uppercase tracking-[0.3em] md:flex-row">
              <Link
                to="/booking"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-horizon/30 bg-horizon px-6 py-3 font-semibold text-white transition hover:bg-horizon/80"
              >
                <PlusCircle className="h-4 w-4" aria-hidden />
                Create booking
              </Link>
              <Link
                to="/portal/admin/communications"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-horizon/30 bg-white/80 px-6 py-3 text-horizon/70 transition hover:bg-white"
              >
                <Megaphone className="h-4 w-4" aria-hidden />
                Open communications
              </Link>
            </div>
          </header>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            {bookingSnapshotsLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <SnapshotSkeleton key={`snapshot-skeleton-${index}`} />
                ))
              : bookingSnapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="rounded-2xl border border-horizon/15 bg-white/75 p-4 shadow-sm"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-horizon/70">
                      {snapshot.title}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-midnight/90">
                      {snapshot.total}
                    </p>
                    <ul className="mt-3 space-y-1 text-sm text-midnight/70">
                      {snapshot.highlights.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
          </div>
        </GlassPanel>

        <div className="grid gap-6 xl:grid-cols-2">
          {adminCategories.map((category) => (
            <GlassPanel key={category.id} className="flex flex-col gap-4 p-6">
              <header className="flex items-start gap-3">
                <span className={clsx("rounded-full p-3", category.tone)}>
                  <category.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">
                    {category.title}
                  </h2>
                  <p className="mt-1 text-sm text-midnight/70">{category.description}</p>
                </div>
              </header>
              <div className="grid gap-2">
                {category.links.map((link) => renderCategoryLink(link))}
              </div>
            </GlassPanel>
          ))}
        </div>

        <GlassPanel className="p-6">
          <header className="flex items-start gap-3">
            <span className="rounded-full bg-horizon/10 p-2 text-horizon">
              <Users className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-heading text-sm uppercase tracking-[0.32em] text-horizon/80">
                Team & support resources
              </h2>
              <p className="mt-1 text-sm text-midnight/70">
                The fastest way to reach operational, finance, and policy teams when you need a human.
              </p>
            </div>
          </header>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {supportHighlights.map((item) => (
              <SupportCard key={item.label} {...item} />
            ))}
          </div>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}
