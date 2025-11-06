import { GlassPanel } from "@/components/ui/GlassPanel"
import { ResponsiveImage } from "@/components/ui/ResponsiveImage"
import { HOURLY_TOUR_LABEL } from "@/features/booking/pricing"

const toResponsiveSrc = (url: string, width: number) => {
  if (!url) return url
  const withWidth = url.includes("w=")
    ? url.replace(/w=\d+/g, `w=${width}`)
    : `${url}${url.includes("?") ? "&" : "?"}w=${width}`
  return withWidth.includes("fm=webp") ? withWidth : `${withWidth}${withWidth.includes("?") ? "&" : "?"}fm=webp`
}

const tourPackages = [
  {
    name: "Sea-to-Sky Explorer",
    description:
      "Private shuttle from the Fraser Valley to Whistler Village with scenic stops in Squamish and Shannon Falls. Ideal for ski getaways or alpine sightseeing.",
    image: "https://i.postimg.cc/fRtzmCt8/oie-6q-X3sv-Uk8bj8.jpg",
    duration: "8-10 hours",
    highlights: ["Door-to-door pickup", "Gear-friendly sprinter vans", "Coordinated return transfer"],
  },
  {
    name: "Harrison Hot Springs Retreat",
    description:
      "Relaxing day trip to Harrison Hot Springs Resort. We coordinate check-in, dining reservations, and optional lake cruise add-ons.",
    image: "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1200&q=80",
    duration: "6-8 hours",
    highlights: ["Flexible departure times", "Complimentary bottled water", "Groups up to 14 passengers"],
  },
  {
    name: "Fraser Valley Wine Country",
    description:
      "Visit award-winning wineries across Langley and Abbotsford. Custom itineraries with time for tastings, farm-to-table dining, and private barrel rooms.",
    image: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1200&q=80",
    duration: "5-7 hours",
    highlights: ["Designated driver included", "Cold storage for purchases", "Curated partner vineyard list"],
  },
]

export const ToursPage = () => {
  return (
    <div className="flex flex-col gap-6 pb-16">
      <GlassPanel className="grid gap-6 p-7 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="font-heading text-base uppercase tracking-[0.35em] text-horizon/70">
            Experience the Fraser Valley
          </p>
          <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
            Tours by Shuttle
          </h1>
          <p className="mt-4 text-base text-midnight/75">
            Our charter team crafts effortless day trips for families, corporate retreats, and wedding parties.
            Every tour includes professional chauffeurs, itinerary support, and spacious vehicles with luggage capacity.
          </p>
          <p className="mt-4 rounded-2xl border border-horizon/20 bg-white/80 px-4 py-3 text-sm text-midnight/80">
            {HOURLY_TOUR_LABEL}: <strong className="text-horizon">$100.00 per hour</strong> (introductory staging rate—package
            pricing available on request).
          </p>
        </div>
        <ResponsiveImage
          src="https://i.postimg.cc/mZMKYMhB/778-7786017-airport-shuttle-minibus-1.png"
          alt="Shuttle parked near mountain outlook"
          className="h-[380px] w-full rounded-3xl object-cover shadow-lg"
          sources={[
            {
              srcSet: toResponsiveSrc("https://i.postimg.cc/mZMKYMhB/778-7786017-airport-shuttle-minibus-1.png", 640),
              type: "image/webp",
              media: "(max-width: 768px)",
            },
          ]}
        />
      </GlassPanel>

      {tourPackages.map((tour) => (
        <GlassPanel key={tour.name} className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
          <ResponsiveImage
            src={tour.image}
            alt={tour.name}
            className="h-60 w-full rounded-3xl object-cover shadow-md"
            sources={[
            {
              srcSet: toResponsiveSrc(tour.image, 640),
              type: "image/webp",
              media: "(max-width: 768px)",
            },
          ]}
        />
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-heading text-2xl uppercase tracking-[0.28em] text-horizon">
                {tour.name}
              </h2>
              <p className="mt-3 text-base text-midnight/75">{tour.description}</p>
            </div>
            <div className="rounded-2xl border border-horizon/20 bg-white/80 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-horizon/80">
                Highlights
              </p>
              <ul className="mt-3 grid gap-2 text-base text-midnight/75 sm:grid-cols-2">
                <li>
                  <strong>Duration:</strong> {tour.duration}
                </li>
                {tour.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-midnight/70">
              Ready to customize this experience? Reach our charter desk at{" "}
              <span className="font-semibold text-horizon">(604) 751-6688</span> or{" "}
              <a href="mailto:info@valleyairporter.ca" className="text-horizon underline">
                info@valleyairporter.ca
              </a>.
            </p>
          </div>
        </GlassPanel>
      ))}
    </div>
  )
}

export default ToursPage
