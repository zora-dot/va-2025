import { useEffect, useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { clsx } from "clsx"
import { BookingsList } from "@/features/bookings/components/BookingsList"
import type { BookingScope } from "@/features/bookings/types"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { Bell, LifeBuoy, Plane, Receipt } from "lucide-react"
import { useAuth } from "@/lib/hooks/useAuth"

const scopeOptions: BookingScope[] = ["upcoming", "past", "all"]

const quickLinks = [
  { label: "Book a ride", to: "/booking", icon: Plane },
  { label: "Download receipts", to: "/portal/customer/receipts", icon: Receipt },
  { label: "Support center", to: "/portal/customer/support", icon: LifeBuoy },
]

const moreTools = [
  {
    label: "Receipts & history",
    description: "Export PDFs, track fares, and download invoices.",
    to: "/portal/customer/receipts",
    icon: Receipt,
  },
  {
    label: "Notifications",
    description: "Pick how we send confirmations and reminders.",
    to: "/portal/customer/notifications",
    icon: Bell,
  },
  {
    label: "Support center",
    description: "Chat with dispatch or review escalation steps.",
    to: "/portal/customer/support",
    icon: LifeBuoy,
  },
]

export const CustomerPortal = () => {
  const auth = useAuth()
  const now = new Date()
  const [scope, setScope] = useState<BookingScope>(() => {
    if (typeof window === "undefined") return "upcoming"
    const stored = window.localStorage.getItem("va-customer-scope")
    if (stored === "upcoming" || stored === "past" || stored === "all") {
      return stored
    }
    return "upcoming"
  })
  const emptyStates = {
    upcoming: {
      title: "No upcoming rides",
      description: "Schedule your next airport run and it will appear here instantly.",
    },
    past: {
      title: "No past rides",
      description: "Once a ride is completed you will see receipts and trip notes here.",
    },
    all: {
      title: "No bookings",
      description: "Start planning your next trip—booking takes under a minute.",
    },
  }

  const [refreshBookings, setRefreshBookings] = useState<(() => void) | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("va-customer-scope", scope)
    }
  }, [scope])

  const timeZoneLabel = useMemo(() => {
    if (typeof Intl === "undefined") return ""
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
    const parts = tz.split("/")
    return parts.length > 1 ? parts[parts.length - 1].replace("_", " ") : tz
  }, [])

  const greetingName = useMemo(() => {
    const user = auth.user
    if (user?.displayName) {
      const [first] = user.displayName.split(/\s+/)
      if (first) return first
    }
    if (user?.email) {
      const [handle] = user.email.split("@")
      if (handle) return handle
    }
    return null
  }, [auth.user])

  const greetingTitle = greetingName ? `Welcome back, ${greetingName} 👋` : "Welcome to your dashboard 👋"

  return (
    <RoleGate
      allowedRoles={["customer", "admin"]}
      headline="Customer portal"
      description="Review upcoming rides, manage receipts, and stay in touch with dispatch."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="flex flex-col gap-4 p-7">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/70">
                Customer home
              </p>
              <h1 className="mt-3 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
                {greetingTitle}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-midnight/70">
                {format(now, "EEE, MMM d")}
                {timeZoneLabel ? <span>· {timeZoneLabel}</span> : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.3em] text-horizon">
              {quickLinks.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  className={clsx(
                    "va-button flex items-center gap-2 px-4 py-[0.6rem]",
                    link.label === "Book a ride" ? "va-button--primary" : "va-button--secondary",
                  )}
                >
                  <link.icon className="h-4 w-4" aria-hidden />
                  {link.label}
                </Link>
              ))}
            </div>
          </header>
          <p className="text-sm text-midnight/75">
            Need to adjust a ride? Call
            <a className="mx-1 text-horizon underline-offset-2 hover:underline" href="tel:+16047516688">
              (604) 751-6688
            </a>
            or text
            <a className="mx-1 text-horizon underline-offset-2 hover:underline" href="sms:+16047516688">
              dispatch
            </a>
            . We’re standing by 24/7.
          </p>
        </GlassPanel>

        <GlassPanel className="p-7">
          <BookingsList
            scope={scope}
            title="Your bookings"
            subtitle="Track upcoming rides, review past trips, and view receipts."
            customerMode
            emptyTitle={emptyStates[scope].title}
            emptyDescription={emptyStates[scope].description}
            extraControls={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-horizon/20 bg-white/80 p-1">
                  {scopeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setScope(option)}
                      className={clsx(
                        "rounded-full px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] transition",
                        option === scope
                          ? "bg-horizon text-white shadow-sm"
                          : "text-midnight/60 hover:bg-horizon/10",
                      )}
                    >
                      {option === "upcoming" ? "Upcoming" : option === "past" ? "Past" : "All"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => refreshBookings?.()}
                  className="va-button va-button--ghost px-4 py-2 text-xs uppercase tracking-[0.3em]"
                >
                  Refresh
                </button>
              </div>
            }
            onRefreshReady={(fn) => setRefreshBookings(() => fn)}
          />
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">More tools</p>
              <h2 className="font-heading text-sm uppercase tracking-[0.32em] text-horizon/80">
                Manage your trip
              </h2>
            </div>
            <span className="text-xs uppercase tracking-[0.28em] text-midnight/60">
              Everything you need beyond the itinerary.
            </span>
          </header>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {moreTools.map((tool) => (
              <Link
                key={tool.label}
                to={tool.to}
                className="flex h-full flex-col justify-between rounded-2xl border border-horizon/15 bg-white/85 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="space-y-3">
                  <tool.icon className="h-5 w-5 text-horizon/70" aria-hidden />
                  <h3 className="font-heading text-xs uppercase tracking-[0.3em] text-horizon/80">
                    {tool.label}
                  </h3>
                  <p className="text-sm text-midnight/70">{tool.description}</p>
                </div>
                <span className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-horizon">
                  Open
                  <span aria-hidden className="translate-y-[1px]">→</span>
                </span>
              </Link>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <h2 className="font-heading text-sm uppercase tracking-[0.32em] text-horizon/80">Need anything else?</h2>
          <p className="mt-2 text-sm text-midnight/75">
            Reply to any Valley Airporter email,
            <a className="mx-1 text-horizon underline-offset-2 hover:underline" href="tel:+16047516688">
              call
            </a>
            or
            <a className="mx-1 text-horizon underline-offset-2 hover:underline" href="sms:+16047516688">
              text (604) 751-6688
            </a>
            , or use the tools above to get in touch.
          </p>
          <a
            href="mailto:info@valleyairporter.ca?subject=Customer support"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-horizon/30 px-4 py-2 text-xs uppercase tracking-[0.3em] text-horizon/70 transition hover:border-horizon/50 hover:text-horizon"
          >
            Email support
          </a>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}
