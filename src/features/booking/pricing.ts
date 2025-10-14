import { pricingMatrix } from "@/data/pricing"
import type { PricingDestinations, PricingVehicleRates } from "@/lib/types/pricing"

export const HOURLY_TOUR_LABEL = "Hourly Tour Shuttle"
const HOURLY_TOUR_RATE = 100

export type TripDirection = "To the Airport" | "From the Airport"

export interface PricingRequest {
  direction: TripDirection
  origin: string
  destination: string
  passengerCount: number
  preferredVehicle?: "standard" | "van"
}

export interface PricingResult {
  baseRate: number | null
  vehicleKey: string | null
  availableVehicles: string[]
  ratesTable?: PricingVehicleRates
}

export const getAvailableDirections = (): TripDirection[] =>
  Object.keys(pricingMatrix) as TripDirection[]

export const getOriginsForDirection = (direction: TripDirection): string[] => {
  const group = pricingMatrix[direction]
  return group ? Object.keys(group) : []
}

export const getDestinationsForOrigin = (
  direction: TripDirection,
  origin: string,
): string[] => {
  const group = pricingMatrix[direction]
  if (!group) return []
  const destinations = group[origin]
  return destinations ? Object.keys(destinations) : []
}

const passengerKeyMatcher = (passengerCount: number): string[] => {
  if (passengerCount >= 12) return ["12-14", "14"]
  if (passengerCount >= 8) return ["8-11", "11"]
  if (passengerCount >= 7) return ["7v", "7"]
  if (passengerCount >= 6) return ["6v", "6"]
  return [passengerCount.toString()]
}

const pickRateKey = (
  rates: PricingVehicleRates,
  passengerCount: number,
  preferred?: "standard" | "van",
): string | null => {
  const candidateKeys = passengerKeyMatcher(passengerCount)

  if (preferred === "van") {
    const vanKey = candidateKeys.find((key) => key.toLowerCase().includes("v"))
    if (vanKey && rates[vanKey] != null) {
      return vanKey
    }
  }

  for (const key of candidateKeys) {
    if (rates[key] != null) return key
  }

  // fallback to first available rate
  const firstKey = Object.keys(rates)[0]
  return firstKey ?? null
}

export const calculatePricing = ({
  direction,
  origin,
  destination,
  passengerCount,
  preferredVehicle,
}: PricingRequest): PricingResult => {
  const group = pricingMatrix[direction]
  const origins = group ?? {}
  const destinationGroup: PricingDestinations | undefined = origins[origin]
  const rates: PricingVehicleRates | undefined = destinationGroup?.[destination]

  if (destination === HOURLY_TOUR_LABEL) {
    return {
      baseRate: HOURLY_TOUR_RATE,
      vehicleKey: "hourly",
      availableVehicles: ["hourly"],
      ratesTable: { hourly: HOURLY_TOUR_RATE },
    }
  }

  if (!rates) {
    return {
      baseRate: null,
      vehicleKey: null,
      availableVehicles: [],
    }
  }

  const vehicleKey = pickRateKey(rates, passengerCount, preferredVehicle)

  return {
    baseRate: vehicleKey ? rates[vehicleKey] ?? null : null,
    vehicleKey,
    availableVehicles: Object.keys(rates),
    ratesTable: rates,
  }
}
