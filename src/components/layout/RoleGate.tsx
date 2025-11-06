import { type PropsWithChildren } from "react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { useAuth } from "@/lib/hooks/useAuth"
import { useFirebase } from "@/lib/hooks/useFirebase"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import type { AppUserRole } from "@/lib/types/auth"
import { useUserProfile } from "@/lib/hooks/useProfile"
import { MAGIC_LINK_PASSWORD_REQUIRED_KEY } from "@/app/providers/AuthProvider"

type RoleGateProps = PropsWithChildren<{
  allowedRoles: AppUserRole[]
  headline: string
  description?: string
  previewMode?: boolean
  requireProfile?: boolean
}>

export const RoleGate = ({
  allowedRoles,
  headline,
  description,
  previewMode = false,
  requireProfile = true,
  children,
}: RoleGateProps) => {
  const auth = useAuth()
  const firebase = useFirebase()
  const navigate = useNavigate()
  const { location } = useRouterState()
  const currentPath = (() => {
    const pathname = location.pathname ?? ""
    const rawSearch = location.search
    let search = ""
    if (typeof rawSearch === "string") {
      search = rawSearch
    } else if (rawSearch && typeof rawSearch === "object") {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(rawSearch)) {
        if (Array.isArray(value)) {
          value.forEach((entry) => params.append(key, String(entry)))
        } else if (value !== undefined && value !== null) {
          params.set(key, String(value))
        }
      }
      const query = params.toString()
      if (query) {
        search = `?${query}`
      }
    }
    const hash = typeof location.hash === "string" ? location.hash : ""
    return `${pathname}${search}${hash}`
  })()
  const { profile, loading: profileLoading } = useUserProfile(requireProfile && Boolean(auth.user))

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

  const needsPassword = (() => {
    if (!auth.user) return false
    if (typeof window === "undefined") {
      return !auth.hasPasswordProvider
    }
    try {
      const flag = window.localStorage.getItem(MAGIC_LINK_PASSWORD_REQUIRED_KEY) === "true"
      if (auth.hasPasswordProvider) {
        if (flag) {
          window.localStorage.removeItem(MAGIC_LINK_PASSWORD_REQUIRED_KEY)
        }
        return false
      }
      return flag || !auth.hasPasswordProvider
    } catch {
      return !auth.hasPasswordProvider
    }
  })()

  if (needsPassword && !location.pathname.startsWith("/auth/set-password")) {
    navigate({
      to: "/auth/set-password",
      search: { redirect: currentPath, requirePassword: "1" },
    })
    return (
      <GlassPanel className="p-6 text-center">
        <p className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
          Secure your account
        </p>
        <p className="mt-3 text-sm text-midnight">
          Create a password to continue. You can still request magic links anytime.
        </p>
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

  if (requireProfile) {
    if (profileLoading) {
      return (
        <GlassPanel className="p-6 text-center">
          <p className="font-heading text-sm uppercase tracking-[0.35em] text-horizon/80">Loading profile</p>
          <p className="mt-3 text-sm text-midnight/70">One moment while we verify your contact details.</p>
        </GlassPanel>
      )
    }
    const authPhoneNumber = auth.user?.phoneNumber ?? null
    const phoneConfirmed =
      authPhoneNumber
        ? true
        : typeof profile?.phoneVerified === "boolean"
          ? profile.phoneVerified
          : Boolean(profile?.phoneVerifiedAt)
    const hasPhone = profile?.phone ?? authPhoneNumber
    const profileComplete = Boolean(hasPhone && profile?.roleRequest && phoneConfirmed)
    if (!profileComplete) {
      return (
        <GlassPanel className="p-6 text-center">
          <p className="font-heading text-base uppercase tracking-[0.32em] text-horizon">Update required</p>
          <p className="mt-3 text-sm text-midnight">
            Add your contact phone number and access request to continue. This helps dispatch route you to the right portal.
          </p>
          <button
            onClick={() => navigate({ to: "/auth/profile", search: { redirect: currentPath } })}
            className="mt-4 inline-flex items-center justify-center rounded-full border border-horizon/40 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-horizon hover:text-white"
          >
            Complete profile
          </button>
        </GlassPanel>
      )
    }
  }

  return <>{children}</>
}
