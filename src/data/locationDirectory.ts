export interface LocationDirectoryEntry {
  formattedAddress: string
  latitude: number
  longitude: number
  placeId?: string
  locality?: string
  region?: string
  country?: string
}

export const locationDirectory: Record<string, LocationDirectoryEntry> = {
  "Abbotsford International Airport (YXX)": {
    formattedAddress: "30440 Liberator Ave, Abbotsford, BC V2T 6H5, Canada",
    latitude: 49.0252,
    longitude: -122.3601,
    locality: "Abbotsford",
    region: "BC",
    country: "CA",
  },
  "Vancouver International Airport (YVR)": {
    formattedAddress: "3211 Grant McConachie Way, Richmond, BC V7B 0A4, Canada",
    latitude: 49.1947,
    longitude: -123.1792,
    locality: "Richmond",
    region: "BC",
    country: "CA",
  },
  "Bellingham International Airport (BLI)": {
    formattedAddress: "4255 Mitchell Way, Bellingham, WA 98226, United States",
    latitude: 48.7927,
    longitude: -122.5375,
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
}

export const getLocationMetadata = (label: string | null | undefined): LocationDirectoryEntry | undefined => {
  if (!label) return undefined
  return locationDirectory[label]
}
