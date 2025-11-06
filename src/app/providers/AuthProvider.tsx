import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  sendSignInLinkToEmail,
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
} from "firebase/auth"
import { FirebaseError } from "firebase/app"
import { useFirebaseServices } from "@/app/providers/FirebaseContext"
import type { AppUserRole, AuthContextValue } from "@/lib/types/auth"
import { env } from "@/lib/config/env"

const defaultRoles: AppUserRole[] = ["guest"]

export const MAGIC_LINK_EMAIL_KEY = "va.magicLinkEmail"
export const MAGIC_LINK_REDIRECT_KEY = "va.magicLinkRedirect"
export const MAGIC_LINK_PASSWORD_REQUIRED_KEY = "va.magicLinkRequirePassword"

const AuthContext = createContext<AuthContextValue | null>(null)

if (import.meta.env.PROD) {
  console.log("Firebase env check →", {
    apiKey: !!env.firebase?.apiKey,
    authDomain: env.firebase?.authDomain,
    projectId: env.firebase?.projectId,
    appId: !!env.firebase?.appId,
    enabled: env.runtime.firebaseEnabled,
  })
}

const deriveRoles = (user: User | null, claimsRoles?: unknown): AppUserRole[] => {
  if (!user) {
    return defaultRoles
  }

  const parsed =
    Array.isArray(claimsRoles) && claimsRoles.every((r) => typeof r === "string")
      ? (claimsRoles as AppUserRole[])
      : undefined

  if (parsed && parsed.length > 0) {
    return parsed
  }

  return ["customer"]
}

const sanitizeRedirectTarget = (raw?: string | null): string | null => {
  if (!raw) return null
  let current = raw
  let safety = 0
  while (current.startsWith("/auth") && safety < 4) {
    const queryIndex = current.indexOf("?")
    if (queryIndex === -1) break
    const params = new URLSearchParams(current.slice(queryIndex + 1))
    const nested = params.get("redirect")
    if (!nested) break
    try {
      current = decodeURIComponent(nested)
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

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const firebase = useFirebaseServices()
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<AppUserRole[]>(defaultRoles)
  const [loading, setLoading] = useState(true)
  const [isEmailVerified, setIsEmailVerified] = useState(false)

  useEffect(() => {
    if (!firebase.enabled || !firebase.auth) {
      setLoading(false)
      setUser(null)
      setRoles(defaultRoles)
      setIsEmailVerified(false)
      return
    }

    const unsubscribe = onAuthStateChanged(firebase.auth, async (fbUser) => {
      setUser(fbUser)
      if (!fbUser) {
        setRoles(defaultRoles)
        setIsEmailVerified(false)
        setLoading(false)
        return
      }

      try {
        const tokenResult = await fbUser.getIdTokenResult(true)
        const claimRoles = tokenResult.claims.roles
        setRoles(deriveRoles(fbUser, claimRoles))
        setIsEmailVerified(fbUser.emailVerified)
      } catch (error) {
        console.error("Failed to fetch custom claims", error)
        setRoles(deriveRoles(fbUser))
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [firebase])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!firebase.enabled || !firebase.auth) {
        throw new Error("Firebase authentication is not configured.")
      }
      await signInWithEmailAndPassword(firebase.auth, email, password)
    },
    [firebase],
  )

  const requestMagicLink = useCallback(
    async (email: string, redirect?: string | null) => {
      if (!firebase.enabled || !firebase.auth) {
        throw new Error("Firebase authentication is not configured.")
      }
      const trimmedEmail = email.trim()
      if (!trimmedEmail) {
        throw new Error("Enter your email address.")
      }
      const safeRedirect = sanitizeRedirectTarget(redirect) ?? "/booking"
      const target = new URL("/auth/magic-link", window.location.origin)
      if (safeRedirect && safeRedirect !== "undefined") {
        target.searchParams.set("redirect", safeRedirect)
      }
      target.searchParams.set("requirePassword", "1")
      const actionCodeSettings = {
        url: target.toString(),
        handleCodeInApp: true,
      }
      await sendSignInLinkToEmail(firebase.auth, trimmedEmail, actionCodeSettings)
      try {
        window.localStorage.setItem(MAGIC_LINK_EMAIL_KEY, trimmedEmail)
        if (safeRedirect && safeRedirect !== "undefined") {
          window.localStorage.setItem(MAGIC_LINK_REDIRECT_KEY, safeRedirect)
        } else {
          window.localStorage.removeItem(MAGIC_LINK_REDIRECT_KEY)
        }
        window.localStorage.setItem(MAGIC_LINK_PASSWORD_REQUIRED_KEY, "true")
      } catch (error) {
        console.warn("Unable to persist magic link metadata", error)
      }
    },
    [firebase],
  )

  const signOut = useCallback(async () => {
    if (!firebase.enabled || !firebase.auth) {
      return
    }
    await firebaseSignOut(firebase.auth)
  }, [firebase])

  const signInWithGoogle = useCallback(async () => {
    if (!firebase.enabled || !firebase.auth) {
      throw new Error("Firebase authentication is not configured.")
    }
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })
    await signInWithPopup(firebase.auth, provider)
  }, [firebase])

  const signInWithApple = useCallback(async () => {
    if (!firebase.enabled || !firebase.auth) {
      throw new Error("Firebase authentication is not configured.")
    }
    const provider = new OAuthProvider("apple.com")
    provider.addScope("email")
    provider.addScope("name")
    await signInWithPopup(firebase.auth, provider)
  }, [firebase])

  const refreshUser = useCallback(async () => {
    if (!firebase.enabled || !firebase.auth) {
      setUser(null)
      setRoles(defaultRoles)
      setIsEmailVerified(false)
      return false
    }
    const current = firebase.auth.currentUser
    if (!current) {
      setUser(null)
      setRoles(defaultRoles)
      setIsEmailVerified(false)
      return false
    }
    await current.reload()
    setUser(current)
    try {
      const tokenResult = await current.getIdTokenResult(true)
      const claimRoles = tokenResult.claims.roles
      setRoles(deriveRoles(current, claimRoles))
      setIsEmailVerified(current.emailVerified)
    } catch (error) {
      console.error("Failed to refresh user claims", error)
      setRoles(deriveRoles(current))
      setIsEmailVerified(current.emailVerified)
    }
    return current.emailVerified
  }, [firebase])

  const linkPassword = useCallback(
    async (password: string) => {
      if (!firebase.enabled || !firebase.auth?.currentUser) {
        throw new Error("You need to be signed in to set a password.")
      }
      const current = firebase.auth.currentUser
      if (!current?.email) {
        throw new Error("Your account is missing an email address.")
      }
      const credential = EmailAuthProvider.credential(current.email, password)
      try {
        await linkWithCredential(current, credential)
      } catch (error) {
        if (error instanceof FirebaseError && error.code === "auth/provider-already-linked") {
          await updatePassword(current, password)
        } else {
          throw error
        }
      }
      try {
        window.localStorage.removeItem(MAGIC_LINK_PASSWORD_REQUIRED_KEY)
      } catch {
        /* noop */
      }
      await refreshUser()
    },
    [firebase, refreshUser],
  )

  const hasPasswordProvider = useMemo(
    () => Boolean(user?.providerData?.some((provider) => provider.providerId === "password")),
    [user],
  )

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      loading,
      roles,
      primaryRole: roles[0] ?? "guest",
      isEmailVerified,
      signIn,
      requestMagicLink,
      signInWithGoogle,
      signInWithApple,
      signOut,
      refreshUser,
      linkPassword,
      hasPasswordProvider,
      hasRole: (role) => {
        const targets = Array.isArray(role) ? role : [role]
        return roles.some((r) => targets.includes(r))
      },
    }),
    [
      user,
      loading,
      roles,
      isEmailVerified,
      signIn,
      requestMagicLink,
      signInWithGoogle,
      signInWithApple,
      signOut,
      refreshUser,
      linkPassword,
      hasPasswordProvider,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider")
  }
  return context
}
