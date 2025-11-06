import { useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { Smartphone } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useCustomerNotifications } from "@/features/customers/hooks"

type ChannelKey = "email" | "sms" | "calendar"

const channelOptions: Array<{
  key: ChannelKey
  title: string
  description: string
  icon: LucideIcon
}> = [
  {
    key: "sms",
    title: "SMS alerts",
    description: "Opt in for pickup reminders and delay alerts the day of travel.",
    icon: Smartphone,
  },
]

export const CustomerNotificationsPage = () => {
  const { notifications, loading, saving, error, updateNotifications } = useCustomerNotifications()
  const profileBlocked = error?.message === "PROFILE_INCOMPLETE"

  const normalizedNotifications = useMemo(() => {
    return channelOptions.reduce<Record<ChannelKey, boolean>>((acc, channel) => {
      const value = notifications?.[channel.key]
      acc[channel.key] = typeof value === "boolean" ? value : Boolean(value)
      return acc
    }, {} as Record<ChannelKey, boolean>)
  }, [notifications])

  const toggleChannel = async (key: ChannelKey) => {
    const current = normalizedNotifications[key] ?? false
    try {
      await updateNotifications({ [key]: !current })
    } catch (toggleError) {
      console.error(toggleError)
    }
  }

  return (
    <RoleGate
      allowedRoles={["customer", "admin"]}
      headline="Notifications"
      description="Control how we keep you in the loop before, during, and after each ride."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Stay informed</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
                Channel preferences
              </h2>
            </div>
            <Link to="/portal/customer" className="va-button va-button--subtle px-5 py-[0.6rem] text-xs">
              Back to dashboard
            </Link>
          </header>
          <p className="mt-2 text-sm text-midnight/70">
            You’ll always get mission-critical updates, but you can fine-tune how duplicates are delivered here.
          </p>
          {profileBlocked ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>
                Finish the quick profile checklist so we can activate notification controls. Dispatch needs a primary
                phone number on file before enabling opt-in channels.
              </p>
              <Link
                to="/auth/profile?redirect=/portal/customer/notifications"
                className="va-button va-button--secondary inline-flex px-4 py-[0.55rem] text-xs"
              >
                Complete profile
              </Link>
            </div>
          ) : error ? (
            <p className="mt-4 text-xs text-amber-600">
              We couldn’t load your notification settings. Try again in a few moments.
            </p>
          ) : null}
        </GlassPanel>

        {profileBlocked ? (
          <GlassPanel className="p-6 text-sm text-midnight/70">
            <p>
              Notification channels will unlock as soon as your contact details are verified. Head to your profile to
              add a primary phone number and access request.
            </p>
          </GlassPanel>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {channelOptions.map((channel) => (
              <GlassPanel key={channel.key} className="flex h-full flex-col justify-between p-6">
                <div className="space-y-3">
                  <channel.icon className="h-5 w-5 text-horizon/70" aria-hidden />
                  <h3 className="font-heading text-sm uppercase tracking-[0.3em] text-horizon/80">
                    {channel.title}
                  </h3>
                  <p className="text-sm text-midnight/70">{channel.description}</p>
                </div>
                <button
                  type="button"
                  disabled={loading || saving}
                  onClick={() => toggleChannel(channel.key)}
                  className={
                    normalizedNotifications[channel.key]
                      ? "va-chip va-chip--status-enabled"
                      : "va-chip border border-horizon/30 bg-white/80 text-horizon"
                  }
                >
                  {loading ? "Loading…" : normalizedNotifications[channel.key] ? "Enabled" : "Disabled"}
                </button>
              </GlassPanel>
            ))}
          </div>
        )}
      </section>
    </RoleGate>
  )
}
