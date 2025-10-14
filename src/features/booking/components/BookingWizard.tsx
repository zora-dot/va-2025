import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { z } from "zod"
import { useForm, type Resolver, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { addDoc, collection, serverTimestamp } from "firebase/firestore"
import { GlassPanel } from "@/components/ui/GlassPanel"
import {
  calculatePricing,
  getDestinationsForOrigin,
  getOriginsForDirection,
  getAvailableDirections,
} from "@/features/booking/pricing"
import type { TripDirection, PricingResult } from "@/features/booking/pricing"
import { format } from "date-fns"
import { clsx } from "clsx"
import { useFirebaseServices } from "@/app/providers/FirebaseContext"
import { CheckCircle2 } from "lucide-react"

const baseDirections = getAvailableDirections()
const extraDirections = ["Ferry Terminal", "Cruise Terminal"] as const
const directionOptions = [...baseDirections, ...extraDirections] as const
type DirectionOption = (typeof directionOptions)[number]
const otherOptionLabel = "Other (please specify)"
const additionalTerminals = [
  "Abbotsford International Airport (YXX)",
  "Vancouver International Airport (YVR)",
  "Bellingham International Airport (BLI)",
  "Tsawwassen Ferry Terminal",
  "Horseshoe Bay Ferry Terminal",
  "Canada Place Cruise Terminal",
]

const vehicleOptions = [
  {
    id: "sevenVan",
    label: "7-Seater Van (up to 6 passengers)",
    helper: "Plenty of room for families and carry-ons.",
  },
  {
    id: "multiSeven",
    label: "Multiple 7-Seater Vans (up to 6 passengers per van)",
    helper: "Ideal for staggered pickups and group events.",
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
  multiSeven: "van",
  chevyExpress: "van",
  mercedesSprinter: "van",
  freightlinerSprinter: "van",
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
  origin: z.string().min(1, "Select an origin"),
  originOther: z.string().optional(),
  originAddress: z.string().optional(),
  destination: z.string().min(1, "Select a destination"),
  destinationOther: z.string().optional(),
  destinationAddress: z.string().optional(),
  passengerCount: z.coerce.number().min(1).max(14),
  vehicleSelections: z.array(vehicleSelectionEnum).min(1, "Select at least one vehicle"),
  includeReturn: z.boolean().optional(),
  returnOrigin: z.string().optional(),
  returnOriginOther: z.string().optional(),
  returnOriginAddress: z.string().optional(),
  returnDestination: z.string().optional(),
  returnDestinationOther: z.string().optional(),
  returnDestinationAddress: z.string().optional(),
})

const scheduleSchema = z.object({
  pickupDate: z.string().min(1, "Choose a pickup date"),
  pickupHour: z.string().min(1),
  pickupMinute: z.string().min(1),
  pickupPeriod: z.enum(["AM", "PM"]),
  flightNumber: z.string().optional(),
  notes: z.string().max(280, "Keep notes under 280 characters").optional(),
  returnPickupDate: z.string().optional(),
  returnPickupHour: z.string().optional(),
  returnPickupMinute: z.string().optional(),
  returnPickupPeriod: z.enum(["AM", "PM"]).optional(),
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
  includeReturn: boolean
  returnOrigin?: string
  returnOriginAddress?: string
  returnDestination?: string
  returnDestinationAddress?: string
}

type ScheduleData = {
  pickupDate: string
  pickupTime: string
  flightNumber?: string
  notes?: string
  returnPickupDate?: string
  returnPickupTime?: string
}

type StepKey = 0 | 1 | 2 | 3

export const BookingWizard = () => {
  const [step, setStep] = useState<StepKey>(0)
  const [tripData, setTripData] = useState<TripData | null>(null)
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
  const [passengerData, setPassengerData] = useState<PassengerForm | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { firestore, enabled: firebaseEnabled } = useFirebaseServices()

  const tripResolver = zodResolver(tripSchema) as Resolver<TripForm>
  const scheduleResolver = zodResolver(scheduleSchema) as Resolver<ScheduleForm>
  const passengerResolver = zodResolver(passengerSchema) as Resolver<PassengerForm>

  const tripForm = useForm<TripForm>({
    resolver: tripResolver,
    defaultValues: {
      direction: directionOptions[0],
      passengerCount: 2,
      vehicleSelections: [vehicleOptions[0].id],
      includeReturn: false,
      originAddress: "",
      destinationAddress: "",
      returnOriginAddress: "",
      returnDestinationAddress: "",
    },
  })

  const scheduleForm = useForm<ScheduleForm>({
    resolver: scheduleResolver,
    defaultValues: {
      pickupDate: format(new Date(), "yyyy-MM-dd"),
      pickupHour: "09",
      pickupMinute: "00",
      pickupPeriod: "AM",
    },
  })

  const passengerForm = useForm<PassengerForm>({
    resolver: passengerResolver,
    defaultValues: {
      baggage: "Normal",
    },
  })

  const pricing = useMemo(() => {
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

    let returnOriginFinal: string | undefined
    let returnDestinationFinal: string | undefined
    let returnOriginAddressFinal: string | undefined
    let returnDestinationAddressFinal: string | undefined

    const includeReturn = Boolean(values.includeReturn)
    if (includeReturn) {
      const returnOriginRaw = values.returnOrigin === otherOptionLabel ? values.returnOriginOther?.trim() : values.returnOrigin
      const returnDestinationRaw =
        values.returnDestination === otherOptionLabel ? values.returnDestinationOther?.trim() : values.returnDestination

      returnOriginFinal = returnOriginRaw || destinationFinal
      returnDestinationFinal = returnDestinationRaw || originFinal

      const returnOriginNeedsAddress = requiresFullAddress(values.returnOrigin ?? returnOriginRaw)
      const returnDestinationNeedsAddress = requiresFullAddress(values.returnDestination ?? returnDestinationRaw)

      returnOriginAddressFinal = values.returnOriginAddress?.trim()
      returnDestinationAddressFinal = values.returnDestinationAddress?.trim()

      if (returnOriginNeedsAddress && !returnOriginAddressFinal) {
        tripForm.setError("returnOriginAddress", {
          type: "required",
          message: "Enter full return pickup address",
        })
        return
      }
      if (returnDestinationNeedsAddress && !returnDestinationAddressFinal) {
        tripForm.setError("returnDestinationAddress", {
          type: "required",
          message: "Enter full return drop-off address",
        })
        return
      }
    }

    const payload: TripData = {
      direction: values.direction,
      origin: originFinal,
      originAddress: originAddressFinal,
      destination: destinationFinal,
      destinationAddress: destinationAddressFinal,
      passengerCount: values.passengerCount,
      vehicleSelections: values.vehicleSelections,
      includeReturn,
      returnOrigin: returnOriginFinal,
      returnOriginAddress: returnOriginAddressFinal,
      returnDestination: returnDestinationFinal,
      returnDestinationAddress: returnDestinationAddressFinal,
    }

    setTripData(payload)
    setStep(1)
  })

  const handleScheduleSubmit = scheduleForm.handleSubmit((values: ScheduleForm) => {
    const pickupTime = to24Hour(values.pickupHour, values.pickupMinute, values.pickupPeriod)
    const schedule: ScheduleData = {
      pickupDate: values.pickupDate,
      pickupTime,
      flightNumber: values.flightNumber,
      notes: values.notes,
    }

    if (tripData?.includeReturn) {
      const missingFields: string[] = []
      if (!values.returnPickupDate) missingFields.push("returnPickupDate")
      if (!values.returnPickupHour) missingFields.push("returnPickupHour")
      if (!values.returnPickupMinute) missingFields.push("returnPickupMinute")
      if (!values.returnPickupPeriod) missingFields.push("returnPickupPeriod")

      if (missingFields.length > 0) {
        missingFields.forEach((field) => {
          scheduleForm.setError(field as keyof ScheduleForm, {
            type: "required",
            message: "Required for return trip",
          })
        })
        return
      }

      schedule.returnPickupDate = values.returnPickupDate
      schedule.returnPickupTime = to24Hour(
        values.returnPickupHour!,
        values.returnPickupMinute!,
        values.returnPickupPeriod!,
      )
    }

    setScheduleData(schedule)
    setStep(2)
  })

  const handlePassengerSubmit = passengerForm.handleSubmit((values: PassengerForm) => {
    setPassengerData(values)
    setStep(3)
  })

  const handleConfirm = useCallback(async () => {
    if (submitted || submittingBooking) return
    if (!tripData || !scheduleData || !passengerData) return

    if (!firebaseEnabled || !firestore) {
      setSubmitError("Booking was recorded locally. Please call dispatch at (604) 751-6688 to finalize while we connect services.")
      setSubmitted(true)
      return
    }

    try {
      setSubmittingBooking(true)
      setSubmitError(null)

      const vehicleSummary = tripData.vehicleSelections.map(
        (vehicle) => vehicleLabelMap[vehicle] ?? vehicle,
      )

      await addDoc(collection(firestore, "bookings"), {
        createdAt: serverTimestamp(),
        status: "pending",
        trip: {
          direction: tripData.direction,
          origin: tripData.origin,
          originAddress: tripData.originAddress ?? null,
          destination: tripData.destination,
          destinationAddress: tripData.destinationAddress ?? null,
          passengerCount: tripData.passengerCount,
          includeReturn: tripData.includeReturn,
          returnOrigin: tripData.returnOrigin ?? null,
          returnOriginAddress: tripData.returnOriginAddress ?? null,
          returnDestination: tripData.returnDestination ?? null,
          returnDestinationAddress: tripData.returnDestinationAddress ?? null,
          vehicleSelections: tripData.vehicleSelections,
          vehicleSummary,
        },
        schedule: {
          pickupDate: scheduleData.pickupDate,
          pickupTime: scheduleData.pickupTime,
          flightNumber: scheduleData.flightNumber ?? null,
          notes: scheduleData.notes ?? null,
          returnPickupDate: scheduleData.returnPickupDate ?? null,
          returnPickupTime: scheduleData.returnPickupTime ?? null,
        },
        passenger: {
          ...passengerData,
        },
        pricing: pricing
          ? {
              baseRate: pricing.baseRate,
              vehicleKey: pricing.vehicleKey,
              availableVehicles: pricing.availableVehicles,
              ratesTable: pricing.ratesTable ?? null,
            }
          : null,
      })

      setSubmitted(true)
    } catch (error) {
      console.error(error)
      setSubmitError(
        error instanceof Error
          ? error.message
          : "We couldn’t submit this booking. Please try again or contact dispatch.",
      )
    } finally {
      setSubmittingBooking(false)
    }
  }, [
    firestore,
    firebaseEnabled,
    passengerData,
    pricing,
    scheduleData,
    submitted,
    submittingBooking,
    tripData,
  ])

  const resetWizard = useCallback(() => {
    tripForm.reset({
      direction: directionOptions[0],
      passengerCount: 2,
      vehicleSelections: [vehicleOptions[0].id],
      includeReturn: false,
      originAddress: "",
      destinationAddress: "",
      returnOriginAddress: "",
      returnDestinationAddress: "",
    })
    scheduleForm.reset({
      pickupDate: format(new Date(), "yyyy-MM-dd"),
      pickupHour: "09",
      pickupMinute: "00",
      pickupPeriod: "AM",
    })
    passengerForm.reset({ baggage: "Normal" })
    setTripData(null)
    setScheduleData(null)
    setPassengerData(null)
    setSubmitted(false)
    setSubmittingBooking(false)
    setSubmitError(null)
    setStep(0)
  }, [passengerForm, scheduleForm, tripForm])

  const directionValue = tripForm.watch("direction") ?? directionOptions[0]
  const originValue = tripForm.watch("origin")

  const pricingDirection = useMemo(() => {
    return baseDirections.includes(directionValue as TripDirection)
      ? (directionValue as TripDirection)
      : (baseDirections[0] as TripDirection)
  }, [directionValue])

  const origins = useMemo(() => getOriginsForDirection(pricingDirection), [pricingDirection])
  const destinations = useMemo(
    () => getDestinationsForOrigin(pricingDirection, originValue ?? origins[0] ?? ""),
    [pricingDirection, originValue, origins],
  )

  const originOptions = useMemo(() => {
    const list = [...origins]
    additionalTerminals.forEach((option) => {
      if (!list.includes(option)) {
        list.push(option)
      }
    })
    if (!list.includes(otherOptionLabel)) list.push(otherOptionLabel)
    return list
  }, [origins])

  const destinationOptions = useMemo(() => {
    const list = [...destinations]
    additionalTerminals.forEach((option) => {
      if (!list.includes(option)) {
        list.push(option)
      }
    })
    if (!list.includes(otherOptionLabel)) list.push(otherOptionLabel)
    return list
  }, [destinations])

  return (
    <div className="flex flex-col gap-6">
      <StepHeader current={step} />
      {step === 0 ? (
        <TripStep
          form={tripForm}
          onSubmit={handleTripSubmit}
          originOptions={originOptions}
          destinationOptions={destinationOptions}
        />
      ) : null}
      {step === 1 && tripData ? (
        <ScheduleStep
          form={scheduleForm}
          onSubmit={handleScheduleSubmit}
          includeReturn={tripData.includeReturn}
          direction={tripData.direction}
        />
      ) : null}
      {step === 2 ? <PassengerStep form={passengerForm} onSubmit={handlePassengerSubmit} /> : null}
      {step === 3 && tripData && scheduleData && passengerData ? (
        <ReviewStep
          trip={tripData}
          schedule={scheduleData}
          passenger={passengerData}
          pricing={pricing}
          submitting={submittingBooking}
          submitted={submitted}
          onConfirm={handleConfirm}
          onBack={() => setStep(2)}
          onReset={resetWizard}
          error={submitError}
        />
      ) : null}
    </div>
  )
}

const StepHeader = ({ current }: { current: StepKey }) => {
  const steps = ["Trip", "Schedule", "Passengers", "Review"]
  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between gap-4">
        {steps.map((label, index) => (
          <div key={label} className="flex items-center gap-4">
            <div
              className={clsx(
                "flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-[0.3em] transition",
                index === current
                  ? "bg-horizon text-white shadow-glow"
                  : "border border-horizon/30 bg-white/70 text-horizon",
              )}
            >
              <span className="text-[0.65rem]">{String(index + 1).padStart(2, "0")}</span>
              <span>{label}</span>
            </div>
            {index < steps.length - 1 ? (
              <span className="hidden h-px w-16 rounded bg-horizon/30 md:block" aria-hidden />
            ) : null}
          </div>
        ))}
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
  const { register, formState, watch, setValue, resetField } = form
  const selectedOrigin = watch("origin")
  const selectedDestination = watch("destination")
  const includeReturn = watch("includeReturn")
  const direction = watch("direction")
  const selectedReturnOrigin = watch("returnOrigin")
  const selectedReturnDestination = watch("returnDestination")
  const selectedVehicles = watch("vehicleSelections") ?? []

  const shouldCollectAddress = (value?: string | null) =>
    Boolean(value && value.toLowerCase().includes("any address"))

  useEffect(() => {
    if (!selectedOrigin && originOptions.length > 0) {
      setValue("origin", originOptions[0])
    }
  }, [originOptions, selectedOrigin, setValue])

  useEffect(() => {
    if (!selectedDestination && destinationOptions.length > 0) {
      setValue("destination", destinationOptions[0])
    }
  }, [destinationOptions, selectedDestination, setValue])

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
    if (!selectedVehicles || selectedVehicles.length === 0) {
      setValue("vehicleSelections", [vehicleOptions[0].id])
    }
  }, [selectedVehicles, setValue])

  useEffect(() => {
    if (includeReturn) {
      if (!selectedReturnOrigin) {
        setValue("returnOrigin", destinationOptions[0] ?? otherOptionLabel)
      }
      if (!selectedReturnDestination) {
        setValue("returnDestination", originOptions[0] ?? otherOptionLabel)
      }
    } else {
      resetField("returnOriginAddress")
      resetField("returnDestinationAddress")
    }
  }, [
    includeReturn,
    originOptions,
    destinationOptions,
    selectedReturnOrigin,
    selectedReturnDestination,
    setValue,
    resetField,
  ])

  useEffect(() => {
    if (!includeReturn || !shouldCollectAddress(selectedReturnOrigin)) {
      setValue("returnOriginAddress", "", { shouldValidate: true })
    }
  }, [includeReturn, selectedReturnOrigin, setValue])

  useEffect(() => {
    if (!includeReturn || !shouldCollectAddress(selectedReturnDestination)) {
      setValue("returnDestinationAddress", "", { shouldValidate: true })
    }
  }, [includeReturn, selectedReturnDestination, setValue])

  const toggleVehicle = (id: VehicleOptionId) => {
    const isSelected = selectedVehicles.includes(id)
    if (isSelected) {
      if (selectedVehicles.length === 1) return
      setValue(
        "vehicleSelections",
        selectedVehicles.filter((value) => value !== id),
        { shouldValidate: true },
      )
    } else {
      setValue("vehicleSelections", [...selectedVehicles, id], { shouldValidate: true })
    }
  }

  return (
    <GlassPanel className="p-6">
      <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">
        Trip Details
      </h2>
      <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={onSubmit}>
        <Field label="Direction">
          <select
            {...register("direction")}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          >
            {directionOptions.map((directionOption) => (
              <option key={directionOption} value={directionOption}>
                {directionOption}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Passengers" error={formState.errors.passengerCount?.message}>
          <input
            type="number"
            min={1}
            max={14}
            {...register("passengerCount", { valueAsNumber: true })}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          />
        </Field>
        <Field
          label="Origin"
          error={formState.errors.origin?.message ?? formState.errors.originAddress?.message}
          helper={shouldCollectAddress(selectedOrigin) ? "Add the exact pickup address, including unit number." : undefined}
        >
          <select
            {...register("origin")}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          >
            {originOptions.map((origin) => (
              <option key={origin} value={origin}>
                {origin}
              </option>
            ))}
          </select>
          {selectedOrigin === otherOptionLabel ? (
            <input
              {...register("originOther")}
              placeholder="Enter full pickup address (include unit #)"
              className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            />
          ) : null}
          {shouldCollectAddress(selectedOrigin) ? (
            <input
              {...register("originAddress")}
              placeholder="Full street address with unit number"
              className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            />
          ) : null}
        </Field>
        <Field
          label="Destination"
          error={
            formState.errors.destination?.message ?? formState.errors.destinationAddress?.message
          }
          helper={shouldCollectAddress(selectedDestination) ? "Add the full drop-off address with unit number." : undefined}
        >
          <select
            {...register("destination")}
            className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
          >
            {destinationOptions.map((destination) => (
              <option key={destination} value={destination}>
                {destination}
              </option>
            ))}
          </select>
          {selectedDestination === otherOptionLabel ? (
            <input
              {...register("destinationOther")}
              placeholder="Enter full drop-off address (include unit #)"
              className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            />
          ) : null}
          {shouldCollectAddress(selectedDestination) ? (
            <input
              {...register("destinationAddress")}
              placeholder="Full drop-off address with unit number"
              className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
            />
          ) : null}
        </Field>
        <Field
          label="Vehicle Fleet"
          helper="Select every vehicle configuration you need for this trip."
          error={formState.errors.vehicleSelections?.message}
          className="lg:col-span-2"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {vehicleOptions.map((option) => {
              const isSelected = selectedVehicles.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleVehicle(option.id)}
                  aria-pressed={isSelected}
                  className={clsx(
                    "group relative flex h-full flex-col gap-3 rounded-3xl px-5 py-5 text-left transition",
                    isSelected
                      ? "border-[3px] border-emerald-400 bg-emerald-50/90 text-horizon shadow-glow"
                      : "border border-horizon/30 bg-white/85 text-midnight hover:border-horizon/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <span className="text-sm font-semibold uppercase tracking-[0.25em]">
                        {option.label}
                      </span>
                      <span className="text-base text-midnight/70">{option.helper}</span>
                    </div>
                    <CheckCircle2
                      className={clsx(
                        "h-8 w-8 text-emerald-500 transition duration-200",
                        isSelected ? "opacity-100 scale-100" : "opacity-0 scale-75",
                      )}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Add Return Trip" className="lg:col-span-2">
          <div className="flex items-center gap-2 rounded-2xl border border-horizon/30 bg-white/70 px-4 py-3 text-base text-midnight">
            <input type="checkbox" {...register("includeReturn")} className="h-4 w-4" />
            <span className="text-midnight/80">Schedule a return pickup</span>
          </div>
        </Field>
        {includeReturn ? (
          <div className="lg:col-span-2 grid gap-4 lg:grid-cols-2">
            <Field
              label={
                direction === "To the Airport"
                  ? "Return Origin"
                  : direction === "From the Airport"
                    ? "Return Destination"
                    : "Return Origin"
              }
              error={
                formState.errors.returnOrigin?.message ??
                formState.errors.returnOriginAddress?.message
              }
              helper={
                shouldCollectAddress(selectedReturnOrigin)
                  ? "Enter the return pickup address with unit number."
                  : undefined
              }
            >
              <select
                {...register("returnOrigin")}
                className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
              >
                {destinationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {selectedReturnOrigin === otherOptionLabel ? (
                <input
                  {...register("returnOriginOther")}
                  placeholder="Enter full return pickup address"
                  className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
                />
              ) : null}
              {shouldCollectAddress(selectedReturnOrigin) ? (
                <input
                  {...register("returnOriginAddress")}
                  placeholder="Return pickup address with unit number"
                  className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
                />
              ) : null}
            </Field>
            <Field
              label={
                direction === "From the Airport"
                  ? "Return Origin"
                  : "Return Destination"
              }
              error={
                formState.errors.returnDestination?.message ??
                formState.errors.returnDestinationAddress?.message
              }
              helper={
                shouldCollectAddress(selectedReturnDestination)
                  ? "Enter the return drop-off address with unit number."
                  : undefined
              }
            >
              <select
                {...register("returnDestination")}
                className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
              >
                {originOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {selectedReturnDestination === otherOptionLabel ? (
                <input
                  {...register("returnDestinationOther")}
                  placeholder="Enter full return drop-off address"
                  className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
                />
              ) : null}
              {shouldCollectAddress(selectedReturnDestination) ? (
                <input
                  {...register("returnDestinationAddress")}
                  placeholder="Return drop-off address with unit number"
                  className="mt-3 h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
                />
              ) : null}
            </Field>
          </div>
        ) : null}
        <div className="lg:col-span-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              form.reset({
      direction: directionOptions[0],
                passengerCount: 2,
                vehicleSelections: [vehicleOptions[0].id],
                includeReturn: false,
                originAddress: "",
                destinationAddress: "",
                returnOriginAddress: "",
                returnDestinationAddress: "",
              })
            }}
            className="flex-1 rounded-full border border-horizon/20 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-white/90"
          >
            Reset Trip Details
          </button>
          <button
            type="submit"
            className="flex-1 rounded-full border border-horizon/50 bg-horizon px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90"
          >
            Continue to Schedule
          </button>
        </div>
      </form>
    </GlassPanel>
  )
}

const ScheduleStep = ({
  form,
  onSubmit,
  includeReturn,
  direction,
}: {
  form: UseFormReturn<ScheduleForm>
  onSubmit: () => void
  includeReturn: boolean
  direction: DirectionOption
}) => {
  const { register, formState, watch, setValue } = form
  const pickupPeriod = watch("pickupPeriod")
  const returnPeriod = watch("returnPickupPeriod")

  const hourOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")),
    [],
  )
  const minuteOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0")),
    [],
  )

  useEffect(() => {
    if (!includeReturn) {
      setValue("returnPickupDate", "")
      setValue("returnPickupHour", "")
      setValue("returnPickupMinute", "")
      setValue("returnPickupPeriod", undefined)
    } else {
      const currentDate = form.getValues("returnPickupDate") || form.getValues("pickupDate")
      const currentHour = form.getValues("returnPickupHour") || form.getValues("pickupHour")
      const currentMinute = form.getValues("returnPickupMinute") || form.getValues("pickupMinute")
      const currentPeriod = form.getValues("returnPickupPeriod") || form.getValues("pickupPeriod")
      setValue("returnPickupDate", currentDate)
      setValue("returnPickupHour", currentHour)
      setValue("returnPickupMinute", currentMinute)
      setValue("returnPickupPeriod", currentPeriod)
    }
  }, [includeReturn, form, setValue])

  return (
    <GlassPanel className="p-6">
      <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">
        Pickup Schedule
      </h2>
      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Field label="Pickup Date" error={formState.errors.pickupDate?.message}>
          <input
            type="date"
            {...register("pickupDate")}
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
        {includeReturn ? (
          <>
            <Field label="Return Pickup Date" error={formState.errors.returnPickupDate?.message}>
              <input
                type="date"
                {...register("returnPickupDate")}
                className="h-12 rounded-2xl border border-horizon/30 bg-white/80 px-4 text-base text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/30"
              />
            </Field>
            <Field
              label="Return Pickup Time"
              error={formState.errors.returnPickupHour?.message}
            >
              <div className="flex flex-wrap items-center gap-3">
                <select
                  {...register("returnPickupHour")}
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
                  {...register("returnPickupMinute")}
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
                    onClick={() => setValue("returnPickupPeriod", "AM")}
                    className={clsx(
                      "px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em]",
                      returnPeriod === "AM" ? "bg-horizon text-white" : "text-horizon",
                    )}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue("returnPickupPeriod", "PM")}
                    className={clsx(
                      "px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em]",
                      returnPeriod === "PM" ? "bg-horizon text-white" : "text-horizon",
                    )}
                  >
                    PM
                  </button>
                </div>
              </div>
            </Field>
          </>
        ) : null}
        <div className="sm:col-span-2 flex gap-3">
          <button
            type="button"
            onClick={() => form.reset({
              pickupDate: format(new Date(), "yyyy-MM-dd"),
              pickupHour: "09",
              pickupMinute: "00",
              pickupPeriod: "AM",
            })}
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
  onConfirm,
  onBack,
  onReset,
  submitting,
  submitted,
  error,
}: {
  trip: TripData
  schedule: ScheduleData
  passenger: PassengerForm
  pricing: PricingResult | null
  onConfirm: () => void
  onBack: () => void
  onReset: () => void
  submitting: boolean
  submitted: boolean
  error: string | null
}) => {
  const vehicleSummary = trip.vehicleSelections.map((vehicle) => vehicleLabelMap[vehicle] ?? vehicle).join(", ")

  return (
    <GlassPanel className="p-6">
      <h2 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">Review</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <SummaryCard title="Trip">
          <p className="font-semibold text-midnight">{trip.direction}</p>
          <div className="space-y-2 text-base text-midnight/80">
            <div>
              <span className="font-semibold text-midnight">Pickup:</span> {trip.origin}
              {trip.originAddress ? (
                <span className="block text-xs text-midnight/60">{trip.originAddress}</span>
              ) : null}
            </div>
            <div>
              <span className="font-semibold text-midnight">Drop-off:</span> {trip.destination}
              {trip.destinationAddress ? (
                <span className="block text-xs text-midnight/60">{trip.destinationAddress}</span>
              ) : null}
            </div>
            {trip.includeReturn && trip.returnOrigin && trip.returnDestination ? (
              <div>
                <span className="font-semibold text-midnight">Return:</span> {trip.returnOrigin} → {trip.returnDestination}
                {trip.returnOriginAddress ? (
                  <span className="block text-xs text-midnight/60">Pickup: {trip.returnOriginAddress}</span>
                ) : null}
                {trip.returnDestinationAddress ? (
                  <span className="block text-xs text-midnight/60">Drop-off: {trip.returnDestinationAddress}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <p>{trip.passengerCount} passengers</p>
          <p>Fleet: {vehicleSummary}</p>
        </SummaryCard>
        <SummaryCard title="Schedule">
          <p>
            {format(new Date(`${schedule.pickupDate}T${schedule.pickupTime}`), "PPP • p")}
          </p>
          {trip.includeReturn && schedule.returnPickupDate && schedule.returnPickupTime ? (
            <p>
              Return pickup: {format(new Date(`${schedule.returnPickupDate}T${schedule.returnPickupTime}`), "PPP • p")}
            </p>
          ) : null}
          {schedule.flightNumber ? <p>Flight: {schedule.flightNumber}</p> : null}
          {schedule.notes ? <p className="text-base text-midnight/70">Notes: {schedule.notes}</p> : null}
        </SummaryCard>
        <SummaryCard title="Passenger">
          <p>{passenger.primaryPassenger}</p>
          <p>{passenger.email}</p>
          <p>{passenger.phone}</p>
          <p>Baggage: {passenger.baggage}</p>
        </SummaryCard>
        <SummaryCard title="Quote">
          {pricing?.baseRate ? (
            <>
              <p className="text-2xl font-semibold text-horizon">${pricing.baseRate.toFixed(2)} CAD</p>
              <p className="text-xs text-midnight/70">
                Vehicle tier: {pricing.vehicleKey ?? "TBD"} · taxes and surcharges calculated at checkout
              </p>
            </>
          ) : (
            <p>We&apos;ll provide a custom quote within minutes.</p>
          )}
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
          disabled={submitted || submitting}
          className="flex-1 rounded-full border border-horizon/50 bg-horizon px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white transition hover:border-horizon/60 hover:bg-horizon/90 disabled:cursor-not-allowed disabled:border-horizon/30 disabled:bg-horizon/40"
        >
          {submitted ? "Request Sent" : submitting ? "Submitting..." : "Confirm & Continue to Payment"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-ember/30 bg-ember/10 p-4 text-sm text-ember">
          {error}
        </div>
      ) : null}

      {submitted ? (
        <div className="mt-4 rounded-2xl border border-glacier/40 bg-glacier/15 p-4 text-base text-midnight/80">
          Your booking has been staged. We will redirect you to payment once Square integration is connected.
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
}: {
  title: string
  children: ReactNode
}) => (
  <div className="rounded-2xl border border-horizon/20 bg-white/70 p-4 text-base text-midnight/80">
    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-horizon/80">{title}</p>
    <div className="mt-2 space-y-1 text-base">{children}</div>
  </div>
)
