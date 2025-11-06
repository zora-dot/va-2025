// Fixed: only connect emulators when running locally; never in production on a real domain.
import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";
import { env } from "@/lib/config/env";

let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let hasConnectedEmulators = false;

export const initializeFirebase = () => {
  // If the required web config isn't present, bail out gracefully.
  if (!env.runtime.firebaseEnabled) {
    console.warn("Firebase configuration missing. Running in offline/mock mode.");
    return {
      enabled: false,
      auth: null as Auth | null,
      firestore: null as Firestore | null,
      storage: null as FirebaseStorage | null,
    };
  }

  // Initialize (idempotent).
  const app = getApps().length ? getApp() : initializeApp(env.firebase);

  if (!authInstance) authInstance = getAuth(app);
  if (!firestoreInstance) firestoreInstance = getFirestore(app);

  // Create Storage instance if possible (bucket optional).
  if (!storageInstance) {
    try {
      storageInstance = getStorage(app);
    } catch {
      storageInstance = null;
    }
  }

  // Determine if we should connect to local emulators.
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.endsWith(".local"));

  // Use emulators ONLY when developing locally.
  const shouldUseEmulators =
    (import.meta.env.DEV || env.runtime.appEnv === "local" || isLocalHost) && !hasConnectedEmulators;

  if (shouldUseEmulators) {
    try {
      if (authInstance) {
        connectAuthEmulator(authInstance, "http://localhost:9099", { disableWarnings: true });
      }
      if (firestoreInstance) {
        connectFirestoreEmulator(firestoreInstance, "localhost", 8080);
      }
      if (storageInstance) {
        connectStorageEmulator(storageInstance, "localhost", 9199);
      }
      hasConnectedEmulators = true;
    } catch (e) {
      console.warn("Skipping emulator connection:", e);
    }
  }

  return {
    enabled: true,
    auth: authInstance,
    firestore: firestoreInstance,
    storage: storageInstance,
  };
};
