const getEnv = (key: string, fallback?: string) => {
  const raw = import.meta.env[key]
  const value = typeof raw === "string" ? raw.trim() : raw
  if (value === undefined || value === "") {
    if (fallback !== undefined) {
      return fallback
    }
    console.warn(`Environment variable ${key} is not set.`)
    return ""
  }
  return value
}

const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET", ""),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", ""),
  appId: getEnv("VITE_FIREBASE_APP_ID"),
  measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID", ""),
}

export const env = {
  firebase: firebaseConfig,
  integrations: {
    googleCalendarApiKey: getEnv("VITE_GOOGLE_CALENDAR_API_KEY"),
    googleMapsBrowserKey: getEnv("VITE_GOOGLE_MAPS_BROWSER_KEY"),
    squareApplicationId: getEnv("VITE_SQUARE_APPLICATION_ID"),
    squareLocationId: getEnv("VITE_SQUARE_LOCATION_ID"),
    stripePublishableKey: getEnv("VITE_STRIPE_PUBLISHABLE_KEY", ""),
    aviationstackApiKey: getEnv("VITE_AVIATIONSTACK_API_KEY", ""),
  },
  runtime: {
    appEnv: getEnv("VITE_APP_ENV", import.meta.env.PROD ? "production" : "local"),
    appVersion: getEnv("VITE_APP_VERSION", "0.0.0"),
    appName: getEnv("VITE_APP_NAME", "Valley Airporter"),
    appDomain: getEnv("VITE_APP_DOMAIN", ""),
    supportEmail: getEnv("VITE_APP_SUPPORT_EMAIL", ""),
    firebaseEnabled: [
      firebaseConfig.apiKey,
      firebaseConfig.authDomain,
      firebaseConfig.projectId,
      firebaseConfig.appId,
    ].every((value) => Boolean(value)),
  },
} as const

export type AppEnv = typeof env
