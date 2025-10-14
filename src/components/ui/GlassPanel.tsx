import { type PropsWithChildren } from "react"
import { twMerge } from "tailwind-merge"
import { clsx } from "clsx"

type GlassPanelProps = PropsWithChildren<{
  className?: string
}>

export const GlassPanel = ({ className, children }: GlassPanelProps) => {
  return (
    <div
      className={twMerge(
        clsx(
          "group relative overflow-hidden rounded-glass border border-white/60 text-midnight",
          "bg-white/60 backdrop-blur-2xl shadow-glow transition-all duration-300 ease-out",
          "hover:-translate-y-1 hover:shadow-2xl hover:shadow-horizon/20 hover:border-horizon/40",
          "focus-within:-translate-y-1 focus-within:shadow-2xl focus-within:shadow-horizon/20",
          "before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/60 before:via-white/40 before:to-transparent",
          "after:pointer-events-none after:absolute after:-top-12 after:right-6 after:h-40 after:w-40 after:rounded-full after:bg-white/50 after:blur-3xl",
          className,
        ),
      )}
    >
      <div className="relative">{children}</div>
    </div>
  )
}
