
import { GlassPanel } from "@/components/ui/GlassPanel"
import { destinationContent } from "@/data/destinations"
import { useParams } from "@tanstack/react-router"

type DestinationKey = keyof typeof destinationContent

const titleMap: Record<DestinationKey, string> = {
  abbotsford: "Abbotsford to Airport Shuttles",
  chilliwack: "Chilliwack to Airport Shuttles",
  rosedale: "Rosedale or Hope to Airport Shuttles",
  mission: "Mission to Airport Shuttles",
  surrey: "Surrey to Airport Shuttles",
  vancouver: "Vancouver to Airport Shuttles",
}

const isDestinationKey = (value: string | undefined): value is DestinationKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(destinationContent, value)

export const DestinationPage = () => {
  const params = useParams({ strict: false }) as { slug?: string }

  if (!isDestinationKey(params.slug)) {
    return (
      <GlassPanel className="p-6 text-center text-sm text-midnight/80">
        We&apos;re preparing this destination page. Please choose another route from the navigation menu.
      </GlassPanel>
    )
  }

  const slug = params.slug
  const content = destinationContent[slug]
  const title = titleMap[slug] ?? "Valley Airporter Shuttle"

  const paragraphs = content
    .split(/\r?\n\s*\r?\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  return (
    <div className="flex flex-col gap-6 pb-16">
      <GlassPanel className="p-7">
        <p className="font-heading text-base uppercase tracking-[0.35em] text-horizon/70">
          Door-to-Door Shuttle
        </p>
        <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">{title}</h1>
        <p className="mt-4 text-sm text-midnight/75">
          Content on this page is sourced directly from valleyairporter.ca to preserve the service
          details you originally shared with customers.
        </p>
      </GlassPanel>
      <GlassPanel className="space-y-4 p-6 text-sm text-midnight/80">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </GlassPanel>
    </div>
  )
}

export default DestinationPage
