export {}

declare global {
  const google: GoogleNamespace

  interface GoogleNamespace {
    maps: typeof google.maps
  }

  namespace google.maps {
    interface LatLngLiteral {
      lat: number
      lng: number
    }

    namespace places {
      interface AutocompleteOptions {
        fields?: string[]
        componentRestrictions?: {
          country?: string | string[]
        }
        types?: string[]
      }

      interface PlaceResult {
        formatted_address?: string
        geometry?: {
          location?: {
            lat(): number
            lng(): number
          }
        }
        address_components?: Array<{
          long_name?: string
          short_name?: string
          types?: string[]
        }>
      }

      class Autocomplete {
        constructor(inputField: HTMLInputElement, opts?: AutocompleteOptions)
        getPlace(): PlaceResult | undefined
        addListener(eventName: string, handler: () => void): void
        unbindAll(): void
      }
    }

    namespace event {
      function clearInstanceListeners(instance: unknown): void
    }

    const TravelMode: {
      DRIVING: string
    }

    interface DirectionsLeg {
      distance?: { value?: number }
      duration?: { value?: number }
    }

    interface DirectionsRoute {
      legs?: DirectionsLeg[]
    }

    interface DirectionsResult {
      routes?: DirectionsRoute[]
    }

    class DirectionsService {
      route(
        request: {
          origin: string | LatLngLiteral
          destination: string | LatLngLiteral
          travelMode: string
        },
        callback: (result: DirectionsResult, status: string) => void,
      ): void
    }
  }
}
