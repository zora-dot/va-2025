import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye, EyeOff, Loader2, Lock } from "lucide-react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { useAuth } from "@/lib/hooks/useAuth"
import { useToast } from "@/components/ui/ToastProvider"
import { MAGIC_LINK_PASSWORD_REQUIRED_KEY } from "@/app/providers/AuthProvider"

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters for security."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  })

type FormValues = z.infer<typeof schema>

export const SetPasswordPage = () => {
  const auth = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string; requirePassword?: string }
  const { present } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [requirePassword, setRequirePassword] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      return (
        window.localStorage.getItem(MAGIC_LINK_PASSWORD_REQUIRED_KEY) === "true" ||
        search?.requirePassword === "1"
      )
    } catch {
      return false
    }
  })

  const redirectTarget = useMemo(() => {
    if (typeof search?.redirect === "string" && search.redirect.trim()) {
      return search.redirect
    }
    if (auth.primaryRole === "admin") return "/portal/admin"
    if (auth.primaryRole === "driver") return "/portal/driver"
    return "/portal/customer"
  }, [auth.primaryRole, search])

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        setRequirePassword(
          window.localStorage.getItem(MAGIC_LINK_PASSWORD_REQUIRED_KEY) === "true" ||
            search?.requirePassword === "1",
        )
      } catch {
        setRequirePassword(false)
      }
    }
    if (auth.loading) return
    if (!auth.user) {
      navigate({
        to: "/auth",
        search: { redirect: `/auth/set-password?redirect=${encodeURIComponent(redirectTarget)}` } as never,
      })
      return
    }
    const mustStay = requirePassword || search?.requirePassword === "1" || !auth.hasPasswordProvider
    if (!mustStay) {
      navigate({ to: redirectTarget as never })
    }
  }, [
    auth.loading,
    auth.user,
    auth.hasPasswordProvider,
    navigate,
    redirectTarget,
    requirePassword,
  ])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      await auth.linkPassword(values.password)
      present({
        title: "Password saved",
        description: "You can now sign in with your email and password anytime.",
        tone: "success",
      })
      setRequirePassword(false)
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(MAGIC_LINK_PASSWORD_REQUIRED_KEY)
        }
      } catch {
        /* noop */
      }
      navigate({ to: redirectTarget as never })
    } catch (err) {
      form.setError(
        "password",
        { message: err instanceof Error ? err.message : "Unable to set password right now." },
        { shouldFocus: true },
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <div className="flex flex-col items-center gap-8 pb-16">
      <GlassPanel className="w-full max-w-2xl p-8">
        <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/80">
          Secure your account
        </p>
        <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
          Create your password
        </h1>
        <p className="mt-3 text-sm text-midnight/75">
          Choose a password you&apos;ll use for future sign-ins. You can still request a magic link
          anytime if you forget it.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
            Password
            <div className="relative mt-2">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a secure password"
                {...form.register("password")}
                className="w-full rounded-2xl border border-horizon/30 px-3 py-3 pr-12 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-horizon hover:text-midnight"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
              </button>
            </div>
          </label>
          {form.formState.errors.password ? (
            <p className="text-sm text-ember">{form.formState.errors.password.message}</p>
          ) : null}
          <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
            Confirm password
            <div className="relative mt-2">
              <input
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Re-enter password"
                {...form.register("confirmPassword")}
                className="w-full rounded-2xl border border-horizon/30 px-3 py-3 pr-12 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-horizon hover:text-midnight"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden />
                )}
              </button>
            </div>
          </label>
          {form.formState.errors.confirmPassword ? (
            <p className="text-sm text-ember">{form.formState.errors.confirmPassword.message}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="va-button va-button--primary inline-flex w-full justify-center px-6 py-3"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" aria-hidden />
                Save password
              </>
            )}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-horizon/20 bg-white/70 px-4 py-4 text-sm text-midnight/75">
          <p className="font-semibold text-midnight">Need help?</p>
          <p className="mt-2">
            If you close this window before setting a password, you can always request another magic
            link from the sign-in page.
          </p>
        </div>
      </GlassPanel>
    </div>
  )
}
