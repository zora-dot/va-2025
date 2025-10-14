import { Link } from "@tanstack/react-router"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { ArrowRight, CalendarClock, CreditCard, MessageSquare, ShieldCheck, Clock3, MapPin, type LucideIcon } from "lucide-react"
import { heroServiceCopy } from "@/data/homeHero"
import { introStatsCopy } from "@/data/homeIntro"
import { experienceCopy } from "@/data/homeFeatures"


const airportGallery = [
  {
    title: "Abbotsford International Airport (YXX)",
    image: "https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=1200&q=80",
    description: "Morning departures across the Fraser Valley hub.",
  },
  {
    title: "Bellingham International Airport (BLI)",
    image: "https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?auto=format&fit=crop&w=1200&q=80",
    description: "Cross-border flights with quick customs processing.",
  },
  {
    title: "Vancouver International Airport (YVR)",
    image: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1200&q=80",
    description: "Canada's gateway to the world, served day and night.",
  },
]

const highlights = [
  {
    title: 'Door-to-Door Service',
    description:
      'Comprehensive shuttle coverage across the Fraser Valley, Lower Mainland, and GVRD.',
    icon: MapPin,
  },
  {
    title: "Fluid Scheduling",
    description:
      "Book, reschedule, or cancel rides with live availability and instant confirmations. Syncs to Google Calendar automatically.",
    icon: CalendarClock,
  },
  {
    title: "Secure Payments",
    description:
      "Square and Stripe integrations with saved cards, receipts, promo codes, and enterprise invoicing.",
    icon: CreditCard,
  },
  {
    title: "Unified Messaging",
    description:
      "Threaded conversations per booking plus a smart inbox for drivers, customers, and dispatch.",
    icon: MessageSquare,
  },
]

export const HomePage = () => {
  return (
    <div className="flex flex-col gap-12 pb-8">
      <Hero />
      <section className="grid gap-6 md:grid-cols-3">
        {airportGallery.map((airport) => (
          <GlassPanel key={airport.title} className="overflow-hidden p-0">
            <img
              src={airport.image}
              alt={airport.title}
              className="h-48 w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <div className="space-y-3 p-6">
              <h3 className="font-heading text-lg uppercase tracking-[0.32em] text-horizon">
                {airport.title}
              </h3>
              <p className="text-base text-midnight/75">{airport.description}</p>
            </div>
          </GlassPanel>
        ))}
      </section>
     <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
       {highlights.map((item) => (
         <GlassPanel key={item.title} className="p-6">
           <item.icon className="mb-4 h-10 w-10 text-glacier" />
           <h3 className="font-heading text-xl uppercase tracking-[0.35em] text-horizon">
             {item.title}
           </h3>
           <p className="mt-3 text-sm text-midnight/75">{item.description}</p>
         </GlassPanel>
       ))}
     </section>
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <GlassPanel className="flex flex-col gap-4 p-6">
          <h3 className="font-heading text-lg uppercase tracking-[0.35em] text-horizon">
            Why Travelers Choose Valley Airporter
          </h3>
          <p className="text-sm text-midnight/80 whitespace-pre-line">{introStatsCopy}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <FeatureCallout icon={CalendarClock} title="Reserve Ahead" description="Book round-trips and recurring rides" />
            <FeatureCallout icon={CreditCard} title="Flexible Payment" description="Cash, card, e-transfer, airline vouchers" />
            <FeatureCallout icon={MessageSquare} title="Real-Time Updates" description="Text, email, and in-app notifications" />
            <FeatureCallout icon={ShieldCheck} title="Professional Chauffeurs" description="Trusted team with spotless safety record" />
          </div>
        </GlassPanel>
        <GlassPanel className="flex flex-col justify-between overflow-hidden p-6">
          <div className="space-y-4">
            <h3 className="font-heading text-lg uppercase tracking-[0.35em] text-horizon">
              15+ Years Serving the Fraser Valley
            </h3>
            <p className="text-sm text-midnight/75 whitespace-pre-line">{experienceCopy}</p>
          </div>
          <Link
            to="/reviews"
            className="mt-8 inline-flex items-center gap-2 self-start rounded-full border border-horizon/40 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:border-horizon/60 hover:bg-white/90"
          >
            Read 150+ Reviews
            <ArrowRight className="h-4 w-4" />
          </Link>
        </GlassPanel>
      </section>
      <section className="grid gap-6 md:grid-cols-2">
        <GlassPanel className="p-6">
          <h3 className="font-heading text-lg uppercase tracking-[0.45em] text-horizon">
            Flat Rate Airport Shuttle
          </h3>
          <p className="mt-4 text-sm text-midnight/75 whitespace-pre-line">
            {`• Guaranteed flat rate for any address\n• Same-day bookings please text or call 604-751-6688\n• Partnership with Cheam Tours Ltd. (Airport Link Shuttle – 604-594-3333)`}
          </p>
        </GlassPanel>
        <GlassPanel className="p-6">
          <h3 className="font-heading text-lg uppercase tracking-[0.45em] text-horizon">
            Key Service Highlights
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-midnight/75">
            <li>Door-to-door service across Fraser Valley, Lower Mainland, and GVRD.</li>
            <li>24/7/365 availability with professionally trained chauffeurs.</li>
            <li>Service to YXX, YVR, BLI, and leading ferry/cruise terminals.</li>
            <li>Corporate accounts, round trips, and large-group bookings welcomed.</li>
          </ul>
        </GlassPanel>
      </section>
    </div>
  )
}

const Hero = () => {
  return (
    <section className="relative flex flex-col gap-6">
      <GlassPanel className="flex flex-col gap-6 p-8">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-horizon/40 bg-white/70 px-4 py-1 text-xs uppercase tracking-[0.35em] text-horizon">
            Airport Shuttle Specialists
          </span>
          <h1 className="font-heading text-4xl uppercase tracking-[0.28em] text-horizon sm:text-5xl">
            Book • Track • Relax
          </h1>
          <p className="text-base text-midnight/80 whitespace-pre-line">
            {heroServiceCopy}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <HeroStat icon={ShieldCheck} label="Flat Rate" description="Guaranteed for any address" />
          <HeroStat icon={Clock3} label="24/7 Support" description="Call or text 604-751-6688" />
          <HeroStat icon={MapPin} label="Cheam Tours Partner" description="Airport Link Shuttle 604-594-3333" />
        </div>
        <div className="mt-2 flex flex-wrap gap-4">
          <Link
            to="/booking"
            className="inline-flex items-center gap-2 rounded-full border border-glacier/50 bg-glacier/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-midnight transition hover:bg-glacier/80"
          >
            Start Booking
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/faq"
            className="inline-flex items-center gap-2 rounded-full border border-horizon/40 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:border-horizon/60 hover:bg-white/90"
          >
            Explore FAQs
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </GlassPanel>
      <GlassPanel className="grid gap-4 p-6 lg:p-7">
        <h2 className="font-heading text-base uppercase tracking-[0.35em] text-horizon">
          Quick Quote (Preview)
        </h2>
        <div className="grid gap-4">
          <QuoteField label="Passengers" value="3 Travellers + ski gear" />
          <QuoteField label="From" value="Downtown Chilliwack" />
          <QuoteField label="To" value="Vancouver International Airport (YVR)" />
          <QuoteField label="Pickup" value="Mon • 05:30 AM" />
          <QuoteField label="Flight #" value="AC 817 – status green" />
        </div>
        <div className="rounded-2xl border border-horizon/20 bg-white/70 p-4">
          <div className="flex items-center justify-between text-base text-midnight/80">
            <span>Dynamic Quote</span>
            <span className="font-semibold text-horizon">$220.00 CAD</span>
          </div>
          <p className="mt-2 text-sm text-midnight/60">Based on Valley Airporter pricing matrix</p>
        </div>
      </GlassPanel>
    </section>
  )
}

const FeatureCallout = ({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) => (
  <div className="rounded-2xl border border-horizon/25 bg-white/70 p-4 shadow-sm">
    <Icon className="h-8 w-8 text-horizon" />
    <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-horizon">
      {title}
    </h4>
    <p className="mt-2 text-base text-midnight/75">{description}</p>
  </div>
)

const HeroStat = ({
  icon: Icon,
  label,
  description,
}: {
  icon: LucideIcon
  label: string
  description: string
}) => (
  <div className="rounded-2xl border border-white/50 bg-white/70 p-4 shadow-sm">
    <Icon className="h-6 w-6 text-horizon" />
    <p className="mt-3 text-sm font-semibold uppercase tracking-[0.32em] text-horizon">{label}</p>
    <p className="mt-1 text-xs text-midnight/70">{description}</p>
  </div>
)

const QuoteField = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-horizon/25 bg-white/70 px-4 py-3">
    <p className="text-[0.7rem] uppercase tracking-[0.3em] text-midnight/50">{label}</p>
    <p className="mt-1 text-sm text-midnight/80">{value}</p>
  </div>
)
