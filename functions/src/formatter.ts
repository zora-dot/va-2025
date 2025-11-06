const TIME_ZONE = "America/Vancouver";

const POI_NAME: Record<string, string> = {
  "Abbotsford International Airport (YXX)": "Abbotsford International Airport",
  "Vancouver International Airport (YVR)": "Vancouver International Airport",
  "Bellingham International Airport (BLI)": "Bellingham International Airport",
  "Canada Place Cruise Terminal in Vancouver": "Canada Place Cruise Terminal",
  "Horseshoe Bay Ferry Terminal in West Vancouver": "Horseshoe Bay Ferry Terminal",
  "Tsawwassen Ferry Terminal in Delta": "Tsawwassen Ferry Terminal",
  "King George Skytrain Station in Surrey": "King George SkyTrain Station",
};

const displayLocation = (label?: string | null, address?: string | null) => {
  const l = (label || "").trim();
  const a = (address || "").trim();
  if (l && POI_NAME[l]) return POI_NAME[l];
  if (a) return a;
  return l || "—";
};

const formatDateTime = (utcMs: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(utcMs));

export function buildConfirmationSMS(args: {
  bookingNumber: number | string;
  pickupTimeUtc: number;
  fromLabel?: string | null;
  fromAddress?: string | null;
  toLabel?: string | null;
  toAddress?: string | null;
}) {
  const when = formatDateTime(args.pickupTimeUtc);
  const from = displayLocation(args.fromLabel, args.fromAddress);
  const to = displayLocation(args.toLabel, args.toAddress);
  const n = args.bookingNumber;

  return [
    `Booking #${n} confirmed.`,
    `${when}`,
    `From: ${from}`,
    `To: ${to}`,
    "",
    `To cancel, text: cancel booking ${n}`,
    `For help, text: help`,
    `To unsubscribe, text: stop`,
    `To resubscribe, text: start`,
  ].join("\n");
}
