import { pricingMatrix } from "@/data/pricing"
import {
  DISTANCE_RULE_KEY,
  type PricingDestinations,
  type PricingVehicleRates,
  type PricingVehicleNumericRates,
  type DistanceRuleConfig,
  type PricingBreakdown,
} from "@/lib/types/pricing"

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
  ratesTable?: PricingVehicleNumericRates
  distanceRule?: DistanceRuleConfig | null
  distanceRuleApplied?: boolean
  manualQuoteId?: string | null
  manualApprovalStatus?: "pending" | "approved" | "declined" | null
  manualDecisionAt?: string | null
  manualDecisionBy?: string | null
}

export interface PricingQuoteResult extends PricingResult {
  distanceDetails?: {
    km: number
    durationMinutes: number
  }
  breakdown?: PricingBreakdown
  quoteId?: string | null
  currency?: string | null
  total?: number | null
  validUntil?: string | null
  coverageOk?: boolean | null
  warnings?: string[] | null
  signature?: string | null
  lineItems?: QuoteLineItem[]
}

export interface QuoteLineItem {
  code: string
  label: string
  amount: number
  meta?: Record<string, unknown>
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
  if (passengerCount <= 0) return []
  return [passengerCount.toString()]
}

const pickRateKey = (
  rates: PricingVehicleNumericRates,
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

const splitRates = (rates: PricingVehicleRates | undefined) => {
  const numeric: PricingVehicleNumericRates = {}
  let distanceRule: DistanceRuleConfig | null = null

  if (!rates) {
    return { numeric, distanceRule }
  }

  for (const [key, value] of Object.entries(rates)) {
    if (key === DISTANCE_RULE_KEY && typeof value === "object" && value && value.type === "distance") {
      distanceRule = value as DistanceRuleConfig
      continue
    }
    if (typeof value === "number") {
      numeric[key] = value
    }
  }

  return { numeric, distanceRule }
}

export const calculatePricing = ({
  direction,
  origin,
  destination,
  passengerCount,
  preferredVehicle,
}: PricingRequest): PricingResult => {
  let lookupDirection: TripDirection = direction
  let lookupOrigin = origin
  let lookupDestination = destination

  if (direction === "From the Airport") {
    lookupDirection = "To the Airport"
    lookupOrigin = destination
    lookupDestination = origin
  }

  const group = pricingMatrix[lookupDirection]
  const origins = group ?? {}
  const destinationGroup: PricingDestinations | undefined = origins[lookupOrigin]
  const rates: PricingVehicleRates | undefined = destinationGroup?.[lookupDestination]

  if (lookupDestination === HOURLY_TOUR_LABEL) {
    return {
      baseRate: HOURLY_TOUR_RATE,
      vehicleKey: "hourly",
      availableVehicles: ["hourly"],
      ratesTable: { hourly: HOURLY_TOUR_RATE },
    }
  }

  const { numeric: numericRates, distanceRule } = splitRates(rates)

  if (!rates || (Object.keys(numericRates).length === 0 && !distanceRule)) {
    return {
      baseRate: null,
      vehicleKey: null,
      availableVehicles: [],
      distanceRule,
      distanceRuleApplied: Boolean(distanceRule),
    }
  }

  const vehicleKey = pickRateKey(numericRates, passengerCount, preferredVehicle)
  const rawBaseRate = vehicleKey ? numericRates[vehicleKey] ?? null : null
  const baseRate = rawBaseRate != null ? Math.round(rawBaseRate) : null
  const shouldApplyDistanceRule = Boolean(distanceRule) && passengerCount <= 5

  if (!shouldApplyDistanceRule) {
    return {
      baseRate,
      vehicleKey,
      availableVehicles: Object.keys(numericRates),
      ratesTable: numericRates,
      distanceRule: shouldApplyDistanceRule ? distanceRule : null,
      distanceRuleApplied: false,
    }
  }

  return {
    baseRate,
    vehicleKey,
    availableVehicles: Object.keys(numericRates),
    ratesTable: numericRates,
    distanceRule,
    distanceRuleApplied: true,
  }
}
