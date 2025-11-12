import { format, isValid, parse } from "date-fns"
import type { TripDirection } from "@/features/booking/pricing"

export type ManualBookingDraft = {
  status: string
  pickupDate: string
  pickupTime: string
  timeZone: string
  passengerName: string
  passengerPhone: string | null
  passengerEmail: string | null
  passengerCount: number
  baggage: string | null
  specialNotes: string | null
  scheduleNotes: string | null
  origin: string
  destination: string
  direction: TripDirection
  totalCents: number | null
  currency: string
  paymentPreference: "pay_on_arrival" | "pay_now"
  flightNumber: string | null
}

export type ParsedManualBooking = {
  draft: ManualBookingDraft
  rawText: string
}

const MAX_BOOKINGS = 5

const STATUS_MAP: Record<string, string> = {
  confirmed: "confirmed",
  pending: "pending",
  awaiting_payment: "awaiting_payment",
  assigned: "assigned",
  completed: "completed",
  cancelled: "cancelled",
}

const normalizeStatus = (value?: string | null) => {
  if (!value) return "confirmed"
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_")
  return STATUS_MAP[normalized] ?? "confirmed"
}

const extractField = (source: string, label: string) => {
  const regex = new RegExp(`${label}:\\s*([^\\n]+)`, "i")
  const match = source.match(regex)
  return match ? match[1].trim() : null
}

const parseDateTime = (value: string) => {
  const parsed = parse(value, "MMMM d, yyyy 'at' h:mm a", new Date())
  if (!isValid(parsed)) {
    throw new Error("Unable to parse pickup date/time")
  }
  return {
    date: format(parsed, "yyyy-MM-dd"),
    time: format(parsed, "HH:mm"),
  }
}

const parsePassengerLine = (value: string | null) => {
  if (!value) {
    return { name: "", phone: null }
  }
  const parts = value.split(/\s+-\s+/)
  if (parts.length >= 2) {
    const phoneCandidate = parts.pop() ?? ""
    const name = parts.join(" - ").trim()
    return { name, phone: phoneCandidate.trim() || null }
  }
  return { name: value, phone: null }
}

const inferDirection = (origin: string, destination: string): TripDirection => {
  const originHasAirport = origin.toLowerCase().includes("airport")
  const destinationHasAirport = destination.toLowerCase().includes("airport")
  if (originHasAirport && !destinationHasAirport) return "From the Airport"
  if (!originHasAirport && destinationHasAirport) return "To the Airport"
  return "To the Airport"
}

const currencyToCents = (value: string | null) => {
  if (!value) return null
  const currencyMatches = [...value.matchAll(/(?:[$€£]|CAD|USD|EUR)\s*([0-9]+(?:,[0-9]{3})*(?:\.\d+)?)/gi)]

  const fallbackMatches = currencyMatches.length ?
    currencyMatches :
    [...value.matchAll(/([0-9]+(?:,[0-9]{3})*(?:\.\d+)?)/g)]

  if (!fallbackMatches.length) return null

  const candidate =
    [...fallbackMatches]
      .reverse()
      .find((match) => typeof match[1] === "string" && match[1].includes(".")) ?? fallbackMatches[fallbackMatches.length - 1]

  const numeric = Number.parseFloat(candidate[1].replace(/,/g, ""))
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric * 100)
}

const passengerCountFromPrice = (value: string | null) => {
  if (!value) return null
  const match = value.match(/(\d+)\s*Passenger/i)
  if (match) {
    return Number.parseInt(match[1], 10)
  }
  return null
}

const splitManualBookingEntries = (input: string): string[] => {
  const sanitized = input.replace(/\r\n/g, "\n").trim()
  if (!sanitized) return []

  const lines = sanitized.split("\n")
  const entries: string[] = []
  let current: string[] = []
  let hasSeparator = false
  let startedSegment = false

  const pushCurrent = () => {
    const chunk = current.join("\n").trim()
    if (chunk) {
      entries.push(chunk)
    }
    current = []
  }

  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\.\s*(.*)$/)
    if (match) {
      hasSeparator = true
      if (startedSegment) {
        pushCurrent()
      } else {
        startedSegment = true
      }
      const remainder = match[2]?.trim()
      if (remainder) {
        current.push(remainder)
      }
      continue
    }
    current.push(line)
  }

  pushCurrent()

  if (!hasSeparator) {
    return entries.length ? entries : [sanitized]
  }

  return entries
}

const parseSingleManualBookingText = (input: string): ManualBookingDraft => {
  const sanitized = input.replace(/\r\n/g, "\n").trim()
  if (!sanitized) {
    throw new Error("Paste the booking details before parsing.")
  }

  const status = normalizeStatus(extractField(sanitized, "Booking Status"))
  const totalPriceLine = extractField(sanitized, "Total Price")
  const rawDateMatch = sanitized.match(/Date:\s*([^\n(]+)(?:\s*\(([^)]+)\))?/i)
  if (!rawDateMatch || !rawDateMatch[1]) {
    throw new Error("Could not find the pickup date line.")
  }
  const { date: pickupDate, time: pickupTime } = parseDateTime(rawDateMatch[1].trim())

  let flightNumber: string | null = null
  if (rawDateMatch[2]) {
    const inlineFlight = rawDateMatch[2].match(/Flight Number:\s*(.+)/i)
    if (inlineFlight) {
      flightNumber = inlineFlight[1].trim()
    }
  }
  if (!flightNumber) {
    const flightLine = extractField(sanitized, "Flight Number")
    flightNumber = flightLine
  }

  const origin = extractField(sanitized, "From")
  const destination = extractField(sanitized, "To")
  if (!origin || !destination) {
    throw new Error("Origin or destination is missing from the pasted text.")
  }

  const direction = inferDirection(origin, destination)
  const passengerLine = extractField(sanitized, "Main Passenger")
  const passengerInfo = parsePassengerLine(passengerLine)
  if (!passengerInfo.name) {
    throw new Error("Passenger name could not be determined.")
  }

  const baggage = extractField(sanitized, "Baggage")
  const notes = extractField(sanitized, "Special Notes")
  const normalizedNotes = notes && notes.toLowerCase() !== "none" ? notes : null

  const inlinePassengerCount = (() => {
    const parsed = Number.parseInt(extractField(sanitized, "Passengers") ?? "", 10)
    return Number.isFinite(parsed) ? parsed : null
  })()

  const passengerCount =
    passengerCountFromPrice(totalPriceLine) ??
    inlinePassengerCount ??
    1

  const totalCents = currencyToCents(totalPriceLine)

  return {
    status,
    pickupDate,
    pickupTime,
    timeZone: "America/Vancouver",
    passengerName: passengerInfo.name,
    passengerPhone: passengerInfo.phone,
    passengerEmail: null,
    passengerCount: Number.isFinite(passengerCount) ? Math.max(1, passengerCount) : 1,
    baggage: baggage ?? "Normal",
    specialNotes: normalizedNotes,
    scheduleNotes: normalizedNotes,
    origin,
    destination,
    direction,
    totalCents,
    currency: "CAD",
    paymentPreference: "pay_on_arrival",
    flightNumber: flightNumber ?? null,
  }
}

export const parseManualBookingText = (input: string): ParsedManualBooking[] => {
  const entries = splitManualBookingEntries(input)
  if (!entries.length) {
    throw new Error("Paste the booking details before parsing.")
  }
  if (entries.length > MAX_BOOKINGS) {
    throw new Error(`You can parse up to ${MAX_BOOKINGS} bookings at once.`)
  }

  return entries.map((entry, index) => {
    try {
      return {
        rawText: entry,
        draft: parseSingleManualBookingText(entry),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse booking details."
      throw new Error(`Entry ${index + 1}: ${message}`)
    }
  })
}
