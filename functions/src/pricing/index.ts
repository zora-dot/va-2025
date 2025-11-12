import { logger } from "firebase-functions";
import pricingMatrix from "../data/pricingMatrix.json";
import { getDrivingDistance, type LatLng, MAPS_SERVER_KEY } from "../maps";

export type TripDirection = "To the Airport" | "From the Airport";

const DISTANCE_RULE_KEY = "_distanceRule" as const;

type PricingMatrix = Record<string, PricingOriginDestinations>;
type PricingOriginDestinations = Record<string, PricingDestinations>;
type PricingDestinations = Record<string, PricingVehicleRates>;

export interface DistanceRuleConfig {
  type: "distance";
  baseFare: number;
  baseDistanceKm: number;
  perKmRate: number;
  additionalPassengerFee: number;
  target: {
    label: string;
    lat: number;
    lng: number;
  };
}

type PricingVehicleRate = number | DistanceRuleConfig;
type PricingVehicleRates = Record<string, PricingVehicleRate>;

interface NumericRates {
  [key: string]: number;
}

export interface PricingBreakdown {
  baseFare: number;
  additionalPassengerCharge: number;
  distanceCharge: number;
  extraKilometerCharge: number;
  total: number;
}

export interface PricingResult {
  baseRate: number | null;
  vehicleKey: string | null;
  availableVehicles: string[];
  ratesTable?: NumericRates;
  distanceRuleApplied: boolean;
  distanceDetails?: {
    km: number;
    durationMinutes: number;
  };
  breakdown?: PricingBreakdown;
  distanceRule?: DistanceRuleConfig | null;
}

export interface PricingArgs {
  direction: TripDirection;
  origin: string;
  destination: string;
  passengerCount: number;
  preferredVehicle?: "standard" | "van";
  preferredRateKey?: string | null;
  originAddress?: string | null;
  destinationAddress?: string | null;
  originLatLng?: LatLng | null;
  destinationLatLng?: LatLng | null;
}

export class PricingError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

const TEST_LOCATION_LABEL = "OT";
const TEST_BASE_RATE = 1;

const cloneDestinations = (value: PricingOriginDestinations): PricingOriginDestinations =>
  JSON.parse(JSON.stringify(value));

const cloneRates = (value: PricingVehicleRates): PricingVehicleRates =>
  JSON.parse(JSON.stringify(value));

const buildFromAirportMatrix = (toMatrix: PricingOriginDestinations): PricingOriginDestinations => {
  const fromMatrix: PricingOriginDestinations = {};

  for (const [origin, destinations] of Object.entries(toMatrix)) {
    for (const [destination, rates] of Object.entries(destinations)) {
      if (!fromMatrix[destination]) {
        fromMatrix[destination] = {};
      }
      fromMatrix[destination][origin] = cloneRates(rates as PricingVehicleRates);
    }
  }

  return fromMatrix;
};

const rawMatrix = pricingMatrix as PricingMatrix;
const baseToMatrix = (rawMatrix["To the Airport"] ?? {}) as PricingOriginDestinations;

const matrix: PricingMatrix = {
  "To the Airport": cloneDestinations(baseToMatrix),
  "From the Airport": buildFromAirportMatrix(baseToMatrix),
};

for (const [direction, destinations] of Object.entries(rawMatrix)) {
  if (direction === "To the Airport" || direction === "From the Airport") continue;
  matrix[direction] = cloneDestinations(destinations as PricingOriginDestinations);
}

const passengerKeyMatcher = (passengerCount: number): string[] => {
  if (passengerCount >= 12) return ["12-14", "14"];
  if (passengerCount >= 8) return ["8-11", "11"];
  if (passengerCount >= 7) return ["7v", "7"];
  if (passengerCount === 6) return ["6", "6v"];
  if (passengerCount <= 0) return [];
  return [passengerCount.toString()];
};

const usesSevenSeater = (passengerCount: number): boolean => passengerCount <= 6;

const splitRates = (rates: PricingVehicleRates | undefined) => {
  const numeric: NumericRates = {};
  let distanceRule: DistanceRuleConfig | null = null;

  if (!rates) return { numeric, distanceRule };

  for (const [key, value] of Object.entries(rates)) {
    if (key === DISTANCE_RULE_KEY && typeof value === "object" && value) {
      const candidate = value as Partial<DistanceRuleConfig> & { type?: unknown };
      if (candidate.type !== "distance") {
        continue;
      }
      distanceRule = candidate as DistanceRuleConfig;
      continue;
    }
    if (typeof value === "number") {
      numeric[key] = value;
    }
  }

  return { numeric, distanceRule };
};

const pickRateKey = (
  rates: NumericRates,
  passengerCount: number,
  preferred?: "standard" | "van",
  preferredRateKey?: string | null,
): string | null => {
  if (preferredRateKey && rates[preferredRateKey] != null) {
    return preferredRateKey;
  }
  const candidateKeys = passengerKeyMatcher(passengerCount);
  if (!candidateKeys.length) return Object.keys(rates)[0] ?? null;

  if (preferred === "van") {
    const vanKey = candidateKeys.find((key) => key.toLowerCase().includes("v"));
    if (vanKey && rates[vanKey] != null) {
      return vanKey;
    }
  }

  for (const key of candidateKeys) {
    if (rates[key] != null) return key;
  }

  return Object.keys(rates)[0] ?? null;
};

const roundUpToFiveCents = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.ceil((value - 1e-8) / 0.05) * 0.05;
  return Math.round(rounded * 100) / 100;
};

const computeDistanceFare = ({
  rule,
  passengerCount,
  distanceKm,
}: {
  rule: DistanceRuleConfig;
  passengerCount: number;
  distanceKm: number;
}): PricingBreakdown => {
  const additionalPassengers = usesSevenSeater(passengerCount) ? Math.max(0, passengerCount - 1) : 0;
  const baseFare = rule.baseFare;
  const additionalPassengerCharge = rule.additionalPassengerFee * additionalPassengers;
  const distanceCharge = distanceKm > rule.baseDistanceKm ? (distanceKm - rule.baseDistanceKm) * rule.perKmRate : 0;
  const subtotal = baseFare + additionalPassengerCharge + distanceCharge;
  const total = roundUpToFiveCents(subtotal);
  return {
    baseFare: roundUpToFiveCents(baseFare),
    additionalPassengerCharge: roundUpToFiveCents(additionalPassengerCharge),
    distanceCharge: roundUpToFiveCents(distanceCharge),
    extraKilometerCharge: roundUpToFiveCents(distanceCharge),
    total,
  };
};

const getLatLng = (value?: { lat: number; lng: number } | null): LatLng => {
  if (!value) throw new PricingError("MISSING_TARGET_COORDINATES", 500);
  if (typeof value.lat !== "number" || typeof value.lng !== "number") {
    throw new PricingError("INVALID_TARGET_COORDINATES", 500);
  }
  return { lat: value.lat, lng: value.lng };
};

const ensureDistanceForRule = async ({
  rule,
  direction,
  originAddress,
  destinationAddress,
  originLatLng,
  destinationLatLng,
}: {
  rule: DistanceRuleConfig;
  direction: TripDirection;
  originAddress?: string | null;
  destinationAddress?: string | null;
  originLatLng?: LatLng | null;
  destinationLatLng?: LatLng | null;
}) => {
  const target = getLatLng(rule.target);

  if (direction === "To the Airport") {
    const originInput = originLatLng ?? (originAddress && originAddress.trim() ? originAddress : null);
    if (!originInput) {
      logger.warn("pricing: distance rule missing origin input", {
        direction,
        originAddress,
        hasOriginLatLng: Boolean(originLatLng),
        ruleTarget: rule.target,
      });
      throw new PricingError("ORIGIN_ADDRESS_REQUIRED", 422);
    }
    logger.info("pricing: requesting driving distance (to airport)", {
      originInput,
      target: rule.target,
    });
    return getDrivingDistance({ origin: originInput, destination: target });
  }

  if (direction === "From the Airport") {
    const destinationInput =
      destinationLatLng ?? (destinationAddress && destinationAddress.trim() ? destinationAddress : null);
    if (!destinationInput) {
      logger.warn("pricing: distance rule missing destination input", {
        direction,
        destinationAddress,
        hasDestinationLatLng: Boolean(destinationLatLng),
        ruleTarget: rule.target,
      });
      throw new PricingError("DESTINATION_ADDRESS_REQUIRED", 422);
    }
    logger.info("pricing: requesting driving distance (from airport)", {
      destinationInput,
      target: rule.target,
    });
    return getDrivingDistance({ origin: target, destination: destinationInput });
  }

  logger.error("pricing: unsupported direction encountered", { direction });
  throw new PricingError("UNSUPPORTED_DIRECTION", 400);
};

export const calculatePricing = async ({
  direction,
  origin,
  destination,
  passengerCount,
  preferredVehicle,
  preferredRateKey,
  originAddress,
  destinationAddress,
  originLatLng,
  destinationLatLng,
}: PricingArgs): Promise<PricingResult> => {
  const normalizeTestLabel = (value: string) => value.trim().toUpperCase();
  const isTestLocation = (value: string) => normalizeTestLabel(value) === TEST_LOCATION_LABEL;
  if (isTestLocation(origin) && isTestLocation(destination)) {
    logger.info("pricing: OT test route detected");
    return {
      baseRate: TEST_BASE_RATE,
      vehicleKey: "test",
      availableVehicles: ["test"],
      ratesTable: { test: TEST_BASE_RATE },
      distanceRuleApplied: false,
    };
  }

  logger.info("pricing: calculate request", {
    direction,
    origin,
    destination,
    passengerCount,
    preferredVehicle: preferredVehicle ?? null,
    hasOriginAddress: Boolean(originAddress),
    hasDestinationAddress: Boolean(destinationAddress),
    hasOriginLatLng: Boolean(originLatLng),
    hasDestinationLatLng: Boolean(destinationLatLng),
  });

  const lookupDirection: TripDirection = direction;
  const lookupOrigin = origin;
  const lookupDestination = destination;
  const lookupOriginAddress = originAddress ?? null;
  const lookupDestinationAddress = destinationAddress ?? null;
  const lookupOriginLatLng = originLatLng ?? null;
  const lookupDestinationLatLng = destinationLatLng ?? null;

  logger.info("pricing: normalized lookup", {
    lookupDirection,
    lookupOrigin,
    lookupDestination,
    lookupOriginAddress,
    lookupDestinationAddress,
    hasLookupOriginLatLng: Boolean(lookupOriginLatLng),
    hasLookupDestinationLatLng: Boolean(lookupDestinationLatLng),
  });

  const group: PricingOriginDestinations | undefined = matrix[lookupDirection];
  if (!group) {
    logger.warn("pricing: no direction group found", {
      lookupDirection,
    });
    return {
      baseRate: null,
      vehicleKey: null,
      availableVehicles: [],
      distanceRuleApplied: false,
    };
  }

  const destinationGroup: PricingDestinations | undefined = group[lookupOrigin];
  const rates: PricingVehicleRates | undefined = destinationGroup?.[lookupDestination];

  if (!destinationGroup) {
    logger.warn("pricing: no destination group for origin", {
      lookupOrigin,
      availableOrigins: Object.keys(group),
    });
  }

  if (!rates) {
    logger.warn("pricing: no rates found for destination", {
      lookupOrigin,
      lookupDestination,
      availableDestinations: destinationGroup ? Object.keys(destinationGroup) : [],
    });
  }

  const { numeric, distanceRule } = splitRates(rates);
  const availableVehicles = Object.keys(numeric);
  const vehicleKey = pickRateKey(numeric, passengerCount, preferredVehicle, preferredRateKey);
  const rawBaseRate = vehicleKey ? numeric[vehicleKey] ?? null : null;
  const baseRate = rawBaseRate != null ? Math.round(rawBaseRate) : null;
  const shouldApplyDistanceRule = Boolean(distanceRule) && passengerCount <= 6 && !preferredRateKey;

  if (!rates || (!distanceRule && baseRate == null)) {
    logger.warn("pricing: missing applicable rate", {
      lookupOrigin,
      lookupDestination,
      passengerCount,
      preferredVehicle: preferredVehicle ?? null,
      availableVehicles,
      hasDistanceRule: Boolean(distanceRule),
    });
    return {
      baseRate: null,
      vehicleKey: null,
      availableVehicles,
      distanceRuleApplied: shouldApplyDistanceRule,
      distanceRule: shouldApplyDistanceRule ? distanceRule : null,
    };
  }

  if (!shouldApplyDistanceRule || !distanceRule) {
    logger.info("pricing: static rate matched", {
      vehicleKey,
      baseRate,
      availableVehicles,
    });
    return {
      baseRate,
      vehicleKey,
      availableVehicles,
      ratesTable: numeric,
      distanceRuleApplied: false,
      distanceRule: shouldApplyDistanceRule ? distanceRule : null,
    };
  }

  // Ensure the secret is registered when this helper is used
  MAPS_SERVER_KEY.value();

  const rawDistance = await ensureDistanceForRule({
    rule: distanceRule,
    direction: lookupDirection,
    originAddress: lookupOriginAddress,
    destinationAddress: lookupDestinationAddress,
    originLatLng: lookupOriginLatLng,
    destinationLatLng: lookupDestinationLatLng,
  });

  logger.info("pricing: distance rule applied", {
    vehicleKey,
    passengerCount,
    rawDistance,
    rule: {
      baseFare: distanceRule.baseFare,
      baseDistanceKm: distanceRule.baseDistanceKm,
      perKmRate: distanceRule.perKmRate,
      additionalPassengerFee: distanceRule.additionalPassengerFee,
      target: distanceRule.target,
    },
  });

  const breakdown = computeDistanceFare({
    rule: distanceRule,
    passengerCount,
    distanceKm: rawDistance.distanceKm,
  });
  const normalizedBreakdown = {
    baseFare: roundUpToFiveCents(breakdown.baseFare),
    additionalPassengerCharge: roundUpToFiveCents(breakdown.additionalPassengerCharge),
    distanceCharge: roundUpToFiveCents(breakdown.distanceCharge),
    extraKilometerCharge: roundUpToFiveCents(breakdown.extraKilometerCharge),
    total: roundUpToFiveCents(breakdown.total),
  };
  const roundedDistanceTotal = Math.round(normalizedBreakdown.total);
  const adjustedBreakdown = {
    ...normalizedBreakdown,
    total: roundedDistanceTotal,
  };

  return {
    baseRate: roundedDistanceTotal,
    vehicleKey,
    availableVehicles,
    ratesTable: numeric,
    distanceRuleApplied: true,
    distanceDetails: {
      km: rawDistance.distanceKm,
      durationMinutes: rawDistance.durationMinutes,
    },
    breakdown: adjustedBreakdown,
    distanceRule,
  };
};
