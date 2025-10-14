import { Link } from "@tanstack/react-router"
import { GlassPanel } from "@/components/ui/GlassPanel"

export const NotFoundPage = () => {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <GlassPanel className="max-w-md p-8 text-center">
        <p className="font-heading text-sm uppercase tracking-[0.4em] text-horizon/70">
          Off the Flight Path
        </p>
        <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.3em] text-horizon">
          404
        </h1>
        <p className="mt-4 text-sm text-midnight/75">
          The page you&apos;re trying to reach has departed. Let&apos;s guide you back to the main
          terminal.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full border border-horizon/40 bg-white/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-horizon transition hover:bg-white/90"
        >
          Return Home
        </Link>
      </GlassPanel>
    </div>
  )
}
