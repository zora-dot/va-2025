import { useCallback, useEffect, useState, type InputHTMLAttributes } from "react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { z } from "zod"
import { useForm, type UseFormRegister } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuth } from "@/lib/hooks/useAuth"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { clsx } from "clsx"
import { Eye, EyeOff, SendHorizontal } from "lucide-react"

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
})

type FormValues = { email: string; password?: string }

type AuthMode = "login" | "register"

const resolveAuthErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: string }).code)
    switch (code) {
      case "auth/operation-not-allowed":
        return "Magic link sign-in isn't enabled for this project. Ask the admin to enable Email Link sign-in in Firebase."
      case "auth/invalid-email":
        return "Enter a valid email address."
      case "auth/missing-email":
        return "Add your email before requesting a link."
      case "auth/too-many-requests":
        return "Too many requests. Wait a moment and try again."
      default:
        break
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export const AuthPage = () => {
  const [mode, setMode] = useState<AuthMode>("login")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [resendCountdown, setResendCountdown] = useState<number | null>(null)
  const auth = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string | string[] }

  const schema = mode === "login" ? loginSchema : registerSchema

  useEffect(() => {
    if (resendCountdown === null) return
    if (resendCountdown <= 0) {
      setResendCountdown(null)
      return
    }
    const timer = window.setTimeout(() => {
      setResendCountdown((previous) => (previous == null ? null : previous - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [resendCountdown])

  const determineNextRoute = useCallback(() => {
    const rawRedirect = search?.redirect
    let next: string | undefined
    if (typeof rawRedirect === "string" && rawRedirect.trim()) {
      next = rawRedirect
    } else if (Array.isArray(rawRedirect)) {
      next = rawRedirect.find(Boolean)
    }

    if (!next) {
      const role = auth.primaryRole
      if (role === "admin") return "/portal/admin"
      if (role === "driver") return "/portal/driver"
      return "/portal/customer"
    }

    return next
  }, [auth.primaryRole, search])

  const navigateTo = useCallback(
    (next: string) => {
      if (next.startsWith("http")) {
        window.location.assign(next)
      } else {
        navigate({ to: next as unknown as never })
      }
    },
    [navigate],
  )

  const form = useForm<FormValues>({
    // zodResolver typing struggles with dynamic schemas; safe to cast here for now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as never) as any,
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const handleSwitchMode = (nextMode: AuthMode) => {
    if (nextMode !== mode) {
      setMode(nextMode)
      setError(null)
      setMagicLinkSent(false)
      setResendCountdown(null)
      form.reset()
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true)
    setError(null)
    try {
      const next = determineNextRoute()
      if (mode === "login") {
        if (!values.password) {
          setError("Enter your password to continue.")
          return
        }
        await auth.signIn(values.email, values.password)
        await auth.refreshUser()
        navigateTo(next)
      } else {
        await auth.requestMagicLink(values.email, next)
        setMagicLinkSent(true)
        setResendCountdown(45)
        form.reset({ email: values.email, password: "" })
        return
      }
    } catch (err) {
      setError(resolveAuthErrorMessage(err, "There was an issue processing your request."))
      setMagicLinkSent(false)
      setResendCountdown(null)
    } finally {
      setPending(false)
    }
  })

  const handleSocialSignIn = async (provider: "google" | "apple") => {
    setPending(true)
    setError(null)
    try {
      if (provider === "google") {
        await auth.signInWithGoogle()
      } else {
        await auth.signInWithApple()
      }
      await auth.refreshUser()
      const next = determineNextRoute()
      if (!auth.hasPasswordProvider) {
        navigate({
          to: "/auth/set-password",
          search: { redirect: next } as never,
        })
      } else {
        navigate({
          to: "/auth/profile",
          search: { redirect: next } as never,
        })
      }
    } catch (err) {
      setError(resolveAuthErrorMessage(err, "Unable to complete social sign-in right now."))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 pb-16">
      <GlassPanel className="w-full max-w-3xl p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/80">
              Valley Airporter Access
            </p>
            <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
              {mode === "login" ? "Welcome back aboard" : "Create your account"}
            </h1>
            <p className="mt-3 max-w-md text-sm text-midnight/75">
              Sign in to manage your bookings, track shuttles in real time, and stay in sync with
              dispatch. Create a new account to unlock customer dashboards and quicker checkout.
            </p>
          </div>
          <div className="flex gap-2 rounded-full border border-horizon/30 bg-white/70 p-1 text-xs uppercase tracking-[0.3em]">
            <button
              type="button"
              onClick={() => handleSwitchMode("login")}
              className={clsx(
                "rounded-full px-4 py-2 font-semibold transition",
                mode === "login"
                  ? "bg-horizon text-white shadow-glow"
                  : "text-horizon hover:bg-white/80",
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode("register")}
              className={clsx(
                "rounded-full px-4 py-2 font-semibold transition",
                mode === "register"
                  ? "bg-horizon text-white shadow-glow"
                  : "text-horizon hover:bg-white/80",
              )}
            >
              Register
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-3">
          <button
            type="button"
            onClick={() => {
              void handleSocialSignIn("google")
            }}
            disabled={pending}
            className="flex items-center justify-center gap-3 rounded-full border border-horizon/30 bg-white/80 px-6 py-3 text-sm font-semibold text-midnight transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSocialSignIn("apple")
            }}
            disabled={pending}
            className="flex items-center justify-center gap-3 rounded-full border border-midnight/40 bg-midnight px-6 py-3 text-sm font-semibold text-white transition hover:bg-midnight/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue with Apple
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-midnight/40">
          <span className="h-px flex-1 bg-midnight/20" aria-hidden />
          or
          <span className="h-px flex-1 bg-midnight/20" aria-hidden />
        </div>

        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <Field
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            error={form.formState.errors.email?.message}
            register={form.register}
          />
          {mode === "login" ? (
            <Field
              label="Password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              error={form.formState.errors.password?.message}
              register={form.register}
              renderSuffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-horizon hover:text-midnight"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              }
            />
          ) : null}

          {error ? <p className="text-sm text-ember">{error}</p> : null}

          <button
            type="submit"
            disabled={
              pending ||
              (mode === "register" && (resendCountdown ?? 0) > 0)
            }
            className="mt-4 flex h-12 items-center justify-center rounded-full border border-horizon/50 bg-horizon px-6 font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? "Processing..."
              : mode === "login"
                ? "Sign In"
                : (resendCountdown ?? 0) > 0
                  ? `Resend in ${resendCountdown}s`
                  : magicLinkSent
                    ? "Send Again"
                    : "Email Me a Link"}
          </button>
        </form>

        {mode === "register" ? (
          <div className="mt-6 rounded-2xl border border-horizon/20 bg-white/70 px-4 py-4 text-sm text-midnight/75">
            <p className="font-semibold text-midnight">How it works</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-midnight/80">
              <li>Enter your email and we&apos;ll send a secure one-time sign-in link.</li>
              <li>Open the link to get instant access to your Valley Airporter portal.</li>
              <li>We&apos;ll ask you to set a password right after you arrive.</li>
            </ul>
            <p className="mt-3 text-xs text-midnight/60">
              Please check your junk or spam folder if the email doesn&apos;t arrive in your inbox within a minute.
            </p>
            {magicLinkSent ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-horizon/30 bg-horizon/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-horizon">
                <SendHorizontal className="h-4 w-4" aria-hidden />
                {(resendCountdown ?? 0) > 0
                  ? `Link sent! You can resend in ${resendCountdown}s.`
                  : "Link sent! Check your inbox."}
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassPanel>

      <GlassPanel className="w-full max-w-3xl p-6">
        <h2 className="font-heading text-base uppercase tracking-[0.32em] text-horizon">
          Need Specific Access?
        </h2>
        <p className="mt-3 text-sm text-midnight/75">
          Driver and admin roles are provisioned by Valley Airporter dispatch. Sign in with your
          company email, then contact the operations team to enable driver or admin permissions.
        </p>
      </GlassPanel>
    </div>
  )
}

type FieldProps = {
  label: string
  name: keyof FormValues
  register: UseFormRegister<FormValues>
  error?: string
  renderSuffix?: React.ReactNode
} & InputHTMLAttributes<HTMLInputElement>

const Field = ({ label, name, register, error, renderSuffix, ...inputProps }: FieldProps) => (
  <label className="flex flex-col gap-2">
    <span className="text-xs font-semibold uppercase tracking-[0.3em] text-horizon">
      {label}
    </span>
    <div className="relative">
      <input
        {...register(name)}
        {...inputProps}
        className={clsx(
          "h-12 w-full rounded-2xl border border-horizon/40 bg-white px-4 text-base text-midnight transition",
          renderSuffix ? "pr-12" : "",
          "focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30",
          error && "border-ember/60 focus:ring-ember/30",
        )}
      />
      {renderSuffix}
    </div>
    {error ? <span className="text-xs text-ember">{error}</span> : null}
  </label>
)
