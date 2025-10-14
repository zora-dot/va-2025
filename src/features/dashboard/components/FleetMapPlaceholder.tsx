import { GlassPanel } from "@/components/ui/GlassPanel"

export const FleetMapPlaceholder = ({
  title,
  description,
}: {
  title: string
  description: string
}) => (
  <GlassPanel className="overflow-hidden p-0">
    <header className="flex items-center justify-between border-b border-horizon/15 px-5 py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Live Map Preview</p>
        <h3 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">{title}</h3>
      </div>
      <span className="rounded-full border border-horizon/30 bg-white/70 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-horizon/70">
        Coming Soon
      </span>
    </header>
    <div className="relative h-[280px] w-full overflow-hidden bg-gradient-to-br from-horizon/90 via-midnight/80 to-aurora/70">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(74,182,255,0.45),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(255,209,109,0.35),transparent_60%)]" />
      <div className="relative flex h-full flex-col justify-between px-6 py-5 text-white/90">
        <p className="max-w-sm text-sm leading-relaxed text-white/80">{description}</p>
        <div className="grid grid-cols-3 gap-3 text-xs uppercase tracking-[0.28em] text-white/70">
          <span className="rounded-full bg-white/20 px-3 py-2 text-center">Vehicle Telemetry</span>
          <span className="rounded-full bg-white/20 px-3 py-2 text-center">ETA Heatmap</span>
          <span className="rounded-full bg-white/20 px-3 py-2 text-center">Traffic Layers</span>
        </div>
      </div>
    </div>
  </GlassPanel>
)
