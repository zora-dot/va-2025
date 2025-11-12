export interface LocationDirectoryEntry {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  placeIds?: string[];
  proximityRadiusKm?: number;
  locality?: string;
  region?: string;
  country?: string;
}

export interface ResolvedLocation {
  label: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}

export const locationDirectory: Record<string, LocationDirectoryEntry> = {
  "Abbotsford International Airport (YXX)": {
    formattedAddress: "30440 Liberator Ave, Abbotsford, BC V2T 6H5, Canada",
    latitude: 49.0252,
    longitude: -122.3601,
    placeId: "ChIJuyXxKmZKhFQRXuVp7UwagU4",
    placeIds: ["ChIJuyXxKmZKhFQRXuVp7UwagU4", "ChIJHeMm52G1hVQR8vmdAEhovKQ"],
    proximityRadiusKm: 1,
    locality: "Abbotsford",
    region: "BC",
    country: "CA",
  },
  "Vancouver International Airport (YVR)": {
    formattedAddress: "3211 Grant McConachie Way, Richmond, BC V7B 0A4, Canada",
    latitude: 49.1947,
    longitude: -123.1792,
    placeId: "ChIJm6MnhjQLhlQRhIA0hqzMaLo",
    placeIds: ["ChIJm6MnhjQLhlQRhIA0hqzMaLo"],
    proximityRadiusKm: 1,
    locality: "Richmond",
    region: "BC",
    country: "CA",
  },
  "Bellingham International Airport (BLI)": {
    formattedAddress: "4255 Mitchell Way, Bellingham, WA 98226, United States",
    latitude: 48.7927,
    longitude: -122.5375,
    proximityRadiusKm: 1,
    locality: "Bellingham",
    region: "WA",
    country: "US",
  },
  "Horseshoe Bay Ferry Terminal in West Vancouver": {
    formattedAddress: "6750 Keith Rd, West Vancouver, BC V7W 2V1, Canada",
    latitude: 49.3724,
    longitude: -123.2737,
    locality: "West Vancouver",
    region: "BC",
    country: "CA",
  },
  "Tsawwassen Ferry Terminal in Delta": {
    formattedAddress: "1 Ferry Causeway, Delta, BC V4M 4G6, Canada",
    latitude: 49.0089,
    longitude: -123.1187,
    locality: "Delta",
    region: "BC",
    country: "CA",
  },
  "Canada Place Cruise Terminal in Vancouver": {
    formattedAddress: "999 Canada Pl, Vancouver, BC V6C 3T4, Canada",
    latitude: 49.2888,
    longitude: -123.1113,
    placeIds: ["ChIJh1duaoNxhlQRjXZyXbz3xdM"],
    locality: "Vancouver",
    region: "BC",
    country: "CA",
  },
  "King George Skytrain Station in Surrey": {
    formattedAddress: "9900 King George Blvd, Surrey, BC V3T 0K7, Canada",
    latitude: 49.1829,
    longitude: -122.8448,
    locality: "Surrey",
    region: "BC",
    country: "CA",
  },
};

export const getLocationMetadata = (label: string | null | undefined): LocationDirectoryEntry | undefined => {
  if (!label) return undefined;
  return locationDirectory[label];
};

export const resolveLocationDetails = ({
  label,
  address,
  lat,
  lng,
  placeId,
}: {
  label: string | null | undefined;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
}): ResolvedLocation => {
  const inputLabel = typeof label === "string" && label.trim().length > 0 ? label.trim() : null;
  const metadata = getLocationMetadata(inputLabel ?? undefined);
  const trimmedAddress = typeof address === "string" && address.trim().length > 0 ? address.trim() : null;
  const hasLat = typeof lat === "number" && Number.isFinite(lat);
  const hasLng = typeof lng === "number" && Number.isFinite(lng);
  const trimmedPlaceId = typeof placeId === "string" && placeId.trim().length > 0 ? placeId.trim() : null;

  const resolvedAddress = trimmedAddress ?? metadata?.formattedAddress ?? null;
  const resolvedLat = hasLat ? lat ?? null : metadata?.latitude ?? null;
  const resolvedLng = hasLng ? lng ?? null : metadata?.longitude ?? null;
  const resolvedPlaceId = trimmedPlaceId ?? metadata?.placeId ?? null;
  const resolvedLabel = inputLabel ?? metadata?.formattedAddress ?? resolvedAddress ?? "Location";

  return {
    label: resolvedLabel,
    address: resolvedAddress,
    lat: resolvedLat,
    lng: resolvedLng,
    placeId: resolvedPlaceId,
  };
};
