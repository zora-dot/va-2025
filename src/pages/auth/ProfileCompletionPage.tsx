import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react"
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { type ConfirmationResult } from "firebase/auth"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { useAuth } from "@/lib/hooks/useAuth"
import { useFirebase } from "@/lib/hooks/useFirebase"
import { useToast } from "@/components/ui/ToastProvider"
import { Loader2, ShieldCheck } from "lucide-react"
import {
  initializePhoneRecaptcha,
  sendPhoneVerificationCode,
  confirmPhoneVerificationCode,
} from "@/lib/firebase/phoneAuth"

const ROLE_OPTIONS = [
  { value: "customer", label: "Customer access" },
  { value: "driver", label: "Driver portal request" },
  { value: "admin", label: "Dispatcher/admin request" },
]

const resolveVerificationErrorMessage = (code: string, fallback: string) => {
  switch (code) {
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
    case "auth/invalid-format":
      return "Enter a valid phone number including area code."
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "You just requested a code. Wait a moment before trying again."
    case "auth/invalid-verification-code":
      return "That code didn't match. Double-check and try again."
    case "auth/code-expired":
    case "auth/session-expired":
      return "That code expired. Request a new one to keep going."
    case "auth/missing-verification-id":
      return "This verification session has expired. Request a new code."
    default:
      return fallback
  }
}

export const ProfileCompletionPage = () => {
  const auth = useAuth()
  const firebase = useFirebase()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }
  const { present } = useToast()

  const [phone, setPhone] = useState("")
  const [profilePhone, setProfilePhone] = useState<string | null>(null)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationStatus, setVerificationStatus] =
    useState<"idle" | "sending" | "sent" | "verifying" | "verified">("idle")
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [roleRequest, setRoleRequest] = useState("customer")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const digitsOnly = useCallback((value: string) => value.replace(/\D/g, ""), [])

  const formatPhoneForAuth = useCallback(
    (value: string): string | null => {
      const trimmed = value.trim()
      if (!trimmed) return null
      if (trimmed.startsWith("+") && digitsOnly(trimmed).length >= 10) {
        return trimmed
      }
      const digits = digitsOnly(trimmed)
      if (digits.length === 11 && digits.startsWith("1")) {
        return `+${digits}`
      }
      if (digits.length === 10) {
        return `+1${digits}`
      }
      return null
    },
    [digitsOnly],
  )

  const redirectTarget = useMemo(() => {
    if (typeof search?.redirect === "string" && search.redirect.trim()) {
      return search.redirect
    }
    if (auth.primaryRole === "admin") return "/portal/admin"
    if (auth.primaryRole === "driver") return "/portal/driver"
    return "/portal/customer"
  }, [auth.primaryRole, search])

  useEffect(() => {
    if (!auth.user) {
      void navigate({
        to: "/auth",
        search: { redirect: redirectTarget },
      })
      return
    }
    if (!firebase.firestore) {
      setLoading(false)
      setError("Firestore unavailable. Try again later.")
      return
    }
    const fetchProfile = async () => {
      setLoading(true)
      setError(null)
      try {
        const ref = doc(firebase.firestore!, "users", auth.user!.uid)
        const snap = await getDoc(ref)
        const data = snap.data() ?? null
        const authPhone = auth.user?.phoneNumber ?? null
        const storedPhone =
          data && typeof data.phone === "string" && data.phone.trim().length > 0
            ? data.phone
            : null
        const incomingPhone = authPhone ?? storedPhone ?? ""

        setPhone(incomingPhone)
        setProfilePhone(storedPhone ?? authPhone ?? null)

        if (data && typeof data.roleRequest === "string") {
          setRoleRequest(data.roleRequest)
        } else {
          setRoleRequest("customer")
        }

        const hasVerifiedPhone = Boolean(authPhone)
        setPhoneVerified(hasVerifiedPhone)
        setVerificationStatus(hasVerifiedPhone ? "verified" : "idle")
        setConfirmationResult(null)
        setVerificationCode("")
        setVerificationError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load profile.")
      } finally {
        setLoading(false)
      }
    }
    void fetchProfile()
  }, [auth.user, firebase.firestore, navigate, redirectTarget])

  useEffect(() => {
    if (!auth.user) return
    if (typeof window === "undefined") return
    try {
      initializePhoneRecaptcha("recaptcha-container")
    } catch (err) {
      console.warn("Unable to initialize phone reCAPTCHA", err)
    }
  }, [auth.user])

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setPhone(value)
    setVerificationError(null)
    const normalizedValue = digitsOnly(value)
    const authPhoneDigits = auth.user?.phoneNumber ? digitsOnly(auth.user.phoneNumber) : ""
    const storedDigits = profilePhone ? digitsOnly(profilePhone) : ""
    const matchesVerified =
      Boolean(phoneVerified) &&
      ((authPhoneDigits && normalizedValue === authPhoneDigits) ||
        (storedDigits && normalizedValue === storedDigits))

    if (matchesVerified) {
      setVerificationStatus("verified")
      return
    }

    setPhoneVerified(false)
    setVerificationStatus("idle")
    setConfirmationResult(null)
    setVerificationCode("")
  }

  const handleSendVerification = async () => {
    if (!auth.user) {
      setError("Authentication required.")
      return
    }
    if (!phone.trim()) {
      setVerificationError("Add a phone number before requesting a code.")
      return
    }
    const normalizedForAuth = formatPhoneForAuth(phone)
    if (!normalizedForAuth) {
      setVerificationError("Enter a valid phone number including area code.")
      return
    }
    setVerificationError(null)
    setVerificationStatus("sending")
    try {
      initializePhoneRecaptcha("recaptcha-container")
      const confirmation = await sendPhoneVerificationCode(normalizedForAuth, "recaptcha-container")
      setConfirmationResult(confirmation)
      setPhoneVerified(false)
      setVerificationCode("")
      setVerificationStatus("sent")
      present({
        title: "Verification code sent",
        description: "We texted you a 6-digit code. Enter it below to confirm your number.",
        tone: "info",
      })
      setError(null)
    } catch (err) {
      const defaultMessage = "We couldn't send a verification code right now. Try again shortly."
      const code =
        err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : ""
      const message = resolveVerificationErrorMessage(code, defaultMessage)
      setVerificationError(message)
      setVerificationStatus("idle")
    }
  }

  const handleVerifyCode = async () => {
    if (!confirmationResult) {
      setVerificationError("Request a code before attempting verification.")
      return
    }
    const sanitized = verificationCode.replace(/\D/g, "")
    if (sanitized.length !== 6) {
      setVerificationError("Enter the 6-digit verification code we sent.")
      return
    }
    setVerificationError(null)
    setVerificationStatus("verifying")
    try {
      const user = await confirmPhoneVerificationCode(confirmationResult, sanitized)
      const confirmedPhone = user.phoneNumber ?? phone
      setPhone(confirmedPhone ?? "")
      setProfilePhone(confirmedPhone ?? "")
      await auth.refreshUser()
      setPhoneVerified(Boolean(user.phoneNumber ?? auth.user?.phoneNumber))
      setVerificationStatus("verified")
      setConfirmationResult(null)
      setVerificationCode("")
      present({
        title: "Phone verified",
        description: "Thanks! You're all set to continue.",
        tone: "success",
      })
      setError(null)
    } catch (err) {
      const defaultMessage = "We couldn't verify that code. Request a new one and try again."
      const code =
        err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : ""
      const message = resolveVerificationErrorMessage(code, defaultMessage)
      setVerificationError(message)
      setVerificationStatus(code === "auth/invalid-verification-code" ? "sent" : "idle")
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!auth.user || !firebase.firestore) {
      setError("Authentication required.")
      return
    }
    if (!phone.trim()) {
      setError("Add a contact phone number.")
      return
    }
    if (!phoneVerified) {
      setError("Verify your phone number before continuing.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const ref = doc(firebase.firestore, "users", auth.user.uid)
      const timestamp = serverTimestamp()
      const payload: Record<string, unknown> = {
        phone: phone.trim(),
        roleRequest,
        updatedAt: timestamp,
      }
      if (phoneVerified) {
        payload.phoneVerified = true
        payload.phoneVerifiedAt = timestamp
      }
      await setDoc(ref, payload, { merge: true })
      present({
        title: "Profile updated",
        description: "Thanks! We'll use this info to tailor your portal access.",
        tone: "success",
      })
      navigate({ to: redirectTarget as never })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile right now.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 pb-16">
      <div id="recaptcha-container" className="hidden" aria-hidden="true" />
      <GlassPanel className="w-full max-w-2xl p-8">
        <p className="font-heading text-xs uppercase tracking-[0.35em] text-horizon/80">
          Almost there
        </p>
        <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
          Finish your profile
        </h1>
        <p className="mt-3 text-sm text-midnight/75">
          We just need a contact number and your preferred access level so dispatch knows where to route you.
        </p>
        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 flex items-center gap-3 text-sm text-midnight/60">
            <Loader2 className="h-4 w-4 animate-spin text-horizon" aria-hidden />
            Loading your profile...
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
              Contact phone
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="604-555-0199"
                  className="rounded-2xl border border-horizon/30 px-3 py-3 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30 sm:flex-1"
                />
                {phoneVerified ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    Verified
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSendVerification()
                    }}
                    className="va-button va-button--secondary w-full justify-center px-5 py-3 sm:w-auto"
                    disabled={verificationStatus === "sending" || verificationStatus === "verifying"}
                  >
                    {verificationStatus === "sending" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Sending...
                      </>
                    ) : verificationStatus === "sent" ? (
                      "Resend code"
                    ) : (
                      "Send code"
                    )}
                  </button>
                )}
              </div>
            </label>

            {phoneVerified ? (
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-emerald-600">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Phone verified on file
              </div>
            ) : (
              <div className="rounded-2xl border border-horizon/20 bg-white/60 px-4 py-3 text-sm text-midnight/75">
                {verificationStatus === "sent" || verificationStatus === "verifying"
                  ? "Enter the 6-digit code we just texted to confirm your number."
                  : "We'll text you a one-time code to confirm this number before unlocking the dashboard."}
              </div>
            )}

            {verificationError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {verificationError}
              </div>
            ) : null}

            {!phoneVerified && confirmationResult ? (
              <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
                Verification code
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "").slice(0, 6)
                      setVerificationCode(digits)
                      setVerificationError(null)
                    }}
                    placeholder="123456"
                    className="rounded-2xl border border-horizon/30 px-3 py-3 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30 sm:flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleVerifyCode()
                    }}
                    className="va-button va-button--primary w-full justify-center px-5 py-3 sm:w-auto"
                    disabled={verificationStatus === "verifying"}
                  >
                    {verificationStatus === "verifying" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Verifying...
                      </>
                    ) : (
                      "Verify code"
                    )}
                  </button>
                </div>
                <p className="mt-2 text-[0.65rem] uppercase tracking-[0.25em] text-midnight/50">
                  Codes expire a few minutes after they're sent. Request a new one if it stops working.
                </p>
              </label>
            ) : null}

            <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-midnight/60">
              Portal access request
              <select
                value={roleRequest}
                onChange={(event) => setRoleRequest(event.target.value)}
                className="mt-2 rounded-2xl border border-horizon/30 px-3 py-3 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="va-button va-button--primary w-full justify-center px-6 py-3"
              disabled={saving || !phoneVerified}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Saving...
                </>
              ) : phoneVerified ? (
                "Save and continue"
              ) : (
                "Verify phone to continue"
              )}
            </button>
          </form>
        )}
      </GlassPanel>
    </div>
  )
}
