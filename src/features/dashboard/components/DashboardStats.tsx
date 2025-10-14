import { GlassPanel } from "@/components/ui/GlassPanel"
import { clsx } from "clsx"

export interface StatItem {
  label: string
  value: string
  delta?: string
  tone?: "default" | "success" | "warning" | "danger"
}

const toneClasses: Record<NonNullable<StatItem["tone"]>, string> = {
  default: "border-horizon/20 bg-white/70 text-midnight/90",
  success: "border-emerald-400/40 bg-emerald-200/30 text-emerald-900",
  warning: "border-amber-400/40 bg-amber-200/30 text-amber-900",
  danger: "border-rose-400/40 bg-rose-200/30 text-rose-900",
}

export const DashboardStats = ({
  title,
  items,
  columns = 3,
}: {
  title: string
  items: StatItem[]
  columns?: 2 | 3 | 4
}) => {
  return (
    <GlassPanel className="p-6">
      <h3 className="font-heading text-base uppercase tracking-[0.32em] text-horizon">{title}</h3>
      <div
        className={clsx(
          "mt-6 grid gap-4",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
          columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        {items.map((item) => (
          <div
            key={item.label}
            className={clsx(
              "rounded-2xl border px-4 py-4 shadow-sm transition hover:shadow-lg",
              toneClasses[item.tone ?? "default"],
            )}
          >
            <p className="text-xs uppercase tracking-[0.3em] text-horizon/70">{item.label}</p>
            <p className="mt-2 text-xl font-semibold">{item.value}</p>
            {item.delta ? (
              <p className="mt-1 text-xs uppercase tracking-[0.28em] text-horizon/60">
                {item.delta}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}
