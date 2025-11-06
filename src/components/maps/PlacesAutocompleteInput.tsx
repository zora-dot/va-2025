import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ChangeEventHandler,
  FocusEventHandler,
  InputHTMLAttributes,
  KeyboardEventHandler,
} from "react"
import { clsx } from "clsx"
import { loadGoogleMaps } from "@/lib/maps/loadGoogleMaps"
import { placesAutocompleteNew, placeDetailsNew, newSessionToken } from "@/lib/places/placesNew"

export interface PlaceSelection {
  address: string
  placeId?: string
  location?: google.maps.LatLngLiteral | null
}

interface PlacesAutocompleteInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string
  onChange: (value: string) => void
  onPlaceSelect?: (selection: PlaceSelection) => void
  onPlaceCleared?: () => void
  helperText?: string
}

type Prediction = google.maps.places.AutocompletePrediction

const COUNTRY_RESTRICTIONS: google.maps.places.ComponentRestrictions = {
  country: ["ca", "us"],
}

const PLACE_FIELDS: (keyof google.maps.places.PlaceResult)[] = [
  "formatted_address",
  "geometry",
  "place_id",
]

const RESULTS_DEBOUNCE_MS = 180

export const PlacesAutocompleteInput = ({
  value,
  onChange,
  onPlaceSelect,
  onPlaceCleared,
  className,
  helperText,
  disabled,
  placeholder,
  ...rest
}: PlacesAutocompleteInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const googleRef = useRef<typeof google | null>(null)
  const autoServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const usingLegacyRef = useRef(false)
  const legacySessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const sessionTokenRef = useRef<string>(newSessionToken())
  const predictionTimeoutRef = useRef<number | null>(null)

  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [dropdownVisible, setDropdownVisible] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [noResults, setNoResults] = useState(false)
  const [mapsLoading, setMapsLoading] = useState(false)
  const [mapsLoadError, setMapsLoadError] = useState<string | null>(null)

  const latestOnPlaceSelect = useRef(onPlaceSelect)
  const latestOnPlaceCleared = useRef(onPlaceCleared)

  useEffect(() => {
    latestOnPlaceSelect.current = onPlaceSelect
    latestOnPlaceCleared.current = onPlaceCleared
  }, [onPlaceCleared, onPlaceSelect])

  useEffect(() => {
    return () => {
      if (predictionTimeoutRef.current) {
        window.clearTimeout(predictionTimeoutRef.current)
        predictionTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!value?.trim()) {
      setPredictions([])
      setDropdownVisible(false)
      setActiveIndex(-1)
      latestOnPlaceCleared.current?.()
    }
  }, [value])

  const ensureLegacyServices = useCallback(async () => {
    if (autoServiceRef.current && placesServiceRef.current && googleRef.current) {
      return true
    }
    try {
      setMapsLoading(true)
      const google = await loadGoogleMaps()
      googleRef.current = google
      autoServiceRef.current = new google.maps.places.AutocompleteService()
      placesServiceRef.current = new google.maps.places.PlacesService(document.createElement("div"))
      setMapsLoadError(null)
      return true
    } catch (error) {
      console.warn("[PlacesAutocomplete] legacy fallback failed to load Maps JS", error)
      setMapsLoadError(error instanceof Error ? error.message : "Google Maps failed to load")
      return false
    } finally {
      setMapsLoading(false)
    }
  }, [])

  const legacyAutocomplete = useCallback(
    async (inputValue: string): Promise<Prediction[]> => {
      const ready = await ensureLegacyServices()
      if (!ready) return []

      const google = googleRef.current
      const service = autoServiceRef.current
      if (!google || !service) return []

      const token = new google.maps.places.AutocompleteSessionToken()
      legacySessionTokenRef.current = token

      return new Promise<Prediction[]>((resolve) => {
        service.getPlacePredictions(
          {
            input: inputValue,
            componentRestrictions: COUNTRY_RESTRICTIONS,
            sessionToken: token,
          },
          (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
              resolve(results)
            } else {
              resolve([])
            }
          },
        )
      })
    },
    [ensureLegacyServices],
  )

  const legacyPlaceDetails = useCallback(
    async (prediction: Prediction): Promise<PlaceSelection | null> => {
      const ready = await ensureLegacyServices()
      if (!ready || !prediction.place_id) return null

      const google = googleRef.current
      const placesService = placesServiceRef.current
      if (!google || !placesService) return null

      return new Promise<PlaceSelection | null>((resolve) => {
        placesService.getDetails(
          {
            placeId: prediction.place_id,
            fields: PLACE_FIELDS,
            sessionToken: legacySessionTokenRef.current ?? undefined,
          },
          (place, status) => {
            legacySessionTokenRef.current = null
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
              resolve(null)
              return
            }

            const formatted = place.formatted_address ?? prediction.description
            const geometry = place.geometry?.location
            const location =
              geometry && typeof geometry.lat === "function" && typeof geometry.lng === "function"
                ? { lat: geometry.lat(), lng: geometry.lng() }
                : null

            resolve({
              address: formatted,
              placeId: place.place_id ?? prediction.place_id ?? undefined,
              location,
            })
          },
        )
      })
    },
    [ensureLegacyServices],
  )

  const requestPredictions = useCallback(
    async (inputValue: string) => {
      try {
        const results = await placesAutocompleteNew({
          input: inputValue,
          sessionToken: sessionTokenRef.current,
          regionCode: "CA",
          languageCode: "en",
          biasCenter: { lat: 49.0504, lng: -122.3045 },
          biasRadiusMeters: 60_000,
        })

        if (results.length) {
          setPredictions(
            results.map((r) => ({
              description: `${r.primaryText}${r.secondaryText ? ", " + r.secondaryText : ""}`,
              place_id: r.placeId,
              structured_formatting: {
                main_text: r.primaryText,
                secondary_text: r.secondaryText ?? "",
              },
            })) as unknown as Prediction[],
          )
          usingLegacyRef.current = false
          setMapsLoadError(null)
          setDropdownVisible(true)
          setActiveIndex(-1)
          setNoResults(false)
        } else {
          setPredictions([])
          usingLegacyRef.current = false
          setMapsLoadError(null)
          setDropdownVisible(Boolean(inputValue.trim()))
          setActiveIndex(-1)
          setNoResults(Boolean(inputValue.trim()))
        }
      } catch (err) {
        console.warn("[PlacesAutocomplete] (New) autocomplete failed", err)
        const legacyResults = await legacyAutocomplete(inputValue)
        if (legacyResults.length) {
          usingLegacyRef.current = true
          setPredictions(legacyResults)
          setDropdownVisible(true)
          setActiveIndex(-1)
          setNoResults(false)
        } else {
          usingLegacyRef.current = false
          setPredictions([])
          setDropdownVisible(Boolean(inputValue.trim()))
          setActiveIndex(-1)
          setNoResults(Boolean(inputValue.trim()))
        }
      }
    },
    [legacyAutocomplete],
  )

  const schedulePredictions = (inputValue: string) => {
    if (predictionTimeoutRef.current) {
      window.clearTimeout(predictionTimeoutRef.current)
    }
    if (!inputValue.trim()) {
      setPredictions([])
      setDropdownVisible(false)
      setActiveIndex(-1)
      setNoResults(false)
      return
    }

    predictionTimeoutRef.current = window.setTimeout(() => {
      void requestPredictions(inputValue)
      predictionTimeoutRef.current = null
    }, RESULTS_DEBOUNCE_MS)
  }

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const next = event.target.value
    onChange(next)
    schedulePredictions(next)
  }

  const handlePredictionSelect = useCallback(
    async (prediction: Prediction) => {
      onChange(prediction.description)
      setPredictions([])
      setDropdownVisible(false)
      setActiveIndex(-1)
      setNoResults(false)

      if (!prediction.place_id) {
        latestOnPlaceSelect.current?.({ address: prediction.description, placeId: undefined })
        sessionTokenRef.current = newSessionToken()
        return
      }

      let selection: PlaceSelection | null = null

      if (!usingLegacyRef.current) {
        try {
          const place = await placeDetailsNew({
            placeId: prediction.place_id,
            sessionToken: sessionTokenRef.current,
          })

          selection = {
            address: place.formattedAddress || prediction.description,
            placeId: prediction.place_id,
            location: place.location
              ? { lat: place.location.latitude, lng: place.location.longitude }
              : null,
          }
        } catch (error) {
          console.warn("[PlacesAutocomplete] (New) details failed", error)
        }
      }

      if (!selection) {
        selection = await legacyPlaceDetails(prediction)
      }

      if (!selection) {
        selection = {
          address: prediction.description,
          placeId: prediction.place_id ?? undefined,
        }
      }

      latestOnPlaceSelect.current?.(selection)
      sessionTokenRef.current = newSessionToken()
    },
    [legacyPlaceDetails, onChange],
  )

  const handleFocus: FocusEventHandler<HTMLInputElement> = () => {
    if (predictions.length > 0) {
      setDropdownVisible(true)
    }
  }

  const handleBlur: FocusEventHandler<HTMLInputElement> = () => {
    // Delay closing so click handlers can run
    window.setTimeout(() => setDropdownVisible(false), 150)
  }

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (!dropdownVisible || predictions.length === 0) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((prev) => {
        const next = prev + 1
        if (next >= predictions.length) return 0
        return next
      })
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((prev) => {
        const next = prev - 1
        if (next < 0) return predictions.length - 1
        return next
      })
    } else if (event.key === "Enter") {
      event.preventDefault()
      const prediction = predictions[activeIndex >= 0 ? activeIndex : 0]
      if (prediction) {
        void handlePredictionSelect(prediction)
      }
    } else if (event.key === "Escape") {
      event.preventDefault()
      setDropdownVisible(false)
    }
  }

  return (
    <div className={clsx("w-full space-y-1", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={clsx(
            "h-12 w-full rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30 disabled:cursor-not-allowed disabled:bg-white/50",
          )}
          disabled={disabled}
          autoComplete="off"
          {...rest}
        />

        {dropdownVisible && (predictions.length > 0 || noResults) ? (
          <ul
            role="listbox"
            className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-horizon/20 bg-white/95 py-2 shadow-xl backdrop-blur"
          >
            {predictions.length > 0 ? (
              predictions.map((prediction, index) => {
                const isActive = index === activeIndex
                const primary = prediction.structured_formatting?.main_text ?? prediction.description
                const secondary = prediction.structured_formatting?.secondary_text ?? ""

                return (
                  <li
                    key={prediction.place_id ?? prediction.description}
                    role="option"
                    aria-selected={isActive}
                    className={clsx(
                      "cursor-pointer px-4 py-2 text-sm transition",
                      isActive ? "bg-horizon/10 text-midnight" : "text-midnight/90 hover:bg-horizon/10",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      void handlePredictionSelect(prediction)
                    }}
                  >
                    <div className="font-medium">{primary}</div>
                    {secondary ? <div className="text-xs text-midnight/60">{secondary}</div> : null}
                  </li>
                )
              })
            ) : (
              <li className="px-4 py-3 text-sm text-midnight/60">No matches yet—keep typing for more results.</li>
            )}
          </ul>
        ) : null}
      </div>

      {helperText ? <p className="text-xs text-midnight/60">{helperText}</p> : null}
      {mapsLoading ? <p className="text-xs text-midnight/50">Loading Google Maps…</p> : null}
      {mapsLoadError ? (
        <div
          role="alert"
          data-google-maps-error
          className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember"
        >
          <p className="font-medium">Location search fallback is unavailable</p>
          <p className="mt-1 text-xs">{mapsLoadError}</p>
          <p className="mt-2 text-xs text-ember/90">Check your Google Maps browser API key and referrer restrictions.</p>
        </div>
      ) : null}
    </div>
  )
}
