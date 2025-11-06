import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { useAuth } from "@/lib/hooks/useAuth"
import { useFirebase } from "@/lib/hooks/useFirebase"

export interface UserProfile {
  phone?: string | null
  roleRequest?: string | null
  [key: string]: unknown
}

export const useUserProfile = (enabled: boolean = true) => {
  const auth = useAuth()
  const firebase = useFirebase()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(Boolean(enabled))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!enabled) {
      setProfile(null)
      setLoading(false)
      setError(null)
      return
    }
    if (!firebase.firestore || !auth.user) {
      setProfile(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const ref = doc(firebase.firestore, "users", auth.user.uid)
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setProfile((snapshot.data() as UserProfile | undefined) ?? null)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setProfile(null)
        setLoading(false)
      },
    )
    return () => unsubscribe()
  }, [auth.user, enabled, firebase.firestore])

  return { profile, loading, error }
}
