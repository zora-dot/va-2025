import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import type { BookingScope } from "@/features/bookings/types"
import { useAuth } from "@/lib/hooks/useAuth"
import { useFirebase } from "@/lib/hooks/useFirebase"

const normalizeTimestamp = (value: unknown): number | null => {
  if (value == null) return null
  if (typeof value === "number") return value
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    try {
      return (value as { toMillis: () => number }).toMillis()
    } catch {
      return null
    }
  }
  return null
}

export interface SavedBookingView {
  id: string
  name: string
  scope: BookingScope
  status: string
  driver: string
  payment: string
  createdAt?: number | null
  updatedAt?: number | null
}

interface CreateSavedViewInput {
  id?: string
  name: string
  scope: BookingScope
  status: string
  driver: string
  payment: string
}

export const useSavedBookingViews = () => {
  const auth = useAuth()
  const firebase = useFirebase()
  const canPersist = Boolean(firebase.firestore && auth.user?.uid)

  const [views, setViews] = useState<SavedBookingView[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const collectionRef = useMemo(() => {
    if (!canPersist) return null
    return collection(firebase.firestore!, "users", auth.user!.uid, "views")
  }, [auth.user, firebase.firestore, canPersist])

  const refresh = useCallback(async () => {
    if (!collectionRef) {
      setViews([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const snapshot = await getDocs(query(collectionRef, orderBy("createdAt", "asc")))
      const next: SavedBookingView[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        return {
          id: docSnap.id,
          name: typeof data.name === "string" ? data.name : "Saved view",
          scope:
            data.scope === "past" || data.scope === "all" ? (data.scope as BookingScope) : "upcoming",
          status: typeof data.status === "string" ? data.status : "all",
          driver: typeof data.driver === "string" ? data.driver : "all",
          payment: typeof data.payment === "string" ? data.payment : "all",
          createdAt: normalizeTimestamp(data.createdAt),
          updatedAt: normalizeTimestamp(data.updatedAt),
        }
      })
      setViews(next)
    } catch (err) {
      setError(err as Error)
      setViews([])
    } finally {
      setLoading(false)
    }
  }, [collectionRef])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveView = useCallback(
    async (input: CreateSavedViewInput) => {
      if (!collectionRef) {
        throw new Error("Saving views requires Firestore access.")
      }
      const fallbackId = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
      const id =
        input.id ??
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : fallbackId)
      const docRef = doc(collectionRef, id)
      setSaving(true)
      setError(null)
      try {
        const payload: Record<string, unknown> = {
          name: input.name,
          scope: input.scope,
          status: input.status,
          driver: input.driver,
          payment: input.payment,
          updatedAt: serverTimestamp(),
        }
        if (!input.id) {
          payload.createdAt = serverTimestamp()
        }
        await setDoc(
          docRef,
          payload,
          { merge: true },
        )
        await refresh()
        return id
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [collectionRef, refresh],
  )

  const removeView = useCallback(
    async (id: string) => {
      if (!collectionRef) {
        throw new Error("Deleting views requires Firestore access.")
      }
      setSaving(true)
      setError(null)
      try {
        await deleteDoc(doc(collectionRef, id))
        setViews((current) => current.filter((view) => view.id !== id))
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [collectionRef],
  )

  return {
    views,
    loading,
    saving,
    error,
    refresh,
    saveView,
    removeView,
    canPersist,
  }
}
