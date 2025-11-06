import { Link } from "@tanstack/react-router"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { LifeBuoy, MessageCircle, Phone, Clock4, ClipboardList } from "lucide-react"

const supportChannels: Array<{
  label: string
  value: string
  description?: string | null
  icon: typeof Phone
  href: string
}> = [
  {
    label: "Call dispatch",
    value: "(604) 751-6688",
    icon: Phone,
    href: "tel:+16047516688",
  },
  {
    label: "Text updates",
    value: "(604) 751-6688",
    description: "Send ride changes or arrival updates anytime.",
    icon: MessageCircle,
    href: "sms:+16047516688",
  },
  {
    label: "Email support",
    value: "info@valleyairporter.ca",
    description: "We respond within 12 hours.",
    icon: LifeBuoy,
    href: "mailto:info@valleyairporter.ca",
  },
]

const escalationSteps = [
  { step: "Share your booking ID", detail: "It helps us locate the trip instantly." },
  { step: "Tell us what changed", detail: "Pickup time, passenger count, luggage, or flight info." },
  { step: "Confirm the best call-back number", detail: "So we can reach you if we need more details." },
]

export const CustomerSupportPage = () => {
  return (
    <RoleGate
      allowedRoles={["customer", "admin"]}
      headline="Support center"
      description="Contact dispatch or leave instructions so we can adjust your ride quickly."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">We’re here to help</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
                Live support
              </h2>
            </div>
            <Link to="/portal/customer" className="va-button va-button--subtle px-5 py-[0.6rem] text-xs">
              Back to dashboard
            </Link>
          </header>
          <p className="mt-2 text-sm text-midnight/70">
            Reach out through your preferred channel. Our team monitors everything in real time and can escalate to on-duty managers for urgent cases.
          </p>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            {supportChannels.map((channel) => (
              <div key={channel.label} className="flex h-full flex-col gap-2 rounded-2xl border border-horizon/15 bg-white/85 p-5">
                <channel.icon className="h-5 w-5 text-horizon/70" aria-hidden />
                <div>
                  <p className="font-heading text-xs uppercase tracking-[0.28em] text-horizon/80">
                    {channel.label}
                  </p>
                  <a
                    href={channel.href}
                    className="mt-1 block text-lg font-semibold text-horizon underline-offset-2 hover:underline"
                  >
                    {channel.value}
                  </a>
                  {channel.description ? (
                    <p className="mt-1 text-sm text-midnight/70">{channel.description}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">When you reach out</p>
              <h3 className="font-heading text-base uppercase tracking-[0.28em] text-horizon">
                What we’ll ask
              </h3>
            </div>
            <Clock4 className="h-5 w-5 text-horizon/60" aria-hidden />
          </header>
          <ul className="mt-4 space-y-3 text-sm text-midnight/75">
            {escalationSteps.map((item) => (
              <li key={item.step} className="flex items-start gap-3">
                <ClipboardList className="mt-[0.15rem] h-4 w-4 text-horizon/70" aria-hidden />
                <div>
                  <p className="font-semibold text-midnight/85">{item.step}</p>
                  <p className="text-midnight/65">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}
