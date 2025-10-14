export type PricingMatrix = Record<string, PricingOriginDestinations>

export type PricingOriginDestinations = Record<string, PricingDestinations>

export type PricingDestinations = Record<string, PricingVehicleRates>

export type PricingVehicleRates = Record<string, number>
