import { type ReactNode } from "react"
import { AlertTriangle, CircleCheck, Info } from "lucide-react"
import { clsx } from "clsx"

export const EmptyState = ({
  icon = <Info className="h-6 w-6 text-horizon" aria-hidden />,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-horizon/15 bg-white/70 px-6 py-10 text-center text-midnight/70">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-horizon/10 text-horizon">
      {icon}
    </div>
    <p className="font-heading text-base uppercase tracking-[0.32em] text-horizon">{title}</p>
    {description ? <p className="max-w-sm text-sm leading-relaxed">{description}</p> : null}
    {action}
  </div>
)

const bannerTone = {
  info: "border-horizon/20 bg-white/90 text-horizon",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-sky/50 bg-sky/15 text-horizon",
  danger: "border-ember/60 bg-ember/10 text-ember",
} as const

const bannerIcon = {
  info: <Info className="h-4 w-4" aria-hidden />,
  success: <CircleCheck className="h-4 w-4" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden />,
  danger: <AlertTriangle className="h-4 w-4" aria-hidden />,
} as const

type BannerTone = keyof typeof bannerTone

export const ErrorBanner = ({
  tone = "danger",
  title,
  message,
  action,
}: {
  tone?: BannerTone
  title: string
  message?: string
  action?: ReactNode
}) => (
  <div
    role={tone === "danger" ? "alert" : "status"}
    className={clsx(
      "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm",
      bannerTone[tone],
    )}
  >
    <div className="flex items-center gap-2">
      {bannerIcon[tone]}
      <div>
        <p className="font-semibold uppercase tracking-[0.28em]">{title}</p>
        {message ? <p className="text-xs tracking-normal text-midnight/70">{message}</p> : null}
      </div>
    </div>
    {action}
  </div>
)

export const SkeletonCard = ({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) => (
  <div className={clsx("animate-pulse space-y-3 rounded-2xl border border-horizon/10 bg-white/60 p-4", className)}>
    <div className="h-4 w-2/5 rounded-full bg-surface-strong/60" />
    {Array.from({ length: lines }).map((_, index) => (
      <div key={index} className="h-3 w-full rounded-full bg-surface-strong/50" />
    ))}
  </div>
)
