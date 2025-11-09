import { BookingWizard } from "@/features/booking/components/BookingWizard"
import { GlassPanel } from "@/components/ui/GlassPanel"

export const BookingPage = () => {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <GlassPanel className="p-5 sm:p-7">
        <p className="font-heading text-xs uppercase tracking-[0.28em] text-horizon/70 sm:text-base sm:tracking-[0.35em]">
          Valley Airporter Booking
        </p>
        <h1 className="mt-3 font-heading text-2xl uppercase tracking-[0.2em] text-horizon sm:mt-4 sm:text-3xl sm:tracking-[0.28em]">
          Schedule your shuttle
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-midnight/75">
          <span className="whitespace-nowrap">
            Build your itinerary, review pricing in real time, and finalize secure payment via Square Payment Provider.
          </span>{" "}
          Dispatch receives every detail once you submit the form.
        </p>
      </GlassPanel>
      <BookingWizard />
    </div>
  )
}
