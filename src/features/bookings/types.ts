export interface BookingTrip {
  direction?: string
  origin?: string
  originAddress?: string | null
  destination?: string
  destinationAddress?: string | null
  passengerCount?: number
  includeReturn?: boolean
  returnOrigin?: string | null
  returnOriginAddress?: string | null
  returnDestination?: string | null
  returnDestinationAddress?: string | null
  vehicleSelections?: string[]
  preferredVehicle?: "standard" | "van"
}

export interface BookingSchedule {
  pickupDate?: string
  pickupTime?: string
  pickupTimestamp?: number | null
  flightNumber?: string | null
  notes?: string | null
  returnPickupDate?: string | null
  returnPickupTime?: string | null
  returnPickupTimestamp?: number | null
}

export interface BookingPassenger {
  primaryPassenger?: string
  email?: string
  phone?: string
  baggage?: string
  specialNotes?: string | null
}

export interface BookingAdjustmentReason {
  code?: string
  label?: string
  note?: string | null
  additionalNote?: string | null
  submittedAt?: number | null
  submittedBy?: BookingStatusActor | null
  secondApprovalRequired?: boolean
  secondApprover?: {
    uid?: string | null
    name?: string | null
  } | null
}

export interface BookingPayment {
  preference?: "pay_on_arrival" | "pay_now"
  baseCents?: number
  gstCents?: number
  tipCents?: number
  tipAmountCents?: number
  totalCents?: number
  currency?: string
  link?: string | null
  adjustedManually?: boolean
  adjustmentNote?: string | null
  adjustedBy?: string | null
  adjustedByName?: string | null
  adjustedAt?: number | null
  adjustmentReason?: BookingAdjustmentReason | null
}

export interface BookingPricing {
  baseRate?: number | null
  vehicleKey?: string | null
  distanceDetails?: {
    km?: number | null
    durationMinutes?: number | null
  } | null
  breakdown?: {
    baseFare?: number | null
    additionalPassengerCharge?: number | null
    distanceCharge?: number | null
    extraKilometerCharge?: number | null
    total?: number | null
  } | null
}

export interface BookingAssignment {
  driverId?: string | null
  driverName?: string | null
  assignedAt?: number | null
  driverPhone?: string | null
  driverEmail?: string | null
}

export interface BookingStatusActor {
  uid?: string | null
  role?: string | null
  name?: string | null
}

export interface BookingStatusHistoryEntry {
  status: string
  timestamp?: number | null
  actor?: BookingStatusActor | null
  note?: string | null
  reasonCode?: string | null
  reasonNote?: string | null
}

export interface BookingItem {
  id: string
  status?: string
  bookingNumber?: number | null
  trip: BookingTrip
  schedule: BookingSchedule
  passenger: BookingPassenger
  payment: BookingPayment
  assignment: BookingAssignment
  createdAt?: number | null
  updatedAt?: number | null
  statusHistory?: BookingStatusHistoryEntry[]
  paymentLink?: string | null
  pricing?: BookingPricing | null
  system?: {
    notifications?: {
      email?: {
        bookingConfirmation?: {
          sent?: boolean
          at?: number | null
          mailId?: string | null
          subject?: string | null
          to?: string[]
          cc?: string[]
          lastResentBy?: BookingStatusActor | null
          lastResentAt?: number | null
          resendCount?: number | null
        }
        driverAssignment?: {
          sent?: boolean
          at?: number | null
          driverMailId?: string | null
          driverTo?: string[]
          customerMailId?: string | null
          customerTo?: string[]
        }
        statusChange?: {
          sent?: boolean
          at?: number | null
          mailId?: string | null
          to?: string[]
        }
      }
      sms?: {
        driverAssignment?: {
          sent?: boolean
          at?: number | null
          to?: string | null
        }
        statusChange?: {
          sent?: boolean
          at?: number | null
          to?: string | null
        }
      }
      push?: {
        driverAssignment?: {
          sent?: boolean
          at?: number | null
          target?: string | null
        }
        statusChange?: {
          sent?: boolean
          at?: number | null
          target?: string | null
        }
      }
      statusChange?: {
        status?: string
        at?: number | null
        actor?: BookingStatusActor | null
        reasonCode?: string | null
        reasonNote?: string | null
      }
    }
    quoteRequest?: {
      id?: string | null
      approvedAmountCents?: number | null
      approvedAt?: number | null
      approvedBy?: {
        uid?: string | null
        email?: string | null
        displayName?: string | null
      } | null
    } | null
    guardrails?: {
      pricing?: {
        reasonCode?: string | null
        reasonNote?: string | null
        additionalNote?: string | null
        currency?: string | null
        amounts?: {
          baseCents?: number
          gstCents?: number
          tipCents?: number
          totalCents?: number
        }
        submittedAt?: number | null
        submittedBy?: BookingStatusActor | null
        secondApproval?: {
          required?: boolean
          status?: "pending" | "approved"
          approved?: boolean
          requestedAt?: number | null
          requestedBy?: BookingStatusActor | null
          approvedAt?: number | null
          approver?: BookingStatusActor | null
          reasonCode?: string | null
          reasonNote?: string | null
          additionalNote?: string | null
        } | null
      }
    }
  }
}

export interface ListBookingsResponse {
  items: BookingItem[]
  nextCursor: string | null
}

export type BookingScope = "upcoming" | "past" | "all"

export interface ListBookingsParams {
  scope?: BookingScope
  limit?: number
  status?: string
  cursor?: string
}
