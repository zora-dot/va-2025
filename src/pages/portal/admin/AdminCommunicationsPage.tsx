import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { MessagingInbox } from "@/features/messaging/components/MessagingInbox"
import { broadcastTemplates, incidents, supportTickets, serviceAreas } from "../AdminPortal"
import { AlertTriangle, Map, Megaphone, MessageCircle } from "lucide-react"

export const AdminCommunicationsPage = () => {
  return (
    <RoleGate
      allowedRoles={["admin"]}
      headline="Communications center"
      description="Manage broadcasts, geofences, and support flows."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Service areas & geofences</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Territory control</h2>
            </div>
            <Map className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {serviceAreas.map((zone) => (
              <div key={zone.name} className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80">
                <p className="font-semibold text-midnight/90">{zone.name}</p>
                <p className="text-xs text-midnight/60">{zone.status} · Updated {zone.lastUpdate}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Broadcast templates</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Outbound comms</h2>
            </div>
            <Megaphone className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3 text-sm text-midnight/80">
            {broadcastTemplates.map((template) => (
              <div key={template.title} className="flex items-center justify-between rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3">
                <div>
                  <p className="font-semibold text-midnight/90">{template.title}</p>
                  <p className="text-xs text-midnight/60">Audience: {template.audience}</p>
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-horizon/70">
                  {template.attachments ? "Has attachment" : "No attachment"}
                </span>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Incident & SOS inbox</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Triage queue</h2>
            </div>
            <AlertTriangle className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {incidents.map((incident) => (
              <div key={incident.id} className={`rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80 ${incident.severity === "High" ? "border-ember/40" : ""}`}>
                <p className="font-semibold text-midnight/90">{incident.id} · {incident.severity}</p>
                <p className="text-xs text-midnight/60">SLA {incident.sla} · Owner {incident.owner}</p>
                <p className="mt-1 text-xs text-midnight/60">{incident.summary}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Customer support desk</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Ticketing hub</h2>
            </div>
            <MessageCircle className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {supportTickets.map((ticket) => (
              <div key={ticket.id} className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80">
                <p className="font-semibold text-midnight/90">{ticket.id} · {ticket.customer}</p>
                <p className="text-xs text-midnight/60">Ride {ticket.ride} · {ticket.status}</p>
                <p className="mt-1 text-xs text-midnight/60">Suggested action: {ticket.action}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <MessagingInbox role="admin" />
        </GlassPanel>
      </section>
    </RoleGate>
  )
}

