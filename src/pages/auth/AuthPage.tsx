import { useState, type InputHTMLAttributes } from "react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { z, type ZodType } from "zod"
import { useForm, type UseFormRegister } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuth } from "@/lib/hooks/useAuth"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { clsx } from "clsx"
import { Eye, EyeOff } from "lucide-react"

const baseSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type FormValues = z.infer<typeof baseSchema> & { confirmPassword?: string }

const loginSchema: ZodType<FormValues> = baseSchema.extend({
  confirmPassword: z.string().optional(),
})

const registerSchema: ZodType<FormValues> = baseSchema
  .extend({
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  })

type AuthMode = "login" | "register"

export const AuthPage = () => {
  const [mode, setMode] = useState<AuthMode>("login")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const auth = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string | string[] }

  const schema = mode === "login" ? loginSchema : registerSchema

  const form = useForm<FormValues>({
    // zodResolver typing struggles with dynamic schemas; safe to cast here for now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as never) as any,
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const handleSwitchMode = (nextMode: AuthMode) => {
    if (nextMode !== mode) {
      setMode(nextMode)
      setError(null)
      form.reset()
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true)
    setError(null)
    try {
      if (mode === "login") {
        await auth.signIn(values.email, values.password)
      } else {
        await auth.signUp(values.email, values.password)
      }
      const rawRedirect = search?.redirect
      let next: string | undefined
      if (typeof rawRedirect === "string" && rawRedirect.trim()) {
        next = rawRedirect
      } else if (Array.isArray(rawRedirect)) {
        next = rawRedirect.find(Boolean)
      }

      if (!next) {
        if (auth.primaryRole === "admin") {
          next = "/portal/admin"
        } else if (auth.primaryRole === "driver") {
          next = "/portal/driver"
        } else {
          next = "/portal/customer"
        }
      }

      if (next.startsWith("http")) {
        window.location.assign(next)
      } else {
        navigate({ to: next as unknown as never })
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "There was an issue processing your request.",
      )
    } finally {
      setPending(false)
    }
  })

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

        <form className="mt-8 grid gap-4" onSubmit={onSubmit}>
          <Field
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            error={form.formState.errors.email?.message}
            register={form.register}
          />
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
          {mode === "register" ? (
            <Field
              label="Confirm Password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              error={form.formState.errors.confirmPassword?.message}
              register={form.register}
              renderSuffix={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-horizon hover:text-midnight"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              }
            />
          ) : null}

          {error ? <p className="text-sm text-ember">{error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-4 flex h-12 items-center justify-center rounded-full border border-horizon/50 bg-horizon px-6 font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Processing..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {mode === "login" && !auth.isEmailVerified && auth.user ? (
          <div className="mt-6 rounded-2xl border border-sunrise/60 bg-sunrise/40 p-4 text-sm text-midnight/80">
            <p className="font-semibold text-midnight">Verify your email</p>
            <p className="mt-2">
              We&apos;ve sent a verification link to <strong>{auth.user.email}</strong>. Once
              verified, refresh or sign in again to access all features.
            </p>
            <button
              type="button"
              onClick={async () => {
                setPending(true)
                try {
                  await auth.sendVerificationEmail()
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Unable to send verification email right now.",
                  )
                } finally {
                  setPending(false)
                }
              }}
              className="mt-3 inline-flex items-center justify-center rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-horizon transition hover:bg-white"
            >
              Resend Verification
            </button>
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
