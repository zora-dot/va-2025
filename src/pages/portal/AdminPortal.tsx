import { GlassPanel } from "@/components/ui/GlassPanel"
import {
  Activity,
  LayoutDashboard,
  MapPin,
} from "lucide-react"
import { RoleGate } from "@/components/layout/RoleGate"
import { MessagingInbox } from "@/features/messaging/components/MessagingInbox"
import { DashboardStats } from "@/features/dashboard/components/DashboardStats"
import { TimelineList } from "@/features/dashboard/components/TimelineList"
import { FleetMapPlaceholder } from "@/features/dashboard/components/FleetMapPlaceholder"
import { adminDashboardData } from "@/features/dashboard/data/mockDashboard"

const adminHighlights = [
  {
    icon: LayoutDashboard,
    title: "Kanban Dispatch Board",
    description:
      "Drag-and-drop bookings across Requested → Confirmed → En Route → Completed with real-time driver statuses.",
  },
  {
    icon: MapPin,
    title: "Live Fleet Map",
    description:
      "Track driver telemetry, ETAs, and route deviations. Broadcast route adjustments directly to devices.",
  },
  {
    icon: Activity,
    title: "Business Intelligence",
    description:
      "Monitor revenue, utilization, and on-time performance with exportable reports synced to Firebase + BigQuery.",
  },
]

export const AdminPortal = () => {
  return (
    <RoleGate
      allowedRoles={["admin"]}
      headline="Admin console"
      description="Only Valley Airporter administrators can access this control center. Please contact leadership to request elevated permissions."
      previewMode
    >
      <section className="flex flex-col gap-6">
        <GlassPanel className="p-7">
          <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/70">
            Admin Console
          </p>
          <h2 className="mt-4 font-heading text-3xl uppercase tracking-[0.3em] text-horizon">
            Command every shuttle movement.
          </h2>
          <p className="mt-4 max-w-3xl text-sm text-midnight/75">
            Admin users oversee the full shuttle operation with customizable dashboards, pricing
            controls, and messaging. Built with Firebase security rules to enforce role-based access
            and audit trails across every critical workflow.
          </p>
        </GlassPanel>

        <DashboardStats
          title="Operational Pulse"
          columns={4}
          items={adminDashboardData.metrics.map((metric) => ({
            label: metric.label,
            value: metric.value,
            delta: metric.delta,
            tone:
              metric.label.includes("Support") && metric.delta?.includes("escalated")
                ? "danger"
                : metric.label.includes("Revenue")
                ? "success"
                : "default",
          }))}
        />

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <FleetMapPlaceholder
            title="Fleet Command"
            description="Monitor every shuttle, overlay weather and flight data, and dispatch adjustments without leaving the console."
          />
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.35em] text-horizon/90">
              Alerts & Automations
            </h3>
            <div className="mt-4 space-y-3 text-sm text-midnight/75">
              {adminDashboardData.alerts.map((alert) => (
                <div
                  key={alert.title}
                  className="rounded-2xl border border-horizon/20 bg-white/70 px-4 py-3 shadow-sm"
                >
                  <p className="font-semibold text-midnight/90">{alert.title}</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-horizon/60">{alert.level}</p>
                  <p className="mt-2 text-sm text-midnight/75">{alert.detail}</p>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>

        <section className="grid gap-6 md:grid-cols-3">
          {adminHighlights.map((item) => (
            <GlassPanel key={item.title} className="p-6">
              <item.icon className="h-8 w-8 text-glacier" />
              <h3 className="mt-4 font-heading text-lg uppercase tracking-[0.35em] text-horizon">
                {item.title}
              </h3>
              <p className="mt-3 text-sm text-midnight/75">{item.description}</p>
            </GlassPanel>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.35em] text-horizon/90">
              Tooling Roadmap
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-midnight/75">
              <li>Pricing matrix editor with JSON import/export and audit snapshots.</li>
              <li>Automated billing reconciliation with Square settlements + Stripe fallback.</li>
              <li>Schedule optimizer integrating Google Calendar’s resource calendars.</li>
              <li>Escalation console bridging customer threads, SMS alerts, and push notifications.</li>
            </ul>
          </GlassPanel>
          <TimelineList
            title="Departure Queue"
            subtitle="Upcoming departures in the next 90 minutes. Promote or delay rides with a single drag-and-drop."
            items={adminDashboardData.scheduleHighlights.map((item) => ({
              time: item.time,
              title: item.title,
              subtitle: `${item.driver} • Status: ${item.status}`,
              status:
                item.status === "Delayed"
                  ? "delayed"
                  : item.status === "En Route"
                  ? "active"
                  : "default",
            }))}
          />
        </section>

        <section className="grid gap-4">
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.35em] text-horizon/90">
              Live Inbox Overview
            </h3>
            <p className="mt-3 text-sm text-midnight/75">
              Unified conversations across customers and drivers. When Firebase messaging is
              connected you&apos;ll triage real requests, route escalations, and broadcast updates from
              this console.
            </p>
          </GlassPanel>
          <MessagingInbox role="admin" />
        </section>
      </section>
    </RoleGate>
  )
}
