import { defineSecret } from "firebase-functions/params";

export const MAPS_SERVER_KEY = defineSecret("MAPS_SERVER_KEY");

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DistanceResponse {
  distanceKm: number;
  durationMinutes: number;
}

export class MapsError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "MapsError";
  }
}

const encodePlace = (value: string | LatLng): string => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new MapsError("EMPTY_ADDRESS", 400);
    return encodeURIComponent(trimmed);
  }
  if (typeof value.lat !== "number" || typeof value.lng !== "number") {
    throw new MapsError("INVALID_COORDINATES", 400);
  }
  return `${value.lat},${value.lng}`;
};

type DirectionsResponse = {
  status?: string;
  routes?: Array<{
    legs?: Array<{
      distance?: { value?: number };
      duration?: { value?: number };
    }>;
  }>;
};

export const getDrivingDistance = async ({
  origin,
  destination,
}: {
  origin: string | LatLng;
  destination: string | LatLng;
}): Promise<DistanceResponse> => {
  const apiKey = MAPS_SERVER_KEY.value();
  if (!apiKey) {
    throw new MapsError("MISSING_MAPS_SERVER_KEY", 500);
  }

  const originParam = encodePlace(origin);
  const destinationParam = encodePlace(destination);

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originParam}&destination=${destinationParam}&mode=driving&region=CA&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new MapsError("DIRECTIONS_REQUEST_FAILED", response.status);
  }

  const payload = (await response.json()) as DirectionsResponse;
  const status = payload?.status;
  if (status && status !== "OK") {
    throw new MapsError("NO_ROUTE_FOUND", 422, status);
  }

  const leg = payload?.routes?.[0]?.legs?.[0];
  if (!leg || !leg.distance?.value || !leg.duration?.value) {
    throw new MapsError("NO_ROUTE_FOUND", 422, payload);
  }

  const distanceMeters = Number(leg.distance.value);
  const durationSeconds = Number(leg.duration.value);
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
    throw new MapsError("INVALID_ROUTE_RESPONSE", 422, leg);
  }

  const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
  const durationMinutes = Math.round(durationSeconds / 60);

  return {
    distanceKm,
    durationMinutes,
  };
};
