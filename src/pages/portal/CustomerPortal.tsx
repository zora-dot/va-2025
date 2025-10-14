import { GlassPanel } from "@/components/ui/GlassPanel"
import { CalendarCheck, Clock, CreditCard, Send, ShieldCheck, Smartphone } from "lucide-react"
import { RoleGate } from "@/components/layout/RoleGate"
import { MessagingInbox } from "@/features/messaging/components/MessagingInbox"
import { DashboardStats } from "@/features/dashboard/components/DashboardStats"
import { TimelineList } from "@/features/dashboard/components/TimelineList"
import { FleetMapPlaceholder } from "@/features/dashboard/components/FleetMapPlaceholder"
import { customerDashboardData } from "@/features/dashboard/data/mockDashboard"

const customerFeatures = [
  {
    icon: CalendarCheck,
    title: "Smart Booking",
    copy:
      "Guided flow that handles multi-stop journeys, flight numbers, baggage notes, and instant fare calculations.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted Accounts",
    copy:
      "Firebase Auth with email verification, saved travellers, and encrypted payment profiles for repeat bookings.",
  },
  {
    icon: Send,
    title: "Threaded Messaging",
    copy:
      "Conversations attached to each booking plus a universal inbox with push + SMS alerts.",
  },
]

export const CustomerPortal = () => {
  return (
    <RoleGate
      allowedRoles={["customer", "admin"]}
      headline="Customer portal"
      description="Switch to your customer account or request access from Valley Airporter support to view this dashboard."
    >
      <div className="flex flex-col gap-6">
        <GlassPanel className="p-7">
          <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/70">
            Customer Experience
          </p>
          <h2 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
            Effortless airport transfers.
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-midnight/75">
            Customers log in to manage bookings, monitor driver location, and stay synced with Google
            Calendar. The progressive web app offers install prompts, offline caching, and smooth
            navigation on any device.
          </p>
        </GlassPanel>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <GlassPanel className="p-6">
            <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Next Trip</p>
            <h3 className="mt-2 font-heading text-2xl uppercase tracking-[0.28em] text-horizon">
              {customerDashboardData.nextTrip.route}
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-midnight/75">
              <li>
                <strong className="text-horizon/80">Pickup:</strong> {customerDashboardData.nextTrip.pickup}
              </li>
              <li>
                <strong className="text-horizon/80">Driver:</strong> {customerDashboardData.nextTrip.driver}
              </li>
              <li>
                <strong className="text-horizon/80">Vehicle:</strong> {customerDashboardData.nextTrip.vehicle}
              </li>
              <li>
                <strong className="text-horizon/80">Status:</strong> {customerDashboardData.nextTrip.status}
              </li>
            </ul>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-horizon/30 bg-white/70 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-horizon/70">
              Loyalty Tier: {customerDashboardData.loyaltyTier}
              <span className="ml-2 rounded-full bg-horizon/20 px-2 py-0.5 text-[0.6rem]">
                {customerDashboardData.availableCredits} credits
              </span>
            </div>
          </GlassPanel>
          <FleetMapPlaceholder
            title="Live Shuttle View"
            description="Track your shuttle in real time, share ETA links with family, and receive proactive alerts when your driver is near."
          />
        </div>

        <DashboardStats title="Trip Health" items={customerDashboardData.stats} columns={3} />

        <section className="grid gap-6 md:grid-cols-3">
          {customerFeatures.map((feature) => (
            <GlassPanel key={feature.title} className="p-6">
              <feature.icon className="h-8 w-8 text-glacier" />
              <h3 className="mt-4 font-heading text-lg uppercase tracking-[0.32em] text-horizon">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm text-midnight/75">{feature.copy}</p>
            </GlassPanel>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon/90">
              Booking Timeline
            </h3>
            <ul className="mt-4 space-y-4 text-sm text-midnight/75">
              <li className="flex items-start gap-3">
                <Clock className="mt-1 h-5 w-5 text-glacier" />
                Live ETAs with driver proximity and push notifications.
              </li>
              <li className="flex items-start gap-3">
                <CreditCard className="mt-1 h-5 w-5 text-ember" />
                Secure Square checkout with stored cards, deposits, and Stripe fallback.
              </li>
              <li className="flex items-start gap-3">
                <Smartphone className="mt-1 h-5 w-5 text-aurora" />
                Installable PWA with offline itinerary storage, receipts, and QR boarding passes.
              </li>
            </ul>
          </GlassPanel>
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon/90">
              Roadmap Extras
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-midnight/75">
              <li>Loyalty tiers with perks, promo codes, and corporate billing.</li>
              <li>Real-time Aviationstack cards pinned to each booking timeline.</li>
              <li>Saved favourite routes, addresses, and traveller profiles.</li>
              <li>Co-pilot features for families managing multiple passengers.</li>
            </ul>
          </GlassPanel>
        </section>

        <TimelineList
          title="Itinerary"
          items={customerDashboardData.upcomingTrips.map((trip) => ({
            time: trip.date,
            title: `${trip.from} → ${trip.to}`,
            subtitle: `${trip.passengers} passengers · Status: ${trip.status}`,
            status: trip.status === "Confirmed" ? "active" : trip.status === "Pending" ? "default" : "completed",
          }))}
        />

        <section className="grid gap-4">
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
              Conversations
            </h3>
            <p className="mt-3 text-sm text-midnight/75">
              View upcoming trip updates and chat with dispatch. Messages sync instantly once
              Firebase is connected; for now, explore the preview inbox.
            </p>
          </GlassPanel>
          <MessagingInbox role="customer" />
        </section>
      </div>
    </RoleGate>
  )
}
