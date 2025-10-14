import { BookingWizard } from "@/features/booking/components/BookingWizard"
import { GlassPanel } from "@/components/ui/GlassPanel"

export const BookingPage = () => {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <GlassPanel className="p-7">
        <p className="font-heading text-base uppercase tracking-[0.35em] text-horizon/70">
          Valley Airporter Booking
        </p>
        <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
          Schedule your shuttle
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-midnight/75">
          Build your itinerary, review pricing in real time, and finalize secure payment once Square
          integration is activated. Dispatch receives every detail instantly.
        </p>
      </GlassPanel>
      <BookingWizard />
    </div>
  )
}
