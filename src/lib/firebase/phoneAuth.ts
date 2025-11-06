import { getAuth, RecaptchaVerifier, linkWithPhoneNumber, type ConfirmationResult, type User } from "firebase/auth"

let verifier: RecaptchaVerifier | null = null
let containerId = "recaptcha-container"

const getCurrentUser = (): User => {
  const auth = getAuth()
  const current = auth.currentUser
  if (!current) {
    throw new Error("You need to be signed in to verify a phone number.")
  }
  return current
}

export const initializePhoneRecaptcha = (container: string = "recaptcha-container") => {
  const auth = getAuth()
  if (verifier && containerId === container) {
    return verifier
  }
  containerId = container
  if (verifier) {
    verifier.clear()
  }
  verifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
  })
  return verifier
}

const normalizeToE164 = (phone: string): string => {
  const trimmed = phone.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("+")) {
    return `+${trimmed.replace(/\D/g, "")}`
  }
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length === 10) {
    return `+1${digits}`
  }
  if (digits.length > 10 && digits.startsWith("1")) {
    return `+${digits}`
  }
  return `+${digits}`
}

export const sendPhoneVerificationCode = async (rawPhone: string, container?: string) => {
  const phone = normalizeToE164(rawPhone)
  if (!phone || phone.length < 11) {
    throw new Error("Enter a valid phone number including area code.")
  }
  const user = getCurrentUser()
  const auth = getAuth()
  const recaptcha = initializePhoneRecaptcha(container)
  return await linkWithPhoneNumber(user, phone, recaptcha)
}

export const confirmPhoneVerificationCode = async (
  confirmation: ConfirmationResult,
  code: string,
) => {
  const trimmed = code.trim()
  if (!/^\d{6}$/.test(trimmed)) {
    throw new Error("Enter the 6-digit code we sent you.")
  }
  const credential = await confirmation.confirm(trimmed)
  await credential.user.reload()
  return credential.user
}

