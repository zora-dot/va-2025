import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEventHandler, type ReactNode } from "react"
import { z } from "zod"
import { Controller, useForm, type Resolver, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FirebaseError } from "firebase/app"
import { useNavigate } from "@tanstack/react-router"
import { GlassPanel } from "@/components/ui/GlassPanel"
import {
  calculatePricing,
  getDestinationsForOrigin,
  getOriginsForDirection,
  getAvailableDirections,
} from "@/features/booking/pricing"
import type { TripDirection, PricingResult } from "@/features/booking/pricing"
import { addHours, differenceInMinutes, format } from "date-fns"
import { clsx } from "clsx"
import { useFirebaseServices } from "@/app/providers/FirebaseContext"
import { PlacesAutocompleteInput } from "@/components/maps/PlacesAutocompleteInput"
import { apiFetch } from "@/lib/api/rest"
import { callFunction } from "@/lib/api/client"

const baseDirections = getAvailableDirections()
const extraDirections = ["Ferry Terminal", "Cruise Terminal"] as const
const directionOptions = [...baseDirections, ...extraDirections] as const
type DirectionOption = (typeof directionOptions)[number]
const otherOptionLabel = "Other (please specify)"
const ABBOTSFORD_ANY_ADDRESS = "Abbotsford (Any Address)"
const additionalTerminals = [
  "Abbotsford International Airport (YXX)",
  "Vancouver International Airport (YVR)",
  "Bellingham International Airport (BLI)",
]

type LocationOptionGroup = {
  label: string
  options: string[]
}

const PASSENGER_MAX = 14
const MIN_ADVANCE_HOURS = 10
const SOFT_NOTICE_HOURS = 24
const MIN_ADVANCE_MINUTES = MIN_ADVANCE_HOURS * 60
const ADDITIONAL_PASSENGER_FEE = 10
const PASSENGER_LIMIT_MESSAGE =
  "If you would like more than 14 passengers, please call or email us instead for a group quote."

const LOCATION_CATEGORY_ORDER = [
  "Airports",
  "Ferry Terminals",
  "Cruise Terminals",
  "Transit Hubs",
  "Metro Areas",
] as const

const normalizeLocationLabel = (label: string) =>
  label
    .toLowerCase()
    .replace(/\s*\(.*?\)/g, "")
    .replace(/\s+in\s+.*$/g, "")
    .trim()

const getLocationCategory = (label: string): (typeof LOCATION_CATEGORY_ORDER)[number] => {
  const lower = label.toLowerCase()
  if (lower.includes("airport")) return "Airports"
  if (lower.includes("ferry")) return "Ferry Terminals"
  if (lower.includes("cruise")) return "Cruise Terminals"
  if (lower.includes("skytrain") || lower.includes("station")) return "Transit Hubs"
  return "Metro Areas"
}

const buildLocationGroups = (options: string[]): LocationOptionGroup[] => {
  const grouped = new Map<string, string[]>()
  options.forEach((option) => {
    const category = getLocationCategory(option)
    const existing = grouped.get(category)
    if (existing) {
      existing.push(option)
    } else {
      grouped.set(category, [option])
    }
  })

  const ordered: LocationOptionGroup[] = []
  LOCATION_CATEGORY_ORDER.forEach((category) => {
    const items = grouped.get(category)
    if (items?.length) {
      ordered.push({ label: category, options: items })
      grouped.delete(category)
    }
  })

  grouped.forEach((items, category) => {
    ordered.push({ label: category, options: items })
  })

  return ordered.map((group) => ({
    label: group.label,
    options: group.options.filter((option, index, array) => {
      const key = normalizeLocationLabel(option)
      return array.findIndex((candidate) => normalizeLocationLabel(candidate) === key) === index
    }),
  }))
}

const shouldShowDistanceFare = (origin: string, destination: string) => {
  const target = normalizeLocationLabel(ABBOTSFORD_ANY_ADDRESS)
  return (
    normalizeLocationLabel(origin) === target ||
    normalizeLocationLabel(destination) === target
  )
}

const roundMinutesToStep = (minutes: number, step: number) => Math.floor(minutes / step) * step

const extractTimeParts = (date: Date) => {
  const hours24 = date.getHours()
  const minutes = roundMinutesToStep(date.getMinutes(), 5)
  const period: "AM" | "PM" = hours24 >= 12 ? "PM" : "AM"
  const hour12 = hours24 % 12 || 12
  return {
    hour: String(hour12).padStart(2, "0"),
    minute: String(minutes).padStart(2, "0"),
    period,
  }
}

const buildScheduleDefaults = (offsetHours: number) => {
  const target = addHours(new Date(), offsetHours)
  const { hour, minute, period } = extractTimeParts(target)
  return {
    pickupDate: format(target, "yyyy-MM-dd"),
    pickupHour: hour,
    pickupMinute: minute,
    pickupPeriod: period,
  }
}

const combineDateAndTime = (date: string, hour: string, minute: string, period: "AM" | "PM") => {
  const normalizedHour = Number(hour) || 0
  const normalizedMinute = Number(minute) || 0
  let hours24 = normalizedHour % 12
  if (period === "PM") hours24 += 12
  const isoHour = String(hours24).padStart(2, "0")
  const isoMinute = String(normalizedMinute).padStart(2, "0")
  return new Date(`${date}T${isoHour}:${isoMinute}`)
}

const vehicleOptions = [
  {
    id: "sevenVan",
    label: "7-Seater Van (up to 5 passengers)",
    helper: "Plenty of room for families and carry-ons.",
  },
  {
    id: "chevyExpress",
    label: "8-Seater Chevrolet Express (up to 7 passengers, extra luggage space)",
    helper: "Great for sports teams and ski groups.",
  },
  {
    id: "mercedesSprinter",
    label: "12-Seater Mercedes Benz Sprinter Van (up to 11 passengers)",
    helper: "Premium shuttle with standing room height.",
  },
  {
    id: "freightlinerSprinter",
    label: "15-Seater Freightliner Sprinter (up to 14 passengers)",
    helper: "Max capacity option for large crews.",
  },
] as const

type VehicleOptionId = (typeof vehicleOptions)[number]["id"]

const vehicleLabelMap: Record<VehicleOptionId, string> = Object.fromEntries(
  vehicleOptions.map((option) => [option.id, option.label]),
) as Record<VehicleOptionId, string>

const vehiclePreferenceMap: Record<VehicleOptionId, "standard" | "van"> = {
  sevenVan: "van",
  chevyExpress: "van",
  mercedesSprinter: "van",
  freightlinerSprinter: "van",
}

const determineVehicleOption = (passengerCount: number): VehicleOptionId => {
  if (passengerCount >= 12) return "freightlinerSprinter"
  if (passengerCount >= 8) return "mercedesSprinter"
  if (passengerCount >= 6) return "chevyExpress"
  return "sevenVan"
}

const to24Hour = (hour: string, minute: string, period: "AM" | "PM") => {
  let h = parseInt(hour, 10)
  if (Number.isNaN(h)) h = 0
  h = h % 12
  if (period === "PM") h += 12
  return `${String(h).padStart(2, "0")}:${minute.padStart(2, "0")}`
}

const vehicleSelectionEnum = z.enum(vehicleOptions.map((option) => option.id) as [VehicleOptionId, ...VehicleOptionId[]])

const directionEnum = z.enum(directionOptions as unknown as [DirectionOption, ...DirectionOption[]])

const tripSchema = z.object({
  direction: directionEnum,
  origin: z.string().min(1, "Select a pick-up address"),
  originOther: z.string().optional(),
  originAddress: z.string().optional(),
  destination: z.string().min(1, "Select a drop-off address"),
  destinationOther: z.string().optional(),
  destinationAddress: z.string().optional(),
  passengerCount: z
    .coerce
    .number()
    .min(1)
    .max(PASSENGER_MAX, {
      message: PASSENGER_LIMIT_MESSAGE,
    }),
  vehicleSelections: z.array(vehicleSelectionEnum).min(1),
})

const scheduleSchema = z.object({
  pickupDate: z.string().min(1, "Choose a pickup date"),
  pickupHour: z.string().min(1),
  pickupMinute: z.string().min(1),
  pickupPeriod: z.enum(["AM", "PM"]),
  flightNumber: z.string().optional(),
  notes: z.string().max(280, "Keep notes under 280 characters").optional(),
})

const passengerSchema = z.object({
  primaryPassenger: z.string().min(1, "Enter passenger name"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(7, "Enter contact phone"),
  baggage: z.enum(["Normal", "Oversized", "Minimal"]).default("Normal"),
})

type TripForm = z.infer<typeof tripSchema>
type ScheduleForm = z.infer<typeof scheduleSchema>
type PassengerForm = z.infer<typeof passengerSchema>

type TripData = {
  direction: DirectionOption
  origin: string
  originAddress?: string
  destination: string
  destinationAddress?: string
  passengerCount: number
  vehicleSelections: VehicleOptionId[]
}

type ScheduleData = {
  pickupDate: string
  pickupTime: string
  flightNumber?: string
  notes?: string
}

type StepKey = 0 | 1 | 2 | 3 | 4

export const BookingWizard = () => {
  const [step, setStep] = useState<StepKey>(0)
  const [maxStepReached, setMaxStepReached] = useState<StepKey>(0)
  const [tripData, setTripData] = useState<TripData | null>(null)
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
  const [passengerData, setPassengerData] = useState<PassengerForm | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionDetails, setSubmissionDetails] = useState<{ paymentLink?: string | null } | null>(null)
  const [tipAmount, setTipAmount] = useState<number>(0)
  const [paymentPreference, setPaymentPreference] = useState<"pay_on_arrival" | "pay_now">("pay_on_arrival")
  const [quoteLogId, setQuoteLogId] = useState<string | null>(null)
  const [remotePricing, setRemotePricing] = useState<PricingResult | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const stepHeaderRef = useRef<HTMLDivElement | null>(null)
  const { enabled: firebaseEnabled } = useFirebaseServices()
  const navigate = useNavigate()

  const tripResolver = zodResolver(tripSchema) as Resolver<TripForm>
  const scheduleResolver = zodResolver(scheduleSchema) as Resolver<ScheduleForm>
  const passengerResolver = zodResolver(passengerSchema) as Resolver<PassengerForm>

  const scheduleDefaults = useMemo(() => buildScheduleDefaults(SOFT_NOTICE_HOURS), [])

  const createQuoteLog = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        const response = await apiFetch<{ id: string }>("/quoteLogs", {
          method: "POST",
          body: payload,
          skipAuth: true,
        })
        if (response?.id) {
          setQuoteLogId(response.id)
          return response.id
        }
      } catch (error) {
        console.error("Failed to create quote log", error)
      }
      return null
    },
    [],
  )

  const updateQuoteLog = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!quoteLogId) return
      try {
        await apiFetch(`/quoteLogs/${quoteLogId}`, {
          method: "PATCH",
          body: payload,
          skipAuth: true,
        })
      } catch (error) {
        console.error("Failed to update quote log", error)
      }
    },
    [quoteLogId],
  )

  const tripForm = useForm<TripForm>({
    resolver: tripResolver,
    defaultValues: {
      direction: directionOptions[0],
      origin: "",
      destination: "",
      passengerCount: 1,
      vehicleSelections: [vehicleOptions[0].id],
      originAddress: "",
      destinationAddress: "",
    },
  })

  const scheduleForm = useForm<ScheduleForm>({
    resolver: scheduleResolver,
    defaultValues: scheduleDefaults,
  })

  const passengerForm = useForm<PassengerForm>({
    resolver: passengerResolver,
    defaultValues: {
      baggage: "Normal",
    },
  })

  useEffect(() => {
    if (!tripData) {
      setRemotePricing(null)
      setQuoteError(null)
      setQuoteLoading(false)
      return
    }

    const preferred =
      tripData.vehicleSelections.some((selection) => vehiclePreferenceMap[selection] === "van") ?
        "van" :
        "standard"

    const controller = new AbortController()
    let active = true

    const fetchQuote = async () => {
      try {
        setRemotePricing(null)
        setQuoteLoading(true)
        setQuoteError(null)
        const result = await apiFetch<PricingResult>("/fares/quote", {
          method: "POST",
          skipAuth: true,
          signal: controller.signal,
          body: {
            direction: tripData.direction,
            origin: tripData.origin,
            destination: tripData.destination,
            passengerCount: tripData.passengerCount,
            preferredVehicle: preferred,
            originAddress: tripData.originAddress ?? null,
            destinationAddress: tripData.destinationAddress ?? null,
            suppressLog: true,
          },
        })
        if (!active) return
        setRemotePricing(result)
      } catch (error) {
        if (!active) return
        if ((error as Error).name === "AbortError") return
        console.error("Failed to refresh live pricing", error)
        setRemotePricing(null)
        setQuoteError(
          error instanceof Error ?
            error.message :
            "We couldn’t reach live pricing. Showing base rates instead.",
        )
      } finally {
        if (!active) return
        setQuoteLoading(false)
      }
    }

    void fetchQuote()

    return () => {
      active = false
      controller.abort()
    }
  }, [tripData])

  const fallbackPricing = useMemo(() => {
    if (!tripData) return null
    const preferred =
      tripData.vehicleSelections.some((selection) => vehiclePreferenceMap[selection] === "van") ?
        "van" :
        "standard"

    if (!baseDirections.includes(tripData.direction as TripDirection)) {
      return null
    }

    return calculatePricing({
      direction: tripData.direction as TripDirection,
      origin: tripData.origin,
      destination: tripData.destination,
      passengerCount: tripData.passengerCount,
      preferredVehicle: preferred,
    })
  }, [tripData])

  const pricing = remotePricing ?? (quoteLoading ? null : fallbackPricing)

  const estimatedQuote = useMemo(() => {
    if (!tripData || !pricing || pricing.baseRate == null) {
      return null
    }
    const baseRate = pricing.baseRate
    const rawBaseFare =
      (pricing.ratesTable && typeof pricing.ratesTable["1"] === "number" ?
        Math.round(pricing.ratesTable["1"]) :
        baseRate) ?? baseRate
    const baseFare = Math.max(0, rawBaseFare)
    const extraPassengers = Math.max(0, tripData.passengerCount - 1)
    const extraPassengerTotal = extraPassengers * ADDITIONAL_PASSENGER_FEE
    const roundedBaseRate = Math.round(baseRate)
    const usesDistanceFare = shouldShowDistanceFare(tripData.origin, tripData.destination)
    const rawDistanceFare = roundedBaseRate - baseFare - extraPassengerTotal
    const distanceFare = usesDistanceFare ? Math.max(0, Math.round(rawDistanceFare * 100) / 100) : 0
    const estimatedGst = Math.round(roundedBaseRate * 0.05 * 100) / 100
    return {
      baseRate: roundedBaseRate,
      baseFare,
      distanceFare,
      extraPassengers,
      extraPassengerTotal,
      perPassenger: ADDITIONAL_PASSENGER_FEE,
      estimatedGst,
    }
  }, [pricing, tripData])

  const requiresFullAddress = (value?: string | null) =>
    Boolean(value && value.toLowerCase().includes("any address"))

  const handleTripSubmit = tripForm.handleSubmit((values: TripForm) => {
    const originFinal = values.origin === otherOptionLabel ? values.originOther?.trim() : values.origin
    const destinationFinal =
      values.destination === otherOptionLabel ? values.destinationOther?.trim() : values.destination

    if (!originFinal) {
      tripForm.setError("originOther", { type: "required", message: "Enter origin" })
      return
    }
    if (!destinationFinal) {
      tripForm.setError("destinationOther", { type: "required", message: "Enter destination" })
      return
    }

    const originAddressFinal = values.originAddress?.trim()
    if (requiresFullAddress(values.origin) && !originAddressFinal) {
      tripForm.setError("originAddress", { type: "required", message: "Enter full pickup address" })
      return
    }

    const destinationAddressFinal = values.destinationAddress?.trim()
    if (requiresFullAddress(values.destination) && !destinationAddressFinal) {
      tripForm.setError("destinationAddress", {
        type: "required",
        message: "Enter full drop-off address",
      })
      return
    }

    const payload: TripData = {
      direction: values.direction,
      origin: originFinal,
      originAddress: originAddressFinal,
      destination: destinationFinal,
      destinationAddress: destinationAddressFinal,
      passengerCount: values.passengerCount,
      vehicleSelections: values.vehicleSelections,
    }

    setTripData(payload)
    goToStep(1, { scroll: true })
  })

  const handleScheduleSubmit = scheduleForm.handleSubmit((values: ScheduleForm) => {
    const pickupTime = to24Hour(values.pickupHour, values.pickupMinute, values.pickupPeriod)
    const pickupDateTime = combineDateAndTime(values.pickupDate, values.pickupHour, values.pickupMinute, values.pickupPeriod)
    const leadTimeMinutes = differenceInMinutes(pickupDateTime, new Date())
    if (!Number.isFinite(leadTimeMinutes) || leadTimeMinutes < MIN_ADVANCE_MINUTES) {
      const message = `Please choose a pickup at least ${MIN_ADVANCE_HOURS} hours from now.`
      scheduleForm.setError("pickupDate", { type: "manual", message })
      scheduleForm.setError("pickupHour", { type: "manual", message })
      scheduleForm.setError("pickupMinute", { type: "manual", message })
      return
    }
    scheduleForm.clearErrors(["pickupDate", "pickupHour", "pickupMinute"])
    const schedule: ScheduleData = {
      pickupDate: values.pickupDate,
      pickupTime,
      flightNumber: values.flightNumber,
      notes: values.notes,
    }

    setScheduleData(schedule)
    void updateQuoteLog({
      schedule: {
        pickupDate: schedule.pickupDate,
        pickupTime,
        flightNumber: schedule.flightNumber ?? null,
        notes: schedule.notes ?? null,
      },
      lastStep: 3,
    })
    goToStep(3, { scroll: true })
  })

  const handlePassengerSubmit = passengerForm.handleSubmit((values: PassengerForm) => {
    setPassengerData(values)
    setSubmitted(false)
    setSubmissionDetails(null)
    setSubmitError(null)
    setSubmittingBooking(false)
    void updateQuoteLog({
      contact: {
        name: values.primaryPassenger,
        email: values.email,
        phone: values.phone,
        baggage: values.baggage ?? "Normal",
      },
      lastStep: 4,
    })
    goToStep(4, { scroll: true })
  })

  const handleConfirm = useCallback(async () => {
    if (submitted || submittingBooking) return
    if (!tripData || !scheduleData || !passengerData) return

    const baseEstimate = pricing?.baseRate ?? null
    const gstEstimate = estimatedQuote?.estimatedGst ?? 0
    const estimatedTotalForState =
      baseEstimate != null ? baseEstimate + (paymentPreference === "pay_now" ? gstEstimate : 0) : null
    const safeTip = Number.isFinite(tipAmount) ? Math.max(0, tipAmount) : 0

    const preferredVehicle =
      tripData.vehicleSelections.some((selection) => vehiclePreferenceMap[selection] === "van") ?
        "van" :
        "standard"

    if (!firebaseEnabled) {
      void updateQuoteLog({
        lastStep: 5,
        booking: {
          id: null,
          paymentPreference,
          paymentLink: null,
          tipAmount: safeTip,
        },
      })
      navigate({
        to: "/thank-you",
        state: {
          paymentPreference,
          ...(estimatedTotalForState != null ? { total: estimatedTotalForState } : {}),
        },
      })
      return
    }

    try {
      setSubmittingBooking(true)
      setSubmitError(null)
      setSubmissionDetails(null)

      const response = await callFunction<{
        ok: boolean
        id: string
        bookingNumber?: string
        paymentLink?: { url?: string | null; orderId?: string | null } | null
        totals?: {
          baseCents: number
          gstCents: number
          tipCents: number
          totalCents: number
          currency: string
        }
      }>("createBooking", {
        method: "POST",
        body: {
          trip: {
            direction: tripData.direction,
            origin: tripData.origin,
            originAddress: tripData.originAddress ?? null,
            destination: tripData.destination,
            destinationAddress: tripData.destinationAddress ?? null,
            passengerCount: tripData.passengerCount,
            includeReturn: false,
            vehicleSelections: tripData.vehicleSelections,
            preferredVehicle,
          },
          schedule: {
            pickupDate: scheduleData.pickupDate,
            pickupTime: scheduleData.pickupTime,
            notes: scheduleData.notes ?? null,
            flightNumber: scheduleData.flightNumber ?? null,
          },
          passenger: {
            primaryPassenger: passengerData.primaryPassenger,
            email: passengerData.email,
            phone: passengerData.phone,
            baggage: passengerData.baggage ?? "Normal",
          },
          payment: {
            preference: paymentPreference,
            tipAmount: safeTip,
          },
          quoteRequestId: null,
        },
      })

      let navigateState: Record<string, unknown> | null = null

      if (response?.ok) {
        const paymentUrl = response.paymentLink?.url ?? null
        setSubmissionDetails({
          paymentLink: paymentUrl,
        })
        void updateQuoteLog({
          lastStep: 5,
          booking: {
            id: response.id ?? null,
            paymentPreference,
            paymentLink: paymentUrl,
            tipAmount: safeTip,
          },
        })

        const totalCents = response.totals?.totalCents ?? null
        navigateState = {
          paymentLink: paymentUrl ?? undefined,
          paymentPreference,
          bookingId: response.id ?? undefined,
          bookingNumber: response.bookingNumber ?? undefined,
          ...(totalCents != null ?
            { total: totalCents / 100 } :
            estimatedTotalForState != null ? { total: estimatedTotalForState } : {}),
        }
      }
      setSubmitted(true)
      if (navigateState) {
        navigate({ to: "/thank-you", state: navigateState })
      }
    } catch (error) {
      console.error(error)
      const status = typeof (error as { status?: number })?.status === "number" ? (error as { status?: number }).status : null
      if (
        (error instanceof FirebaseError && error.code === "permission-denied") ||
        status === 401 ||
        status === 403
      ) {
        setSubmitError("We couldn’t reach our booking system right now. Please call or email dispatch to finish this reservation.")
      } else {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "We couldn’t submit this booking. Please try again or contact dispatch.",
        )
      }
    } finally {
      setSubmittingBooking(false)
    }
  }, [
    firebaseEnabled,
    passengerData,
    paymentPreference,
    scheduleData,
    submitted,
    submittingBooking,
    tipAmount,
    tripData,
    updateQuoteLog,
    navigate,
    pricing,
    estimatedQuote,
  ])

  const goToStep = useCallback(
    (next: StepKey, options?: { reset?: boolean; scroll?: boolean }) => {
      if (options?.scroll) {
        requestAnimationFrame(() => {
          stepHeaderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        })
      }
      if (next < 4) {
        setSubmitted(false)
        setSubmissionDetails(null)
        setSubmitError(null)
        setSubmittingBooking(false)
      }
      setStep(next)
      setMaxStepReached((prev) => {
        if (options?.reset) return next
        return next > prev ? next : prev
      })
    },
    [],
  )

  const resetWizard = useCallback(() => {
    tripForm.reset({
      direction: directionOptions[0],
      origin: "",
      destination: "",
      passengerCount: 1,
      vehicleSelections: [determineVehicleOption(1)],
      originAddress: "",
      destinationAddress: "",
    })
    scheduleForm.reset(buildScheduleDefaults(SOFT_NOTICE_HOURS))
    passengerForm.reset({ baggage: "Normal" })
    setTripData(null)
    setScheduleData(null)
    setPassengerData(null)
    setSubmitted(false)
    setSubmittingBooking(false)
    setSubmitError(null)
    setSubmissionDetails(null)
    setTipAmount(0)
    setPaymentPreference("pay_on_arrival")
    setQuoteLogId(null)
    setRemotePricing(null)
    setQuoteError(null)
    setQuoteLoading(false)
    goToStep(0, { reset: true, scroll: true })
  }, [goToStep, passengerForm, scheduleForm, tripForm])

  const locationOptions = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    const addOption = (value: string) => {
      const key = normalizeLocationLabel(value)
      if (seen.has(key)) return
      seen.add(key)
      list.push(value)
    }
    baseDirections.forEach((direction) => {
      const origins = getOriginsForDirection(direction)
      origins.forEach((origin) => {
        addOption(origin)
        const destinations = getDestinationsForOrigin(direction, origin)
        destinations.forEach(addOption)
      })
    })
    additionalTerminals.forEach(addOption)
    return list
  }, [])

  const originOptions = useMemo(() => {
    const list = [...locationOptions]
    const otherKey = normalizeLocationLabel(otherOptionLabel)
    if (!list.some((option) => normalizeLocationLabel(option) === otherKey)) {
      list.push(otherOptionLabel)
    }
    const seen = new Set<string>()
    return list.filter((option) => {
      const key = normalizeLocationLabel(option)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [locationOptions])

  const destinationOptions = useMemo(() => {
    const list = [...locationOptions]
    const otherKey = normalizeLocationLabel(otherOptionLabel)
    if (!list.some((option) => normalizeLocationLabel(option) === otherKey)) {
      list.push(otherOptionLabel)
    }
    const seen = new Set<string>()
    return list.filter((option) => {
      const key = normalizeLocationLabel(option)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [locationOptions])

  useEffect(() => {
    if (step !== 1 || !tripData || quoteLoading) return

    const baseQuote = estimatedQuote?.baseRate ?? pricing?.baseRate ?? null

    const payload: Record<string, unknown> = {
      trip: {
        direction: tripData.direction,
        origin: tripData.origin,
        originAddress: tripData.originAddress ?? null,
        destination: tripData.destination,
        destinationAddress: tripData.destinationAddress ?? null,
        passengers: tripData.passengerCount,
        vehicleSelections: tripData.vehicleSelections,
        preferredVehicle:
          tripData.vehicleSelections?.[0] ?? determineVehicleOption(tripData.passengerCount),
        status: baseQuote != null ? "success" : "no_price",
      },
      quote:
        baseQuote != null
          ? {
              amount: baseQuote,
              baseFare: estimatedQuote?.baseFare ?? null,
              distanceFare: estimatedQuote?.distanceFare ?? null,
              extraPassengers: estimatedQuote?.extraPassengers ?? null,
              extraPassengerTotal: estimatedQuote?.extraPassengerTotal ?? null,
              estimatedGst: estimatedQuote?.estimatedGst ?? null,
              perPassenger: estimatedQuote?.perPassenger ?? null,
            }
          : { amount: null },
      lastStep: 2,
    }

    if (scheduleData) {
      payload.schedule = {
        pickupDate: scheduleData.pickupDate,
        pickupTime: scheduleData.pickupTime,
        flightNumber: scheduleData.flightNumber ?? null,
        notes: scheduleData.notes ?? null,
      }
    }

    if (passengerData) {
      payload.contact = {
        name: passengerData.primaryPassenger,
        email: passengerData.email,
        phone: passengerData.phone,
      }
    }

    if (!quoteLogId) {
      void createQuoteLog(payload)
    } else {
      void updateQuoteLog(payload)
    }
  }, [
    createQuoteLog,
    estimatedQuote,
    passengerData,
    pricing,
    quoteLoading,
    quoteLogId,
    scheduleData,
    step,
    tripData,
    updateQuoteLog,
  ])

  return (
    <div className="flex flex-col gap-6">
      <div ref={stepHeaderRef}>
        <StepHeader
          current={step}
          maxStep={maxStepReached}
          onSelect={(target) => {
            if (target > maxStepReached) return
            goToStep(target, { scroll: true })
          }}
        />
      </div>
      {step === 0 ? (
        <TripStep
          form={tripForm}
          onSubmit={handleTripSubmit}
          originOptions={originOptions}
          destinationOptions={destinationOptions}
        />
      ) : null}
      {step === 1 && tripData ? (
        <PriceQuoteStep
          trip={tripData}
          pricing={pricing}
          quote={estimatedQuote}
          loading={quoteLoading}
          error={quoteError}
          onEditTrip={() => goToStep(0, { scroll: true })}
          onContinue={() => goToStep(2, { scroll: true })}
        />
      ) : null}
      {step === 2 && tripData ? (
        <ScheduleStep
          form={scheduleForm}
          onSubmit={handleScheduleSubmit}
          direction={tripData.direction}
        />
      ) : null}
      {step === 3 ? <PassengerStep form={passengerForm} onSubmit={handlePassengerSubmit} /> : null}
      {step === 4 && tripData && scheduleData && passengerData ? (
        <ReviewStep
          trip={tripData}
          schedule={scheduleData}
          passenger={passengerData}
          pricing={pricing}
          quote={estimatedQuote}
          submitting={submittingBooking}
          submitted={submitted}
          onConfirm={handleConfirm}
          onBack={() => goToStep(3, { scroll: true })}
          onReset={resetWizard}
          error={submitError}
          tipAmount={tipAmount}
          onTipChange={setTipAmount}
          paymentPreference={paymentPreference}
          onPaymentPreferenceChange={setPaymentPreference}
          paymentLink={submissionDetails?.paymentLink ?? null}
        />
      ) : null}
    </div>
  )
}

const StepHeader = ({
  current,
  maxStep,
  onSelect,
}: {
  current: StepKey
  maxStep: StepKey
  onSelect: (step: StepKey) => void
}) => {
  const steps: Array<{ label: string }> = [
    { label: "Trip" },
    { label: "Price" },
    { label: "Schedule" },
    { label: "Passengers" },
    { label: "Review" },
  ]
  return (
    <GlassPanel className="p-4">
      <div className="flex items-center gap-4">
        {steps.map((stepItem, index) => {
          const stepIndex = index as StepKey
          const enabled = stepIndex <= maxStep
          const isActive = stepIndex === current
          return (
            <div key={stepItem.label} className="flex flex-1 items-center gap-4 min-w-0">
              <button
                type="button"
                onClick={() => (enabled ? onSelect(stepIndex) : undefined)}
                disabled={!enabled}
                className={clsx(
                  "flex h-14 w-full items-center justify-center rounded-full px-6 text-base font-bold uppercase tracking-[0.2em] transition",
                  isActive
                    ? "bg-horizon text-white shadow-glow"
                    : enabled
                      ? "border border-horizon/30 bg-white/85 text-horizon hover:border-horizon/50"
                      : "border border-horizon/20 bg-white/65 text-horizon/40",
                )}
              >
                <span>{stepItem.label}</span>
              </button>
              {index < steps.length - 1 ? (
                <span className="hidden h-px w-16 rounded bg-horizon/30 md:block" aria-hidden />
              ) : null}
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}

const TripStep = ({
  form,
  onSubmit,
  originOptions,
  destinationOptions,
}: {
  form: UseFormReturn<TripForm>
  onSubmit: () => void
  originOptions: string[]
  destinationOptions: string[]
}) => {
  const { register, formState, watch, setValue, control } = form
  const selectedOrigin = (watch("origin") ?? "").trim()
  const selectedDestination = (watch("destination") ?? "").trim()
  const passengerCount = watch("passengerCount") ?? 1
  const selectedVehicles = watch("vehicleSelections") ?? []
  const passengerLimitExceeded = Number(passengerCount) > PASSENGER_MAX

  const originGroups = useMemo(() => buildLocationGroups(originOptions), [originOptions])
  const destinationGroups = useMemo(() => buildLocationGroups(destinationOptions), [destinationOptions])

  const [pickupAcknowledged, setPickupAcknowledged] = useState(Boolean(selectedOrigin))
  const [dropoffAcknowledged, setDropoffAcknowledged] = useState(Boolean(selectedDestination))

  const originRegister = register("origin", {
    onChange: () => setPickupAcknowledged(true),
  })
  const destinationRegister = register("destination", {
    onChange: () => setDropoffAcknowledged(true),
  })

  const shouldCollectAddress = (value?: string | null) =>
    Boolean(value && value.toLowerCase().includes("any address"))

  useEffect(() => {
    if (!selectedOrigin) {
      setPickupAcknowledged(false)
    }
  }, [selectedOrigin])

  useEffect(() => {
    if (!selectedDestination) {
      setDropoffAcknowledged(false)
    }
  }, [selectedDestination])

  useEffect(() => {
    const inferredDirection =
      selectedOrigin.toLowerCase().includes("airport") && !selectedDestination.toLowerCase().includes("airport")
        ? ("From the Airport" as DirectionOption)
        : selectedDestination.toLowerCase().includes("airport")
          ? ("To the Airport" as DirectionOption)
          : form.getValues("direction")
    if (inferredDirection && inferredDirection !== form.getValues("direction")) {
      setValue("direction", inferredDirection)
    }
  }, [form, selectedDestination, selectedOrigin, setValue])

  useEffect(() => {
    if (!shouldCollectAddress(selectedOrigin)) {
      setValue("originAddress", "", { shouldValidate: true })
    }
  }, [selectedOrigin, setValue])

  useEffect(() => {
    if (!shouldCollectAddress(selectedDestination)) {
      setValue("destinationAddress", "", { shouldValidate: true })
    }
  }, [selectedDestination, setValue])

  useEffect(() => {
    const resolvedPassengerCount = Math.max(1, Number(passengerCount) || 1)
    const autoVehicle = determineVehicleOption(resolvedPassengerCount)
    if (selectedVehicles[0] !== autoVehicle || selectedVehicles.length > 1) {
      setValue("vehicleSelections", [autoVehicle], { shouldValidate: true })
    }
  }, [passengerCount, selectedVehicles, setValue])

  useEffect(() => {
    if (!Number.isFinite(Number(passengerCount))) {
      form.clearErrors("passengerCount")
      return
    }
    if (passengerLimitExceeded) {
      form.setError("passengerCount", { type: "manual", message: PASSENGER_LIMIT_MESSAGE })
    } else if (formState.errors.passengerCount?.message === PASSENGER_LIMIT_MESSAGE) {
      form.clearErrors("passengerCount")
    }
  }, [form, formState.errors.passengerCount, passengerCount, passengerLimitExceeded])

  const pickupReady = Boolean(selectedOrigin)
  const dropoffReady = Boolean(selectedDestination)
  const showDropoff = pickupAcknowledged && pickupReady
  const showPassengerCount = dropoffAcknowledged && dropoffReady

  const autoVehicle = selectedVehicles[0] ?? determineVehicleOption(Math.max(1, Number(passengerCount) || 1))
  const autoVehicleLabel = vehicleLabelMap[autoVehicle] ?? "Auto-assigned vehicle"

  return (
    <GlassPanel className="p-6">
      <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">Trip Details</h2>
      <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
        <Field
          label="Pick-up Address"
          error={formState.errors.origin?.message}
          helper="Select a pick-up location to continue."
        >
          <select
            {...originRegister}
            onBlur={() => setPickupAcknowledged(true)}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          >
            <option value="">Select pick-up address</option>
            {originGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((origin) => (
                  <option key={origin} value={origin}>
                    {origin}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedOrigin === otherOptionLabel ? (
            <input
              type="text"
              {...form.register("originOther")}
              placeholder="Enter full pick-up address"
              className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            />
          ) : null}
        </Field>

        {shouldCollectAddress(selectedOrigin) ? (
          <Field
            label="Full Pick-up Address"
            error={formState.errors.originAddress?.message}
            helper="Add the exact pick-up details, including unit number."
          >
            <Controller
              control={control}
              name="originAddress"
              render={({ field }) => (
                <PlacesAutocompleteInput
                  {...field}
                  placeholder="Full street address with unit number"
                  helperText="Search powered by Google Places."
                  onChange={(value) => field.onChange(value)}
                  onPlaceSelect={(selection) => field.onChange(selection.address)}
                  onPlaceCleared={() => field.onChange("")}
                />
              )}
            />
          </Field>
        ) : null}

        {showDropoff ? (
          <>
            <Field
              label="Drop-off Address"
              error={formState.errors.destination?.message}
              helper="Add the exact drop-off details, including unit number."
            >
          <select
            {...destinationRegister}
            onBlur={() => setDropoffAcknowledged(true)}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          >
            <option value="">Select drop-off address</option>
            {destinationGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((destination) => (
                  <option key={destination} value={destination}>
                    {destination}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
            </Field>

            {selectedDestination === otherOptionLabel ? (
              <Field label="Custom Drop-off">
                <input
                  type="text"
                  {...form.register("destinationOther")}
                  placeholder="Enter full drop-off address"
                  className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
                />
              </Field>
            ) : null}

            {shouldCollectAddress(selectedDestination) ? (
              <Field
                label="Full Drop-off Address"
                error={formState.errors.destinationAddress?.message}
                helper="Add the exact drop-off details, including unit number."
              >
                <Controller
                  control={control}
                  name="destinationAddress"
                  render={({ field }) => (
                    <PlacesAutocompleteInput
                      {...field}
                      placeholder="Full street address with unit number"
                      helperText="Search powered by Google Places."
                      onChange={(value) => field.onChange(value)}
                      onPlaceSelect={(selection) => field.onChange(selection.address)}
                      onPlaceCleared={() => field.onChange("")}
                    />
                  )}
                />
              </Field>
            ) : null}
          </>
        ) : null}

        {showPassengerCount ? (
              <Field label="Passenger Count" error={formState.errors.passengerCount?.message}>
                <input
                  type="number"
                  min={1}
                  max={PASSENGER_MAX}
              {...register("passengerCount", {
                valueAsNumber: true,
                max: { value: PASSENGER_MAX, message: PASSENGER_LIMIT_MESSAGE },
              })}
                  className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
                  onWheel={(event) => {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }}
                />
              </Field>
        ) : null}

        {showPassengerCount ? (
          <Field
            label="Vehicle Fleet"
            helper={`Auto-selected: ${autoVehicleLabel}. Adjust the passenger count if you need a different vehicle size.`}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {vehicleOptions.map((option) => {
                const isSelected = autoVehicle === option.id
                return (
                  <div
                    key={option.id}
                    className={clsx(
                      "flex h-full flex-col gap-4 rounded-3xl border px-5 py-5 transition",
                      isSelected
                        ? "border-emerald-400 bg-emerald-50/90 text-horizon shadow-glow"
                        : "border-horizon/30 bg-white/85 text-midnight/70",
                    )}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-horizon">
                          {option.label}
                        </p>
                        <p className="text-sm text-midnight/70">{option.helper}</p>
                      </div>
                      {isSelected ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
                          Auto-selected
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </Field>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              form.reset({
                direction: directionOptions[0],
                origin: "",
                destination: "",
                passengerCount: 1,
                originAddress: "",
                destinationAddress: "",
                vehicleSelections: [determineVehicleOption(1)],
              })
              setPickupAcknowledged(false)
              setDropoffAcknowledged(false)
            }}
            className="flex-1 rounded-full border border-horizon/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-white/90"
          >
            Reset Trip Details
          </button>
          <button
            type="submit"
            disabled={
              !pickupReady ||
              !dropoffReady ||
              !showPassengerCount ||
              !passengerCount ||
              passengerLimitExceeded
            }
            className="flex-1 rounded-full border border-horizon/50 bg-horizon px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90 disabled:cursor-not-allowed disabled:border-horizon/30 disabled:bg-horizon/40"
          >
            Continue to Price Quote
          </button>
        </div>
      </form>
    </GlassPanel>
  )
}


const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const PriceQuoteStep = ({
  trip,
  pricing,
  quote,
  onEditTrip,
  onContinue,
  loading,
  error,
}: {
  trip: TripData
  pricing: PricingResult | null
  quote: {
    baseRate: number
    baseFare: number
    distanceFare: number
    extraPassengers: number
    extraPassengerTotal: number
    perPassenger: number
    estimatedGst: number
  } | null
  onEditTrip: () => void
  onContinue: () => void
  loading?: boolean
  error?: string | null
}) => {
  const waitingForQuote = Boolean(loading && (!pricing || !quote))
  const quoteAvailable = Boolean(!waitingForQuote && quote && pricing?.baseRate != null)
  const passengerLabel =
    trip.passengerCount === 1 ? "1 passenger" : `${trip.passengerCount} passengers`
  const instantQuote =
    quoteAvailable ?
      quote?.baseRate ?? pricing?.baseRate ?? null :
      null
  const roundedInstantQuote = instantQuote != null ? Math.round(instantQuote) : null
  const distanceFareEnabled = shouldShowDistanceFare(trip.origin, trip.destination)

  return (
    <GlassPanel className="p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.34em] text-horizon">
          {trip.origin}
        </span>
        <span className="text-sm font-semibold text-horizon">→</span>
        <span className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.34em] text-horizon">
          {trip.destination}
        </span>
        <span className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.34em] text-horizon">
          {passengerLabel}
        </span>
      </div>

      <div className="mt-8 grid gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-horizon/70">Instant quote</p>
          <p className="mt-2 text-4xl font-bold text-horizon">
            {roundedInstantQuote != null ? formatCurrency(roundedInstantQuote) : "—"}
          </p>
          {waitingForQuote ? (
            <p className="mt-2 text-xs uppercase tracking-[0.28em] text-midnight/50">Calculating live quote…</p>
          ) : null}
          {!waitingForQuote && error ? (
            <p className="mt-2 text-xs uppercase tracking-[0.28em] text-ember/70">{error}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-horizon/15 bg-white/75 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Quote details</p>
          {waitingForQuote ? (
            <p className="mt-3 text-sm uppercase tracking-[0.28em] text-midnight/60">Calculating live quote…</p>
          ) : quoteAvailable ? (
            <div className="mt-3 space-y-2 text-sm text-midnight/80">
              <div className="flex items-center justify-between">
                <span>Base fare</span>
                <span>{formatCurrency(quote!.baseFare)}</span>
              </div>
              {distanceFareEnabled ? (
                <div className="flex items-center justify-between">
                  <span>Distance fare</span>
                  <span>{formatCurrency(quote!.distanceFare)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span>
                  Extra passengers{" "}
                  {quote!.extraPassengers > 0 ? `• ${quote!.extraPassengers} × ${formatCurrency(quote!.perPassenger)}` : ""}
                </span>
                <span>{formatCurrency(quote!.extraPassengerTotal)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-midnight/70">
              <p>We couldn’t calculate an instant fare for this route.</p>
              <p>
                Please adjust the trip details or call dispatch at{" "}
                <a className="font-semibold text-horizon underline" href="tel:+16047516688">
                  (604) 751-6688
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={!quoteAvailable}
          className="flex-1 rounded-full bg-horizon px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-horizon/90 disabled:cursor-not-allowed disabled:bg-horizon/40 md:flex-none md:px-10"
        >
          Continue to Pickup Schedule
        </button>
        <button
          type="button"
          onClick={onEditTrip}
          className="flex-1 rounded-full border border-horizon/40 bg-white px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-horizon transition hover:bg-white/90 md:flex-none md:px-10"
        >
          Edit details
        </button>
      </div>
    </GlassPanel>
  )
}

const ScheduleStep = ({
  form,
  onSubmit,
  direction,
}: {
  form: UseFormReturn<ScheduleForm>
  onSubmit: () => void
  direction: DirectionOption
}) => {
  const { register, formState, watch, setValue } = form
  const pickupPeriod = watch("pickupPeriod")

  const minSelectableDate = useMemo(() => format(addHours(new Date(), MIN_ADVANCE_HOURS), "yyyy-MM-dd"), [])
  const softNoticeDate = useMemo(() => addHours(new Date(), SOFT_NOTICE_HOURS), [])

  const hourOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")),
    [],
  )
  const minuteOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0")),
    [],
  )

  useEffect(() => {
    if (!pickupPeriod) {
      setValue("pickupPeriod", "AM")
    }
  }, [pickupPeriod, setValue])

  return (
    <GlassPanel className="p-6">
      <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">
        Pickup Schedule
      </h2>
      <p className="mt-2 text-xs text-midnight/70">
        Next available online pickup: {format(softNoticeDate, "PPP • p")}
      </p>
      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Field label="Pickup Date" error={formState.errors.pickupDate?.message}>
          <input
            type="date"
            {...register("pickupDate")}
            min={minSelectableDate}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          />
        </Field>
        <Field label="Pickup Time" error={formState.errors.pickupHour?.message}>
          <div className="flex flex-wrap items-center gap-3">
            <select
              {...register("pickupHour")}
              className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-3 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            >
              {hourOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <span className="text-lg text-horizon/60">:</span>
            <select
              {...register("pickupMinute")}
              className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-3 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            >
              {minuteOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div className="inline-flex rounded-full border border-horizon/30 bg-white/80">
              <button
                type="button"
                onClick={() => setValue("pickupPeriod", "AM")}
                className={clsx(
                  "px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em]",
                  pickupPeriod === "AM" ? "bg-horizon text-white" : "text-horizon",
                )}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setValue("pickupPeriod", "PM")}
                className={clsx(
                  "px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em]",
                  pickupPeriod === "PM" ? "bg-horizon text-white" : "text-horizon",
                )}
              >
                PM
              </button>
            </div>
          </div>
        </Field>
        <Field
          label={direction === "From the Airport" ? "Departure Flight Number" : "Arrival Flight Number"}
          helper="(If arriving at an airport only)"
        >
          <input
            type="text"
            {...register("flightNumber")}
            placeholder="AC 123"
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          />
        </Field>
        <Field label="Special Notes" error={formState.errors.notes?.message} className="sm:col-span-2">
          <textarea
            {...register("notes")}
            rows={4}
            placeholder="Accessibility requirements, additional pickup details..."
            className="w-full rounded-2xl border border-horizon/30 bg-white/80 px-4 py-3 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          />
        </Field>
        <div className="sm:col-span-2 flex gap-3">
          <button
            type="button"
            onClick={() => form.reset(buildScheduleDefaults(SOFT_NOTICE_HOURS))}
            className="flex-1 rounded-full border border-horizon/20 bg-white/70 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-white/90"
          >
            Reset
          </button>
          <button
            type="submit"
            className="flex-1 rounded-full border border-horizon/50 bg-horizon py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90"
          >
            Continue to Passengers
          </button>
        </div>
      </form>
    </GlassPanel>
  )
}


const PassengerStep = ({
  form,
  onSubmit,
}: {
  form: UseFormReturn<PassengerForm>
  onSubmit: () => void
}) => {
  const { register, formState } = form

  return (
    <GlassPanel className="p-6">
      <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">
        Passenger Details
      </h2>
      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Field label="Primary Passenger" error={formState.errors.primaryPassenger?.message}>
          <input
            type="text"
            {...register("primaryPassenger")}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          />
        </Field>
        <Field label="Email" error={formState.errors.email?.message}>
          <input
            type="email"
            {...register("email")}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          />
        </Field>
        <Field label="Phone" error={formState.errors.phone?.message}>
          <input
            type="tel"
            {...register("phone")}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          />
        </Field>
        <Field label="Baggage Profile">
          <select
            {...register("baggage")}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          >
            <option value="Normal">Normal</option>
            <option value="Oversized">Oversized</option>
            <option value="Minimal">Minimal</option>
          </select>
        </Field>
        <div className="sm:col-span-2 flex gap-3">
          <button
            type="submit"
            className="flex-1 rounded-full border border-horizon/50 bg-horizon py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90"
          >
            Continue to Review
          </button>
        </div>
      </form>
    </GlassPanel>
  )
}

const ReviewStep = ({
  trip,
  schedule,
  passenger,
  pricing,
  quote,
  tipAmount,
  onTipChange,
  paymentPreference,
  onPaymentPreferenceChange,
  onConfirm,
  onBack,
  onReset,
  submitting,
  submitted,
  error,
  paymentLink,
}: {
  trip: TripData
  schedule: ScheduleData
  passenger: PassengerForm
  pricing: PricingResult | null
  quote: {
    baseRate: number
    baseFare: number
    distanceFare: number
    extraPassengers: number
    extraPassengerTotal: number
    perPassenger: number
    estimatedGst: number
  } | null
  tipAmount: number
  onTipChange: (value: number) => void
  paymentPreference: "pay_on_arrival" | "pay_now"
  onPaymentPreferenceChange: (value: "pay_on_arrival" | "pay_now") => void
  onConfirm: () => void
  onBack: () => void
  onReset: () => void
  submitting: boolean
  submitted: boolean
  error: string | null
  paymentLink: string | null
}) => {
  const vehicleSummary = trip.vehicleSelections.map((vehicle) => vehicleLabelMap[vehicle] ?? vehicle).join(", ")
  const scheduleDate = new Date(`${schedule.pickupDate}T${schedule.pickupTime}`)
  const scheduleDisplay = Number.isNaN(scheduleDate.getTime()) ? "TBD" : format(scheduleDate, "PPP • p")
  const distanceFareEnabled = shouldShowDistanceFare(trip.origin, trip.destination)

  const baseFare = quote?.baseFare ?? null
  const extraPassengers = quote?.extraPassengers ?? Math.max(0, trip.passengerCount - 1)
  const extraPassengerTotal = quote?.extraPassengerTotal ?? extraPassengers * ADDITIONAL_PASSENGER_FEE
  const distanceFare =
    quote?.distanceFare ??
    (groupTotal != null && baseFare != null ? Math.max(0, groupTotal - baseFare - extraPassengerTotal) : 0)
  const renderedDistanceFare = distanceFareEnabled ? distanceFare : 0
  const estimatedGst = quote?.estimatedGst ?? 0
  const groupTotal = quote?.baseRate ?? pricing?.baseRate ?? null
  const safeTip = Number.isFinite(tipAmount) ? Math.max(0, tipAmount) : 0
  const showGst = paymentPreference === "pay_now"
  const gstForDisplay = showGst ? estimatedGst : 0
  const finalTotal = groupTotal != null ? groupTotal + gstForDisplay + safeTip : null
  const roundedFinalTotal = finalTotal != null ? Math.round(finalTotal) : null
  const confirmLabel =
    submitted ?
      "Request Sent" :
      submitting ?
        "Submitting..." :
        paymentPreference === "pay_now" ?
          "Confirm & Generate Payment Link" :
          "Confirm Booking"
  const hasPaymentLink = Boolean(paymentLink)
  const payNowDisabled = groupTotal == null
  const notes = schedule.notes?.trim()
  const formattedNotes = notes && notes.length > 0 ? notes : "None"

  const handleTipInputChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const parsed = Number.parseFloat(event.target.value)
    onTipChange(Number.isNaN(parsed) ? 0 : Math.max(0, parsed))
  }

  const finalTotalLabel =
    roundedFinalTotal != null ?
      `${formatCurrency(roundedFinalTotal)} for ${trip.passengerCount} passenger${trip.passengerCount === 1 ? "" : "s"}` :
      "TBD"

  return (
    <GlassPanel className="p-6">
      <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">Review</h2>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SummaryCard title="Scheduling Info">
          <dl className="space-y-2 text-base text-midnight/80">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Pickup</dt>
              <dd className="mt-1 text-base sm:mt-0">{scheduleDisplay}</dd>
            </div>
            {schedule.flightNumber ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Flight</dt>
                <dd className="mt-1 text-base sm:mt-0">{schedule.flightNumber}</dd>
              </div>
            ) : null}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Special Notes</dt>
              <dd className="mt-1 text-base text-midnight/70 sm:mt-0">{formattedNotes}</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Total Passengers</dt>
              <dd className="mt-1 text-base sm:mt-0">{trip.passengerCount}</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Vehicle Type</dt>
              <dd className="mt-1 text-base sm:mt-0">{vehicleSummary}</dd>
            </div>
          </dl>
        </SummaryCard>

        <SummaryCard title="Trip Info">
          <dl className="space-y-3 text-base text-midnight/80">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Pickup</dt>
              <dd className="mt-1">
                {trip.origin}
                {trip.originAddress ? (
                  <span className="block text-xs text-midnight/60">{trip.originAddress}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Drop-off</dt>
              <dd className="mt-1">
                {trip.destination}
                {trip.destinationAddress ? (
                  <span className="block text-xs text-midnight/60">{trip.destinationAddress}</span>
                ) : null}
              </dd>
            </div>
          </dl>
        </SummaryCard>

        <SummaryCard title="Passenger Info">
          <dl className="space-y-2 text-base text-midnight/80">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Primary Passenger</dt>
              <dd className="mt-1">{passenger.primaryPassenger}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Contact Email</dt>
              <dd className="mt-1">{passenger.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Contact Phone</dt>
              <dd className="mt-1">{passenger.phone}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">Baggage</dt>
              <dd className="mt-1">{passenger.baggage}</dd>
            </div>
          </dl>
        </SummaryCard>

        <SummaryCard title="Final Quote">
          {groupTotal != null ? (
            <div className="space-y-3 text-base text-midnight/80">
              <div className="flex items-center justify-between">
                <span>Base fare</span>
                <span>{baseFare != null ? formatCurrency(baseFare) : "—"}</span>
              </div>
              {distanceFareEnabled ? (
                <div className="flex items-center justify-between">
                  <span>Distance fare</span>
                  <span>{formatCurrency(renderedDistanceFare)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span>
                  Extra passengers
                  {extraPassengers > 0 ? ` • ${extraPassengers} × ${formatCurrency(quote?.perPassenger ?? 0)}` : ""}
                </span>
                <span>{formatCurrency(extraPassengerTotal)}</span>
              </div>
              {showGst ? (
                <div className="flex items-center justify-between">
                  <span>Estimated GST (5%)</span>
                  <span>{formatCurrency(gstForDisplay)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <label htmlFor="tip-amount" className="text-sm font-medium text-midnight/80">
                  Optional tip
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="tip-amount"
                    type="number"
                    min={0}
                    step={1}
                    value={safeTip}
                    onChange={handleTipInputChange}
                    className="h-10 w-24 rounded-full border border-horizon/30 bg-white px-3 text-right text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
                  />
                  <span className="text-sm text-midnight/70">CAD</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-horizon/20 pt-3 font-semibold text-midnight">
                <span>Final Total</span>
                <span>{finalTotalLabel}</span>
              </div>
            </div>
          ) : (
            <p className="text-base text-midnight/70">We&apos;ll provide a custom quote within minutes.</p>
          )}
        </SummaryCard>

        <SummaryCard title="Payment Method" className="lg:col-span-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row">
              <button
                type="button"
                onClick={() => onPaymentPreferenceChange("pay_on_arrival")}
                aria-pressed={paymentPreference === "pay_on_arrival"}
                className={clsx(
                  "flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] transition",
                  paymentPreference === "pay_on_arrival"
                    ? "border-horizon bg-horizon text-white shadow-glow"
                    : "border-horizon/40 bg-white/80 text-horizon hover:border-horizon/60",
                )}
              >
                Pay driver (cash or card)
              </button>
              <button
                type="button"
                onClick={() => onPaymentPreferenceChange("pay_now")}
                aria-pressed={paymentPreference === "pay_now"}
                disabled={payNowDisabled}
                className={clsx(
                  "flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] transition",
                  paymentPreference === "pay_now"
                    ? "border-horizon bg-horizon text-white shadow-glow"
                    : "border-horizon/40 bg-white/80 text-horizon hover:border-horizon/60",
                  payNowDisabled ? "cursor-not-allowed opacity-60 hover:border-horizon/40" : "",
                )}
              >
                Pay online now
              </button>
            </div>
            <p className="text-xs text-midnight/70">
              Tips are optional and can be adjusted at pickup. Choosing pay online now will generate a secure Square
              checkout link.
            </p>
          </div>
        </SummaryCard>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-full border border-horizon/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-white/90"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-full border border-glacier/40 bg-white/60 px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-glacier transition hover:bg-white/90"
        >
          Start Over
        </button>
        <button
          onClick={() => {
            void onConfirm()
          }}
          disabled={submitted || submitting || (payNowDisabled && paymentPreference === "pay_now")}
          className="flex-1 rounded-full border border-horizon/50 bg-horizon px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90 disabled:cursor-not-allowed disabled:border-horizon/30 disabled:bg-horizon/40"
        >
          {confirmLabel}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-ember/30 bg-ember/10 p-4 text-sm text-ember">{error}</div>
      ) : null}

      {submitted ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-glacier/40 bg-glacier/15 p-4 text-base text-midnight/80">
          {hasPaymentLink ? (
            <>
              <p>Your booking request is confirmed. Continue below to finalize payment.</p>
              <a
                href={paymentLink ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-horizon/50 bg-horizon px-6 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90"
              >
                Open Secure Payment Link
              </a>
            </>
          ) : (
            <p>
              Your booking has been staged. Our dispatch team will contact you shortly with next steps or to arrange
              payment.
            </p>
          )}
        </div>
      ) : null}
    </GlassPanel>
  )
}

const Field = ({
  label,
  error,
  helper,
  children,
  className,
}: {
  label: string
  error?: string
  helper?: string
  children: ReactNode
  className?: string
}) => (
  <div className={clsx("flex flex-col gap-2", className)}>
    <span className="text-xs font-semibold uppercase tracking-[0.3em] text-horizon/80">{label}</span>
    {children}
    {helper ? (
      <span className="text-base text-midnight/70">{helper}</span>
    ) : null}
    {error ? <span className="text-xs text-ember">{error}</span> : null}
  </div>
)

const SummaryCard = ({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) => (
  <div className={clsx("rounded-2xl border border-horizon/20 bg-white/70 p-4 text-base text-midnight/80", className)}>
    <p className="text-lg font-semibold uppercase tracking-[0.22em] text-horizon/80">{title}</p>
    <div className="mt-2 space-y-1 text-base">{children}</div>
  </div>
)
