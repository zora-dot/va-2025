import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import {
  integrationStatus,
  brandingSettings,
  rolePermissions,
  auditLog,
} from "../AdminPortal"
import { PlugZap, Settings, KeyRound, FileText } from "lucide-react"

export const AdminDocumentsPage = () => {
  return (
    <RoleGate
      allowedRoles={["admin"]}
      headline="Settings & governance"
      description="Manage integrations, branding assets, and audit history."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Integrations & webhooks</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Connectivity</h2>
            </div>
            <PlugZap className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {integrationStatus.map((integration) => (
              <div key={integration.name} className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80">
                <p className="font-semibold text-midnight/90">{integration.name}</p>
                <p className="text-xs text-midnight/60">Key {integration.key} · Status {integration.status}</p>
                <p className="mt-1 text-xs text-midnight/60">Last ping {integration.lastPing}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Settings & branding</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Company profile</h2>
            </div>
            <Settings className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {brandingSettings.map((setting) => (
              <div key={setting.label} className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80">
                <p className="font-semibold text-midnight/90">{setting.label}</p>
                <p className="text-xs text-midnight/60">{setting.value}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Roles & permissions</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Access matrix</h2>
            </div>
            <KeyRound className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {rolePermissions.map((role) => (
              <div key={role.role} className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80">
                <p className="font-semibold text-midnight/90">{role.role}</p>
                <ul className="mt-2 space-y-1 text-xs text-midnight/60">
                  {role.items.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Audit log</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">Immutable timeline</h2>
            </div>
            <FileText className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <div className="mt-4 space-y-3">
            {auditLog.map((entry) => (
              <div key={entry.time} className="rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80">
                <p className="font-semibold text-midnight/90">{entry.time} · {entry.actor}</p>
                <p className="text-xs text-midnight/60">{entry.action}</p>
                <p className="mt-1 text-[0.65rem] uppercase tracking-[0.3em] text-horizon/70">Ref: {entry.ref}</p>
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}

