import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Loader2, ShieldCheck } from "lucide-react"
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { useFirebase } from "@/lib/hooks/useFirebase"
import { useAuth } from "@/lib/hooks/useAuth"
import { useToast } from "@/components/ui/ToastProvider"
import {
  MAGIC_LINK_EMAIL_KEY,
  MAGIC_LINK_PASSWORD_REQUIRED_KEY,
  MAGIC_LINK_REDIRECT_KEY,
} from "@/app/providers/AuthProvider"

const sanitizeRedirect = (raw?: string | null): string | null => {
  if (!raw) return null
  let current = raw
  let safety = 0
  while (current.startsWith("/auth") && safety < 4) {
    const queryIndex = current.indexOf("?")
    if (queryIndex === -1) break
    const searchParams = new URLSearchParams(current.slice(queryIndex + 1))
    const nested = searchParams.get("redirect")
    if (!nested) break
    try {
      const decoded = decodeURIComponent(nested)
      current = decoded
    } catch {
      current = nested
    }
    safety += 1
  }
  if (!current.startsWith("/")) {
    return "/booking"
  }
  return current
}

type Status = "checking" | "needsEmail" | "signingIn" | "error"

export const MagicLinkPage = () => {
  const firebase = useFirebase()
  const auth = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string; requirePassword?: string }
  const { present } = useToast()

  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("checking")
  const [error, setError] = useState<string | null>(null)

  const redirectTarget = useMemo(() => {
    if (typeof search?.redirect === "string" && search.redirect.trim()) {
      return sanitizeRedirect(search.redirect) ?? "/booking"
    }
    try {
      const stored = window.localStorage.getItem(MAGIC_LINK_REDIRECT_KEY)
      if (stored && stored.trim()) {
        return sanitizeRedirect(stored) ?? "/booking"
      }
    } catch {
      // ignore read errors
    }
    return "/booking"
  }, [search])

  useEffect(() => {
    if (!firebase.enabled || !firebase.auth) {
      setStatus("error")
      setError("Authentication is currently unavailable. Please try again shortly.")
      return
    }
    const href = window.location.href
    if (!isSignInWithEmailLink(firebase.auth, href)) {
      setStatus("error")
      setError("This sign-in link is invalid or has already been used.")
      return
    }
    try {
      const storedEmail = window.localStorage.getItem(MAGIC_LINK_EMAIL_KEY)
      if (storedEmail && storedEmail.trim()) {
        setEmail(storedEmail)
        void completeSignIn(storedEmail)
      } else {
        setStatus("needsEmail")
      }
    } catch {
      setStatus("needsEmail")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebase.enabled, firebase.auth])

  const completeSignIn = useCallback(
    async (emailAddress: string) => {
      if (!firebase.enabled || !firebase.auth) {
        setStatus("error")
        setError("Authentication is currently unavailable. Please try again shortly.")
        return
      }
      const trimmed = emailAddress.trim()
      if (!trimmed) {
        setStatus("needsEmail")
        setError("Enter the email address you used to request the link.")
        return
      }
      setStatus("signingIn")
      setError(null)
      try {
        await signInWithEmailLink(firebase.auth, trimmed, window.location.href)
        try {
          window.localStorage.setItem(MAGIC_LINK_PASSWORD_REQUIRED_KEY, "true")
          window.localStorage.removeItem(MAGIC_LINK_EMAIL_KEY)
          window.localStorage.removeItem(MAGIC_LINK_REDIRECT_KEY)
        } catch {
          /* noop */
        }
        present({
          title: "Welcome aboard",
          description: "Email confirmed. Let’s finish setting up your account.",
          tone: "success",
        })
        await auth.refreshUser()
        const target = redirectTarget || "/booking"
        navigate({ to: target as never })
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : ""
        if (code === "auth/invalid-action-code" || code === "auth/expired-action-code") {
          setStatus("error")
          setError(
            "This magic link is no longer valid. Head back to the sign-up screen to request a fresh link.",
          )
        } else {
          setStatus("needsEmail")
          setError(
            err instanceof Error
              ? err.message
              : "We couldn't verify that link. Request a new one and try again.",
          )
        }
      }
    },
    [auth, firebase, navigate, present, redirectTarget],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === "signingIn") return
    await completeSignIn(email)
  }

  return (
    <div className="flex flex-col items-center gap-8 pb-16">
      <GlassPanel className="w-full max-w-2xl p-8">
        <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/80">
          Magic link sign-in
        </p>
        <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
          Welcome to Valley Airporter
        </h1>
        <p className="mt-3 text-sm text-midnight/75">
          We&apos;re confirming your email address. Once complete, you&apos;ll be redirected to set
          a password and finish onboarding.
        </p>

        {status === "signingIn" ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-horizon/20 bg-white/70 px-4 py-3 text-sm text-midnight/75">
            <Loader2 className="h-4 w-4 animate-spin text-horizon" aria-hidden />
            Checking your magic link...
          </div>
        ) : null}

        {status === "needsEmail" ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
              Confirm your email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 rounded-2xl border border-horizon/30 px-3 py-3 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
              />
            </label>
            <button
              type="submit"
              disabled={status === "signingIn"}
              className="va-button va-button--primary inline-flex w-full justify-center px-6 py-3"
            >
              {status === "signingIn" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Verifying...
                </>
              ) : (
                "Confirm and continue"
              )}
            </button>
          </form>
        ) : null}

        {status === "error" ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            <p>
              {error ??
                "This sign-in link can no longer be used. Request a fresh magic link to continue."}
            </p>
            <button
              type="button"
              onClick={() => {
                navigate({
                  to: "/auth",
                  search: { redirect: redirectTarget } as never,
                })
              }}
              className="va-button va-button--secondary inline-flex items-center justify-center px-4 py-2 text-xs uppercase tracking-[0.32em]"
            >
              Request new link
            </button>
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

      </GlassPanel>

      <GlassPanel className="w-full max-w-2xl p-6">
        <div className="flex items-center gap-3 text-horizon">
          <ShieldCheck className="h-5 w-5" aria-hidden />
          <p className="text-sm text-midnight/75">
            Your link is single-use and automatically expires. If anything looks off, close this
            page and request a new magic link from the sign-up screen.
          </p>
        </div>
      </GlassPanel>
    </div>
  )
}
