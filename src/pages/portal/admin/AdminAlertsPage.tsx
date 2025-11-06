import { useEffect, useMemo, useState } from "react"
import type { ComponentType } from "react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { Bell, Mail, Smartphone, Wifi, ShieldAlert, RefreshCw } from "lucide-react"
import { useAdminAlertsSettings } from "@/features/admin/hooks"

type ChannelKey = "email" | "sms" | "push"

interface AlertToggle {
  id: string
  label: string
  description: string
  defaults: Record<ChannelKey, boolean>
}

const alertDefinitions: AlertToggle[] = [
  {
    id: "booking_confirmation",
    label: "Booking confirmation",
    description: "Notifies customers that their ride is confirmed and reminds dispatch of new work.",
    defaults: { email: true, sms: false, push: false },
  },
  {
    id: "driver_assignment",
    label: "Driver assignment",
    description: "Alerts drivers when a new ride hits their roster and CCs customers with details.",
    defaults: { email: true, sms: true, push: true },
  },
  {
    id: "status_change",
    label: "Status change",
    description: "Keeps customers updated when a ride is en route, delayed, or completed.",
    defaults: { email: true, sms: true, push: false },
  },
  {
    id: "payment_exception",
    label: "Payment exception",
    description: "Flags finance when a payment link expires or a card is declined.",
    defaults: { email: true, sms: false, push: true },
  },
  {
    id: "weather_disruption",
    label: "Weather & ops disruptions",
    description: "Pings ops coordinators when we trigger a weather-related broadcast.",
    defaults: { email: true, sms: false, push: true },
  },
]

const channelLabels: Record<ChannelKey, { label: string; icon: ComponentType<unknown> }> = {
  email: { label: "Email", icon: Mail },
  sms: { label: "SMS", icon: Smartphone },
  push: { label: "Push", icon: Wifi },
}

export const AdminAlertsPage = () => {
  const { settings, loading, saving, error, updateChannel, refresh } = useAdminAlertsSettings()

  const mergedSettings = useMemo(() => {
    return alertDefinitions.reduce<Record<string, Record<ChannelKey, boolean>>>((acc, alert) => {
      const existing = settings[alert.id] ?? {}
      acc[alert.id] = {
        ...alert.defaults,
        ...existing,
      }
      return acc
    }, {})
  }, [settings])

  const [localSettings, setLocalSettings] = useState(mergedSettings)

  useEffect(() => {
    setLocalSettings(mergedSettings)
  }, [mergedSettings])

  const handleToggle = async (alertId: string, channel: ChannelKey) => {
    const current = localSettings[alertId]?.[channel] ?? mergedSettings[alertId]?.[channel] ?? false
    const nextValue = !current
    setLocalSettings((currentSettings) => ({
      ...currentSettings,
      [alertId]: {
        ...(currentSettings[alertId] ?? {}),
        [channel]: nextValue,
      },
    }))
    try {
      await updateChannel(alertId, channel, nextValue)
    } catch (toggleError) {
      console.error(toggleError)
      await refresh()
    }
  }

  return (
    <RoleGate
      allowedRoles={["admin"]}
      headline="Alerts & channels"
      description="Control which channels we use for operational notifications. Custom rules coming soon."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Dispatch guardrails</p>
              <h1 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">
                Notification matrix
              </h1>
            </div>
            <Bell className="h-5 w-5 text-horizon/70" aria-hidden />
          </header>
          <p className="mt-3 text-sm text-midnight/75">
            Changes apply instantly for all admins. Drivers stay limited to messaging their active assignment only.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-midnight/60">
            <div>
              {loading ? "Loading current settings…" : saving ? "Saving changes…" : "All updates sync instantly."}
            </div>
            <div className="flex items-center gap-2">
              {error ? <span className="text-amber-600">Unable to sync settings. Try refreshing.</span> : null}
              <button
                type="button"
                onClick={() => refresh()}
                className="va-button va-button--ghost inline-flex items-center gap-2 px-4 py-[0.45rem]"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Refresh
              </button>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="grid gap-4">
            {alertDefinitions.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col gap-4 rounded-2xl border border-horizon/15 bg-white/80 p-5"
              >
                <div>
                  <h2 className="font-heading text-sm uppercase tracking-[0.32em] text-horizon/80">
                    {alert.label}
                  </h2>
                  <p className="mt-1 text-sm text-midnight/70">{alert.description}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {(Object.keys(channelLabels) as ChannelKey[]).map((channel) => {
                    const config = channelLabels[channel]
                    const enabled = localSettings[alert.id]?.[channel]
                    return (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => handleToggle(alert.id, channel)}
                        disabled={loading || saving}
                        className={
                          enabled
                            ? "va-chip bg-horizon text-white"
                            : "va-chip border border-horizon/30 bg-white/80 text-horizon"
                        }
                      >
                        <config.icon className="mr-2 h-4 w-4" aria-hidden />
                        {config.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Escalation defaults</p>
              <h2 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">
                Response tiers
              </h2>
            </div>
            <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden />
          </header>
          <p className="mt-3 text-sm text-midnight/75">
            Escalation timers will be configurable later. For now, all urgent alerts notify the duty manager via email and push immediately. Record approvals in the audit trail when granting temporary channel access.
          </p>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}
