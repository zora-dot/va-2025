import { env } from "@/lib/config/env"

type GoogleMapsGlobal = typeof google

let mapsPromise: Promise<GoogleMapsGlobal> | null = null

const MAPS_LIBRARIES = ["places"]

const buildScriptUrl = (apiKey: string) => {
  const params = new URLSearchParams({
    key: apiKey,
    libraries: MAPS_LIBRARIES.join(","),
    language: "en",
    region: "CA",
  })
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`
}

export const loadGoogleMaps = (): Promise<GoogleMapsGlobal> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"))
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google)
  }

  if (mapsPromise) {
    return mapsPromise
  }

  const apiKey = env.integrations.googleMapsBrowserKey
  if (!apiKey) {
    return Promise.reject(new Error("Missing Google Maps browser API key"))
  }

  mapsPromise = new Promise<GoogleMapsGlobal>((resolve, reject) => {
    const scriptId = "google-maps-sdk"
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existing) {
      if (window.google?.maps?.places) {
        resolve(window.google)
        return
      }
      const onLoad = () => {
        existing.removeEventListener("load", onLoad)
        existing.removeEventListener("error", onError)
        resolve(window.google)
      }
      const onError = (event: Event) => {
        existing.removeEventListener("load", onLoad)
        existing.removeEventListener("error", onError)
        reject(new Error(`Google Maps failed to load: ${event}`))
      }
      existing.addEventListener("load", onLoad)
      existing.addEventListener("error", onError)
      return
    }

    const script = document.createElement("script")
    script.id = scriptId
    script.src = buildScriptUrl(apiKey)
    script.async = true
    script.defer = true
    script.addEventListener("load", () => resolve(window.google))
    script.addEventListener("error", (event) => reject(new Error(`Google Maps failed to load: ${event}`)))
    document.head.appendChild(script)
  })

  return mapsPromise
}
