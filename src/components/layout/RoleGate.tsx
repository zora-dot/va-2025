import { type PropsWithChildren } from "react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { useAuth } from "@/lib/hooks/useAuth"
import { useFirebase } from "@/lib/hooks/useFirebase"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import type { AppUserRole } from "@/lib/types/auth"

type RoleGateProps = PropsWithChildren<{
  allowedRoles: AppUserRole[]
  headline: string
  description?: string
  previewMode?: boolean
}>

export const RoleGate = ({ allowedRoles, headline, description, previewMode = false, children }: RoleGateProps) => {
  const auth = useAuth()
  const firebase = useFirebase()
  const navigate = useNavigate()
  const { location } = useRouterState()
  const currentPath = `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`

  const allowPreview = true

  if (!firebase.enabled) {
    return (
      <div className="flex flex-col gap-4">
        <GlassPanel className="border-dashed border-horizon/40 bg-white/60 p-6 text-center">
          <p className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
            Authentication disabled
          </p>
          <p className="mt-3 text-sm text-midnight/75">
            Firebase credentials are not configured. Showing a preview of this section without
            authentication. Add your Firebase keys to `.env.local` to enable secure access control.
          </p>
        </GlassPanel>
        {children}
      </div>
    )
  }

  if (auth.loading) {
    return (
      <GlassPanel className="p-6 text-center">
        <p className="font-heading text-sm uppercase tracking-[0.35em] text-horizon/80">
          Checking access
        </p>
        <p className="mt-3 text-sm text-midnight/70">
          Hang tight while we confirm your credentials.
        </p>
      </GlassPanel>
    )
  }

  if (!auth.user) {
    if (allowPreview) {
      return (
        <div className="flex flex-col gap-4">
          <GlassPanel className="border border-dashed border-horizon/30 bg-white/60 p-6 text-center">
            <p className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
              Preview Mode
            </p>
            <p className="mt-3 text-sm text-midnight">
              Sign in to access live data. For now you&apos;re viewing a sample dashboard.
            </p>
            <button
              onClick={() => navigate({ to: "/auth", search: { redirect: currentPath } })}
              className="mt-4 inline-flex items-center justify-center rounded-full border border-horizon/40 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-horizon hover:text-white"
            >
              Sign In
            </button>
          </GlassPanel>
          {children}
        </div>
      )
    }
    return (
      <GlassPanel className="p-6 text-center">
        <p className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
          Sign in required
        </p>
        <p className="mt-3 text-sm text-midnight">
          {description ??
            "You need to sign in before accessing this section of the Valley Airporter app."}
        </p>
        <button
          onClick={() => navigate({ to: "/auth", search: { redirect: currentPath } })}
          className="mt-4 inline-flex items-center justify-center rounded-full border border-horizon/40 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-horizon hover:text-white"
        >
          Sign In
        </button>
      </GlassPanel>
    )
  }

  if (!auth.hasRole(allowedRoles)) {
    if (previewMode || allowPreview) {
      return (
        <div className="flex flex-col gap-4">
          <GlassPanel className="border border-dashed border-horizon/30 bg-white/60 p-6 text-center">
            <p className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
              Preview Mode
            </p>
            <p className="mt-3 text-sm text-midnight">
              {description ??
                "You’re viewing a preview of this console. Request elevated permissions in production to access live controls."}
            </p>
          </GlassPanel>
          {children}
        </div>
      )
    }
    return (
      <GlassPanel className="p-6 text-center">
        <p className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
          {headline}
        </p>
        <p className="mt-3 text-sm text-midnight">
          {description ??
            "Your account doesn’t have access to this area yet. Please contact dispatch if you need additional permissions."}
        </p>
      </GlassPanel>
    )
  }

  return <>{children}</>
}
