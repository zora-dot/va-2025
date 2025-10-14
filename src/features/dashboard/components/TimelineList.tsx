import { GlassPanel } from "@/components/ui/GlassPanel"
import { clsx } from "clsx"

export interface TimelineItem {
  time: string
  title: string
  subtitle?: string
  status?: "default" | "active" | "delayed" | "completed"
}

const statusColor: Record<NonNullable<TimelineItem["status"]>, string> = {
  default: "bg-horizon/30",
  active: "bg-glacier/60",
  delayed: "bg-amber-400",
  completed: "bg-emerald-400",
}

export const TimelineList = ({
  title,
  items,
  subtitle,
}: {
  title: string
  items: TimelineItem[]
  subtitle?: string
}) => {
  return (
    <GlassPanel className="p-6">
      <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon">{title}</h3>
      {subtitle ? (
        <p className="mt-3 text-sm text-midnight/70">{subtitle}</p>
      ) : null}
      <div className="mt-6 space-y-5">
        {items.map((item) => (
          <div key={`${item.time}-${item.title}`} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="rounded-full border border-horizon/30 bg-white/80 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-horizon/70">
                {item.time}
              </span>
              <span className="mt-2 h-full w-0.5 bg-horizon/20" aria-hidden />
            </div>
            <div className="flex-1 rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-midnight/90">{item.title}</p>
                {item.status ? (
                  <span
                    className={clsx(
                      "rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-white",
                      statusColor[item.status],
                    )}
                  >
                    {item.status}
                  </span>
                ) : null}
              </div>
              {item.subtitle ? (
                <p className="mt-2 text-sm text-midnight/70">{item.subtitle}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}
