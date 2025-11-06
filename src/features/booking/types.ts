import type { TripDirection } from "@/features/booking/pricing"

export type TripData = {
  direction: TripDirection | string
  origin: string
  originAddress?: string
  destination: string
  destinationAddress?: string
  passengerCount: number
  vehicleSelections: string[]
  preferredVehicle?: "standard" | "van"
}

export type ScheduleData = {
  pickupDate: string
  pickupTime: string
  flightNumber?: string | null
  notes?: string | null
}

export type PassengerData = {
  primaryPassenger: string
  email: string
  phone: string
  baggage?: string
}

export type PaymentPreference = "pay_on_arrival" | "pay_now"
