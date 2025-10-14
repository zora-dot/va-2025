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
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"
import { useFirebaseServices } from "@/app/providers/FirebaseContext"
import type { AppUserRole, AuthContextValue } from "@/lib/types/auth"

const defaultRoles: AppUserRole[] = ["guest"]

const AuthContext = createContext<AuthContextValue | null>(null)

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

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!firebase.enabled || !firebase.auth) {
        throw new Error("Firebase authentication is not configured.")
      }
      const credential = await createUserWithEmailAndPassword(firebase.auth, email, password)
      await sendEmailVerification(credential.user)
    },
    [firebase],
  )

  const signOut = useCallback(async () => {
    if (!firebase.enabled || !firebase.auth) {
      return
    }
    await firebaseSignOut(firebase.auth)
  }, [firebase])

  const sendVerificationEmail = useCallback(async () => {
    if (!firebase.enabled || !firebase.auth?.currentUser) return
    await sendEmailVerification(firebase.auth.currentUser, {
      url: window.location.origin,
      handleCodeInApp: true,
    })
  }, [firebase])

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      loading,
      roles,
      primaryRole: roles[0] ?? "guest",
      isEmailVerified,
      signIn,
      signUp,
      signOut,
      sendVerificationEmail,
      hasRole: (role) => {
        const targets = Array.isArray(role) ? role : [role]
        return roles.some((r) => targets.includes(r))
      },
    }),
    [user, loading, roles, isEmailVerified, signIn, signUp, signOut, sendVerificationEmail],
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
