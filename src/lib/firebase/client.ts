import { initializeApp, getApps } from "firebase/app"
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from "firebase/auth"
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore"
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage"
import { env } from "@/lib/config/env"

let authInstance: Auth | null = null
let firestoreInstance: Firestore | null = null
let storageInstance: FirebaseStorage | null = null
let hasConnectedEmulators = false

export const initializeFirebase = () => {
  if (!env.runtime.firebaseEnabled) {
    console.warn("Firebase configuration missing. Running in offline/mock mode.")
    return {
      enabled: false,
      auth: null as Auth | null,
      firestore: null as Firestore | null,
      storage: null as FirebaseStorage | null,
    }
  }

  if (!getApps().length) {
    initializeApp(env.firebase)
  }

  if (!authInstance) {
    authInstance = getAuth()
  }

  if (!firestoreInstance) {
    firestoreInstance = getFirestore()
  }

  if (!storageInstance && env.firebase.storageBucket) {
    storageInstance = getStorage()
  }

  if (env.runtime.appEnv === "local" && !hasConnectedEmulators) {
    if (authInstance) {
      connectAuthEmulator(authInstance, "http://localhost:9099", { disableWarnings: true })
    }
    if (firestoreInstance) {
      connectFirestoreEmulator(firestoreInstance, "localhost", 8080)
    }
    if (storageInstance) {
      connectStorageEmulator(storageInstance, "localhost", 9199)
    }
    hasConnectedEmulators = true
  }

  return {
    enabled: true,
    auth: authInstance,
    firestore: firestoreInstance,
    storage: storageInstance,
  }
}
