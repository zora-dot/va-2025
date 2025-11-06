import { buildConfirmationSMS } from "../formatter";

export type SmsLocation = {
  full?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postal?: string | null;
  poiCode?: string | null;
  poiName?: string | null;
};

const POI_ALIAS: Record<string, string> = {
  YXX: "Abbotsford International Airport (YXX)",
  "Abbotsford International Airport (YXX)": "Abbotsford International Airport (YXX)",
  YVR: "Vancouver International Airport (YVR)",
  "Vancouver International Airport (YVR)": "Vancouver International Airport (YVR)",
  BLI: "Bellingham International Airport (BLI)",
  "Bellingham International Airport (BLI)": "Bellingham International Airport (BLI)",
  CANADA_PLACE: "Canada Place Cruise Terminal in Vancouver",
  "Canada Place Cruise Terminal in Vancouver": "Canada Place Cruise Terminal in Vancouver",
  HORSESHOE_BAY: "Horseshoe Bay Ferry Terminal in West Vancouver",
  "Horseshoe Bay Ferry Terminal in West Vancouver": "Horseshoe Bay Ferry Terminal in West Vancouver",
  KING_GEORGE: "King George Skytrain Station in Surrey",
  "King George Skytrain Station in Surrey": "King George Skytrain Station in Surrey",
  TSAWWASSEN: "Tsawwassen Ferry Terminal in Delta",
  "Tsawwassen Ferry Terminal in Delta": "Tsawwassen Ferry Terminal in Delta",
};

const pickLabel = (loc?: SmsLocation | null) => {
  if (!loc) return undefined;
  const code = loc.poiCode?.toUpperCase();
  if (code && POI_ALIAS[code]) return POI_ALIAS[code];
  if (loc.poiName) return loc.poiName.trim();
  if (loc.address) return loc.address.trim();
  if (loc.full) return loc.full.trim();
  return undefined;
};

const pickAddress = (loc?: SmsLocation | null) => {
  if (!loc) return undefined;
  if (loc.full && loc.full.trim().length > 0) {
    return loc.full.trim();
  }
  const parts = [loc.address, loc.city, loc.region, loc.postal]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(", ") : undefined;
};

export const buildConfirmationSms = (booking: {
  bookingNumber: number | string;
  pickupAtIso: string;
  from: SmsLocation;
  to: SmsLocation;
}): string => {
  const pickupMs = Number.isFinite(Date.parse(booking.pickupAtIso))
    ? Date.parse(booking.pickupAtIso)
    : Date.now();

  return buildConfirmationSMS({
    bookingNumber: booking.bookingNumber,
    pickupTimeUtc: pickupMs,
    fromLabel: pickLabel(booking.from),
    fromAddress: pickAddress(booking.from),
    toLabel: pickLabel(booking.to),
    toAddress: pickAddress(booking.to),
  });
};
