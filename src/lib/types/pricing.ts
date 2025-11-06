export type PricingMatrix = Record<string, PricingOriginDestinations>

export type PricingOriginDestinations = Record<string, PricingDestinations>

export type PricingDestinations = Record<string, PricingVehicleRates>

export interface PricingOriginConfig {
  label: string
  lat?: number | null
  lng?: number | null
  metadata?: Record<string, unknown>
  routes: PricingRouteConfig[]
}

export interface PricingRouteConfig {
  destination: string
  label: string
  baseFare: number | null
  rates: PricingVehicleRates
  distanceRule?: DistanceRuleConfig | null
}

export interface DistanceRuleConfig {
  type: "distance"
  baseFare: number
  baseDistanceKm: number
  perKmRate: number
  additionalPassengerFee: number
  target: {
    label: string
    lat: number
    lng: number
  }
}

export type PricingVehicleRate = number | DistanceRuleConfig

export type PricingVehicleRates = Record<string, PricingVehicleRate>

export type PricingVehicleNumericRates = Record<string, number>

export interface PricingBreakdown {
  baseFare: number
  additionalPassengerCharge: number
  distanceCharge: number
  extraKilometerCharge: number
  total: number
}

export const DISTANCE_RULE_KEY = "_distanceRule" as const
