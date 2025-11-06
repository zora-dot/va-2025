import { memo, type PropsWithChildren } from "react"
import { twMerge } from "tailwind-merge"
import { clsx } from "clsx"

type GlassPanelProps = PropsWithChildren<{
  className?: string
}>

const GlassPanelComponent = ({ className, children }: GlassPanelProps) => {
  return (
    <div
      className={twMerge(
        clsx(
          "group rounded-glass border border-white/35 text-midnight",
          "bg-[color:var(--va-color-surface)]/92 backdrop-blur-2xl shadow-[0_24px_55px_-24px_rgba(31,90,168,0.35)] transition-all duration-300 ease-out",
          "hover:-translate-y-1 hover:shadow-[0_26px_55px_-26px_rgba(44,177,166,0.35)] hover:border-horizon/30",
          "focus-within:-translate-y-1 focus-within:shadow-[0_28px_60px_-26px_rgba(44,177,166,0.35)]",
          "before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/65 before:via-white/30 before:to-transparent",
          "after:pointer-events-none after:absolute after:-top-14 after:right-4 after:h-44 after:w-44 after:rounded-full after:bg-gradient-to-br after:from-[rgba(255,180,84,0.35)] after:via-transparent after:to-transparent after:blur-3xl",
          className,
        ),
      )}
    >
      <div className="relative">{children}</div>
    </div>
  )
}

GlassPanelComponent.displayName = "GlassPanel"

export const GlassPanel = memo(GlassPanelComponent)
