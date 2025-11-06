const API_BASE = "https://places.googleapis.com/v1"

export type NewSuggestion = {
  placeId: string
  primaryText: string
  secondaryText?: string
}

export type NewPlace = {
  id: string
  formattedAddress: string
  location?: { latitude: number; longitude: number }
}

function browserKey(): string {
  const k = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined
  if (!k) throw new Error("Missing VITE_GOOGLE_MAPS_BROWSER_KEY")
  return k
}

export async function placesAutocompleteNew(params: {
  input: string
  sessionToken: string
  regionCode?: "CA" | "US"
  languageCode?: string
  // Optional bias (strongly recommended for short numeric inputs)
  biasCenter?: { lat: number; lng: number }
  biasRadiusMeters?: number
}): Promise<NewSuggestion[]> {
  const body: any = {
    input: params.input,
    languageCode: params.languageCode ?? "en",
    regionCode: params.regionCode ?? "CA",
  }

  if (params.biasCenter && params.biasRadiusMeters) {
    body.locationBias = {
      circle: {
        center: { latitude: params.biasCenter.lat, longitude: params.biasCenter.lng },
        radius: params.biasRadiusMeters,
      },
    }
  }

  const res = await fetch(`${API_BASE}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": browserKey(),
      // Minimizes payloads; we only need text + placeId
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
      "X-Goog-Session-Token": params.sessionToken,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Autocomplete (New) failed: ${res.status} ${t}`)
  }

  const data = await res.json()
  const suggestions: NewSuggestion[] = (data.suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => ({
      placeId: p.placeId,
      primaryText: p.text?.primaryText ?? "",
      secondaryText: p.text?.secondaryText ?? "",
    }))

  return suggestions
}

export async function placeDetailsNew(params: {
  placeId: string
  sessionToken: string // same token as autocomplete; rotate after a selection
}): Promise<NewPlace> {
  const url = `${API_BASE}/places/${encodeURIComponent(params.placeId)}?key=${browserKey()}`

  const res = await fetch(url, {
    headers: {
      // Ask only for what we need
      "X-Goog-FieldMask": "id,formattedAddress,location",
      "X-Goog-Session-Token": params.sessionToken,
    },
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Place details (New) failed: ${res.status} ${t}`)
  }

  const p = await res.json()
  return {
    id: p.id,
    formattedAddress: p.formattedAddress ?? "",
    location: p.location
      ? { latitude: p.location.latitude, longitude: p.location.longitude }
      : undefined,
  }
}

// Simple token: new token per typing session, rotate after selection.
export function newSessionToken(): string {
  return crypto.randomUUID()
}
