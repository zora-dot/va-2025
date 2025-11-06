import rawMatrix from "./pricingMatrix.json"
import {
  DISTANCE_RULE_KEY,
  type PricingMatrix,
  type PricingOriginDestinations,
  type PricingVehicleRates,
  type PricingOriginConfig,
} from "@/lib/types/pricing"

const cloneDestinations = (value: PricingOriginDestinations): PricingOriginDestinations =>
  JSON.parse(JSON.stringify(value))

const cloneRates = (value: PricingVehicleRates): PricingVehicleRates =>
  JSON.parse(JSON.stringify(value))

const buildFromAirportMatrix = (toMatrix: PricingOriginDestinations): PricingOriginDestinations => {
  const fromMatrix: PricingOriginDestinations = {}

  for (const [origin, destinations] of Object.entries(toMatrix)) {
    for (const [destination, rates] of Object.entries(destinations)) {
      if (!fromMatrix[destination]) {
        fromMatrix[destination] = {}
      }
      fromMatrix[destination][origin] = cloneRates(rates as PricingVehicleRates)
    }
  }

  return fromMatrix
}

const buildToAirportMatrix = (origins: PricingOriginConfig[]): PricingOriginDestinations => {
  const toMatrix: PricingOriginDestinations = {}

  origins.forEach((origin) => {
    if (!origin.routes || origin.routes.length === 0) return
    if (!toMatrix[origin.label]) {
      toMatrix[origin.label] = {}
    }

    origin.routes.forEach((route) => {
      const rates: PricingVehicleRates = cloneRates(route.rates)
      if (route.distanceRule) {
        rates[DISTANCE_RULE_KEY] = route.distanceRule
      }
      toMatrix[origin.label][route.destination] = rates
    })
  })

  return toMatrix
}

const normalizePricingMatrix = (origins: PricingOriginConfig[]): PricingMatrix => {
  const toMatrix = buildToAirportMatrix(origins)
  return {
    "To the Airport": cloneDestinations(toMatrix),
    "From the Airport": buildFromAirportMatrix(toMatrix),
  }
}

export const pricingMatrix = normalizePricingMatrix(rawMatrix as PricingOriginConfig[])
