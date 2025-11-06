import { Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { BookingsList } from "@/features/bookings/components/BookingsList"

export const CustomerReceiptsPage = () => {
  return (
    <RoleGate
      allowedRoles={["customer", "admin"]}
      headline="Receipts & history"
      description="Download ride receipts and view a summary of recent payments."
      requireProfile
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Ride receipts</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
                Past bookings
              </h2>
            </div>
            <Link to="/portal/customer" className="va-button va-button--subtle px-5 py-[0.6rem] text-xs">
              Back to dashboard
            </Link>
          </header>
          <p className="mt-2 text-sm text-midnight/70">
            Use the filters below to grab PDFs for expense claims or personal records. Receipts include tip, payment method, and flight details where available.
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.3em] text-midnight/50">Showing last 12 months</p>
        </GlassPanel>

        <GlassPanel className="p-6">
          <BookingsList
            scope="past"
            title="Completed rides"
            subtitle="Tap any booking for full fare details and receipts."
            showLimitPicker={false}
            initialLimit={50}
            footer={
              <p className="text-xs uppercase tracking-[0.3em] text-midnight/60">
                Updated {format(new Date(), "MMM d, h:mm a")}
              </p>
            }
          />
        </GlassPanel>
      </section>
    </RoleGate>
  )
}
