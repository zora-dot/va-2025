import { GlassPanel } from "@/components/ui/GlassPanel"
import { ArrowRight, LogIn, Quote, Smartphone } from "lucide-react"
import { Link } from "@tanstack/react-router"

export const GuestPortal = () => {
  return (
    <section className="flex flex-col gap-6">
      <GlassPanel className="p-7">
        <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/70">
          Guest Booking
        </p>
        <h2 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
          Start a reservation without an account.
        </h2>
        <p className="mt-4 max-w-2xl text-sm text-midnight/75">
          Guests can generate quotes, secure a ride, and optionally convert to a full account for
          loyalty perks. Booking progress saves locally so rides can be finished later—even offline.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-horizon/40 bg-white/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-white/90"
          >
            Return Home
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </GlassPanel>

      <section className="grid gap-6 lg:grid-cols-3">
        <GlassPanel className="p-6">
          <Quote className="h-8 w-8 text-glacier" />
          <h3 className="mt-4 font-heading text-lg uppercase tracking-[0.32em] text-horizon">
            Guided Quote
          </h3>
          <p className="mt-3 text-sm text-midnight/75">
            Guests answer a handful of questions—pickup zone, destination, passengers, baggage—and
            get pricing sourced from the Valley Airporter matrix.
          </p>
        </GlassPanel>
        <GlassPanel className="p-6">
          <LogIn className="h-8 w-8 text-aurora" />
          <h3 className="mt-4 font-heading text-lg uppercase tracking-[0.32em] text-horizon">
            Seamless Upgrade
          </h3>
          <p className="mt-3 text-sm text-midnight/75">
            After checkout, guests can claim their booking with Firebase Auth to unlock customer
            dashboards without losing progress.
          </p>
        </GlassPanel>
        <GlassPanel className="p-6">
          <Smartphone className="h-8 w-8 text-ember" />
          <h3 className="mt-4 font-heading text-lg uppercase tracking-[0.32em] text-horizon">
            Install Prompt
          </h3>
          <p className="mt-3 text-sm text-midnight/75">
            The PWA nudges guests to add Valley Airporter to their home screen, ensuring receipts and
            trip updates remain accessible.
          </p>
        </GlassPanel>
      </section>

      <GlassPanel className="p-6">
        <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon/90">
          Follow-up Actions
        </h3>
        <ul className="mt-4 space-y-3 text-sm text-midnight/75">
          <li>
            Square-hosted checkout page sends confirmation via email/SMS and stores payment token for
            future loyalty upgrades.
          </li>
          <li>Google Calendar invite with itinerary details, pickup instructions, and driver info.</li>
          <li>Automated reminders to create a full account 24 hours prior to pickup.</li>
        </ul>
      </GlassPanel>
    </section>
  )
}
