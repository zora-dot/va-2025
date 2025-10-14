import { GlassPanel } from "@/components/ui/GlassPanel"
import { Compass, Fuel, MapPinned, PhoneCall, Shield, Upload } from "lucide-react"
import { RoleGate } from "@/components/layout/RoleGate"
import { MessagingInbox } from "@/features/messaging/components/MessagingInbox"
import { DashboardStats } from "@/features/dashboard/components/DashboardStats"
import { TimelineList } from "@/features/dashboard/components/TimelineList"
import { FleetMapPlaceholder } from "@/features/dashboard/components/FleetMapPlaceholder"
import { driverDashboardData } from "@/features/dashboard/data/mockDashboard"

const driverHighlights = [
  {
    icon: MapPinned,
    title: "Manifest & Navigation",
    description:
      "Receive live manifests with passenger notes, baggage counts, and a single tap to launch preferred navigation apps.",
  },
  {
    icon: Shield,
    title: "Safety & Compliance",
    description:
      "Digital vehicle inspections, insurance acknowledgements, and fatigue check-ins stored securely via Firestore.",
  },
  {
    icon: PhoneCall,
    title: "Direct Messaging",
    description:
      "Threaded messaging with dispatch and customers, including push notifications and quick-reply templates.",
  },
]

export const DriverPortal = () => {
  return (
    <RoleGate
      allowedRoles={["driver", "admin"]}
      headline="Driver portal"
      description="Only authorized drivers can access dispatch assignments and telematics. Contact dispatch to enable your driver profile."
      previewMode
    >
      <section className="flex flex-col gap-6">
        <GlassPanel className="p-7">
          <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/70">
            Driver Companion
          </p>
          <h2 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
            Focus on safe, on-time arrivals.
          </h2>
          <p className="mt-4 max-w-3xl text-sm text-midnight/75">
            Drivers use the PWA to accept trips, share live GPS, complete checklists, and stay in sync
            with dispatch. The interface prioritizes clarity at a glance with bold typography and high
            contrast components.
          </p>
        </GlassPanel>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <GlassPanel className="p-6">
            <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Next Assignment</p>
            <h3 className="mt-2 font-heading text-2xl uppercase tracking-[0.28em] text-horizon">
              {driverDashboardData.nextAssignment.route}
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-midnight/75">
              <li>
                <strong className="text-horizon/80">Booking:</strong> {driverDashboardData.nextAssignment.bookingId}
              </li>
              <li>
                <strong className="text-horizon/80">Pickup Window:</strong> {driverDashboardData.nextAssignment.pickupWindow}
              </li>
              <li>
                <strong className="text-horizon/80">Passengers:</strong> {driverDashboardData.nextAssignment.passengers}
              </li>
              <li>
                <strong className="text-horizon/80">Notes:</strong> {driverDashboardData.nextAssignment.specialNotes}
              </li>
            </ul>
          </GlassPanel>
          <FleetMapPlaceholder
            title="Route Preview"
            description="Optimized routing overlays traffic, weather, and airport construction notices to keep every run on time."
          />
        </div>

        <DashboardStats title="Shift Readiness" items={driverDashboardData.stats} columns={3} />

        <section className="grid gap-6 md:grid-cols-3">
          {driverHighlights.map((item) => (
            <GlassPanel key={item.title} className="p-6">
              <item.icon className="h-8 w-8 text-glacier" />
              <h3 className="mt-4 font-heading text-lg uppercase tracking-[0.32em] text-horizon">
                {item.title}
              </h3>
              <p className="mt-3 text-sm text-midnight/75">{item.description}</p>
            </GlassPanel>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon/90">
              Shift Snapshot
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-midnight/75">
              <li>Shift: {driverDashboardData.shift.start} – {driverDashboardData.shift.end}</li>
              <li>Vehicle: {driverDashboardData.shift.vehicle}</li>
              <li>Odometer: {driverDashboardData.shift.odometer}</li>
            </ul>
          </GlassPanel>
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon/90">
              Quick Actions
            </h3>
            <div className="mt-4 space-y-3 text-sm text-midnight/75">
              <ActionRow icon={Compass} text="Toggle availability or go off-shift with required notes." />
              <ActionRow icon={Upload} text="Upload receipts and incident reports with offline support." />
              <ActionRow icon={Fuel} text="Log fuel stops, mileage, and maintenance reminders." />
            </div>
          </GlassPanel>
        </section>

        <TimelineList
          title="Today's Manifest"
          items={driverDashboardData.assignments.map((item) => ({
            time: item.time,
            title: item.route,
            subtitle: `Trip ${item.id} • Status: ${item.status}`,
            status:
              item.status === "En Route"
                ? "active"
                : item.status === "Assigned"
                ? "default"
                : item.status === "Standby"
                ? "completed"
                : "default",
          }))}
        />

        <section className="grid gap-4">
          <GlassPanel className="p-6">
            <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
              Dispatch Messages
            </h3>
            <p className="mt-3 text-sm text-midnight/75">
              Stay aligned with dispatch and passengers. Messaging will connect to Firebase in the
              production build; the preview shows how conversations flow.
            </p>
          </GlassPanel>
          <MessagingInbox role="driver" />
        </section>
      </section>
    </RoleGate>
  )
}

const ActionRow = ({
  icon: Icon,
  text,
}: {
  icon: typeof Compass
  text: string
}) => (
  <p className="flex items-start gap-3 text-midnight/75">
    <Icon className="mt-1 h-5 w-5 text-aurora" />
    {text}
  </p>
)
