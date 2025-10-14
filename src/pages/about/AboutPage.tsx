import { GlassPanel } from "@/components/ui/GlassPanel"
import { aboutContent } from "@/data/about"
import { ShieldCheck, Users, Clock, MapPin } from "lucide-react"

const cleanedParagraphs = aboutContent
  .split("\n")
  .map((paragraph) => paragraph.replace(/^#+\s*/, "").trim())
  .filter((paragraph) =>
    paragraph &&
    !/^your email/i.test(paragraph) &&
    !/^subject/i.test(paragraph) &&
    !/^quick links/i.test(paragraph) &&
    paragraph.toLowerCase() !== "hello." &&
    !/^requesting airport/i.test(paragraph),
  )
  .slice(0, 6)

const serviceHighlights = [
  {
    title: "Certified Chauffeurs",
    description: "Experienced, safety-focused drivers with 15+ years on Fraser Valley routes.",
    icon: ShieldCheck,
  },
  {
    title: "Group Friendly",
    description: "Corporate accounts, wedding parties, and team travel welcomed.",
    icon: Users,
  },
  {
    title: "24/7 Dispatch",
    description: "Round-the-clock text, phone, and email response for urgent travel.",
    icon: Clock,
  },
  {
    title: "Door-to-Door",
    description: "Residential, hotel, ferry, and cruise terminal pickups across the region.",
    icon: MapPin,
  },
]

const airportList = [
  "Abbotsford International Airport (YXX)",
  "Vancouver International Airport (YVR)",
  "Bellingham International Airport (BLI)",
]

export const AboutPage = () => {
  return (
    <div className="flex flex-col gap-6 pb-16">
      <GlassPanel className="p-7">
        <p className="font-heading text-base uppercase tracking-[0.35em] text-horizon/70">
          Since 2008
        </p>
        <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
          About Valley Airporter
        </h1>
        <p className="mt-4 max-w-3xl text-base text-midnight/75">
          Valley Airporter has moved over 35,000 travellers across the Fraser Valley and Lower Mainland,
          combining door-to-door convenience with professional chauffeurs and modern shuttle vans.
        </p>
      </GlassPanel>
      <GlassPanel className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 text-base text-midnight/80">
          {cleanedParagraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        <div className="space-y-4">
          <img
            src="https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1000&q=80"
            alt="Valley Airporter shuttle fleet"
            className="h-56 w-full rounded-3xl object-cover"
          />
          <div className="rounded-2xl border border-horizon/25 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-horizon/80">
              Airports We Service
            </p>
            <ul className="mt-3 space-y-2 text-base text-midnight/75">
              {airportList.map((airport) => (
                <li key={airport}>{airport}</li>
              ))}
            </ul>
          </div>
        </div>
      </GlassPanel>
      <GlassPanel className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {serviceHighlights.map((item) => (
            <div
              key={item.title}
              className="flex h-full flex-col gap-3 rounded-2xl border border-horizon/20 bg-white/80 p-5 shadow-sm"
            >
              <item.icon className="h-8 w-8 text-horizon" aria-hidden />
              <h3 className="font-heading text-base uppercase tracking-[0.3em] text-horizon">
                {item.title}
              </h3>
              <p className="text-base text-midnight/75">{item.description}</p>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  )
}

export default AboutPage
