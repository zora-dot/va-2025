import { createContext, useContext, useMemo, type PropsWithChildren } from "react"
import { initializeFirebase } from "@/lib/firebase/client"
import type { Auth } from "firebase/auth"
import type { Firestore } from "firebase/firestore"
import type { FirebaseStorage } from "firebase/storage"

export interface FirebaseServices {
  enabled: boolean
  auth: Auth | null
  firestore: Firestore | null
  storage: FirebaseStorage | null
}

const FirebaseContext = createContext<FirebaseServices | null>(null)

export const FirebaseProvider = ({ children }: PropsWithChildren) => {
  const services = useMemo(() => initializeFirebase(), [])

  return (
    <FirebaseContext.Provider value={services}>{children}</FirebaseContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useFirebaseServices = () => {
  const ctx = useContext(FirebaseContext)
  if (!ctx) {
    throw new Error("useFirebaseServices must be used within a FirebaseProvider")
  }
  return ctx
}
