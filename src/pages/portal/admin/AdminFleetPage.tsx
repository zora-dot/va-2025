import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { useDriversDirectory } from "@/features/drivers/hooks"
import {
  complianceChecks,
  fleetInventory,
  pricingRules,
} from "../AdminPortal"
import { ClipboardCheck, Coins, Truck, Users } from "lucide-react"

export const AdminFleetPage = () => {
  const { drivers, loading } = useDriversDirectory()
  const directory = drivers.length > 0 ? drivers : complianceChecks.map((item, idx) => ({
    id: `fallback-${idx}`,
    name: item.owner,
    status: item.status,
    vehicle: "TBD",
    rating: "—",
    phone: null,
    dutyStatus: "off" as const,
  }))

  return (
    <RoleGate
      allowedRoles={["admin"]}
      headline="Fleet & compliance"
      description="Manage drivers, vehicles, and required documentation."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Driver roster</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Active team</h2>
            </div>
            <Users className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {loading && drivers.length === 0 ? (
              <div className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/60">
                Loading driver roster…
              </div>
            ) : null}
            {directory.map((driver) => (
              <div
                key={driver.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-midnight/90">{driver.name}</p>
                  <p className="text-xs text-midnight/60">
                    {driver.status ?? "Status pending"} · Vehicle {driver.vehicle ?? "TBD"} · ⭐ {driver.rating ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Onboarding & compliance</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Verification queue</h2>
            </div>
            <ClipboardCheck className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {complianceChecks.map((item) => (
              <div key={`${item.doc}-${item.owner}`} className={`rounded-2xl border bg-white/70 px-4 py-3 text-sm text-midnight/80 ${item.tone}`}>
                <p className="font-semibold text-midnight/90">{item.doc}</p>
                <p className="text-xs text-midnight/60">{item.owner} · {item.status}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Vehicle & fleet</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Garage overview</h2>
            </div>
            <Truck className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {fleetInventory.map((unit) => (
              <div key={unit.unit} className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80">
                <p className="font-semibold text-midnight/90">{unit.unit} · {unit.model}</p>
                <p className="text-xs text-midnight/60">Capacity {unit.capacity} · {unit.accessibility}</p>
                <p className="mt-1 text-xs text-midnight/60">Maintenance: {unit.maintenance}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Pricing & rules engine</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Fare control</h2>
            </div>
            <Coins className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {pricingRules.map((rule) => (
              <div key={rule.name} className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3">
                <p className="text-sm font-semibold text-midnight/90">{rule.name}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-midnight/60">
                  <span>{rule.value}</span>
                  <span>{rule.status}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}

