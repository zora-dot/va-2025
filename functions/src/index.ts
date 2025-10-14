import {setGlobalOptions} from "firebase-functions"
import {onRequest} from "firebase-functions/https"
import {onDocumentCreated} from "firebase-functions/v2/firestore"
import * as logger from "firebase-functions/logger"
import * as admin from "firebase-admin"
import nodemailer from "nodemailer"

// Configure general options
setGlobalOptions({maxInstances: 10})

// Initialize the Admin SDK
admin.initializeApp()

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "587")
const SMTP_SECURE =
  process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1" || SMTP_PORT === 465
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const NOTIFY_TO = process.env.NOTIFY_TO ?? "info@valleyairporter.ca"
const NOTIFY_FROM = process.env.NOTIFY_FROM ?? "Valley Airporter <info@valleyairporter.ca>"

const createTransporter = () => {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn("SMTP configuration missing. Email notifications are disabled.")
    return null
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
}

let transporter = createTransporter()

const ensureTransporter = () => {
  if (!transporter) {
    transporter = createTransporter()
  }
  return transporter
}

const sendNotificationEmail = async (
  subject: string,
  text: string,
  html: string,
): Promise<boolean> => {
  const mailTransporter = ensureTransporter()
  if (!mailTransporter) {
    logger.warn("Skipping email notification because transporter is not configured.")
    return false
  }

  try {
    await mailTransporter.sendMail({
      from: NOTIFY_FROM,
      to: NOTIFY_TO,
      subject,
      text,
      html,
    })
    return true
  } catch (error) {
    logger.error("Failed to send notification email", error)
    return false
  }
}

const asLine = (label: string, value?: string | null) =>
  value ? `${label}: ${value}` : `${label}: —`

export const onContactMessageCreated = onDocumentCreated(
  "contactMessages/{messageId}",
  async (event) => {
    const snapshot = event.data
    if (!snapshot) {
      logger.warn("Contact message snapshot missing.")
      return
    }

    const data = snapshot.data() as Record<string, unknown>
    const fullName = (data.fullName as string) ?? "Unknown"
    const email = data.email as string | undefined
    const phone = data.phone as string | undefined
    const subject = (data.subject as string) ?? "New Contact Request"
    const message = (data.message as string) ?? ""

    const text = [
      `New Valley Airporter contact form submission`,
      "",
      asLine("Name", fullName),
      asLine("Email", email),
      asLine("Phone", phone),
      "",
      `Subject: ${subject}`,
      "",
      message,
    ].join("\n")

    const html = `
      <p><strong>New Valley Airporter contact form submission</strong></p>
      <ul>
        <li><strong>Name:</strong> ${fullName}</li>
        <li><strong>Email:</strong> ${email ?? "—"}</li>
        <li><strong>Phone:</strong> ${phone ?? "—"}</li>
      </ul>
      <p><strong>Subject:</strong> ${subject}</p>
      <p>${message.replace(/\n/g, "<br/>")}</p>
    `

    const sent = await sendNotificationEmail(
      `New contact request from ${fullName}`,
      text,
      html,
    )

    try {
      await snapshot.ref.update({
        notificationStatus: sent ? "sent" : "error",
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    } catch (error) {
      logger.error("Failed to update contact message notification status", error)
    }
  },
)

export const onBookingCreated = onDocumentCreated("bookings/{bookingId}", async (event) => {
  const snapshot = event.data
  if (!snapshot) {
    logger.warn("Booking snapshot missing.")
    return
  }

  const data = snapshot.data() as {
    trip?: Record<string, unknown>
    schedule?: Record<string, unknown>
    passenger?: Record<string, unknown>
    pricing?: Record<string, unknown> | null
  }

  const trip = data.trip ?? {}
  const schedule = data.schedule ?? {}
  const passenger = data.passenger ?? {}
  const pricing = data.pricing ?? null

  const direction = (trip.direction as string) ?? "Trip"
  const passengerCountValue = trip.passengerCount
  const passengerCount =
    typeof passengerCountValue === "number"
      ? passengerCountValue
      : typeof passengerCountValue === "string"
        ? passengerCountValue
        : "—"
  const passengerCount =
    typeof trip.passengerCount === "number" ? trip.passengerCount : trip.passengerCount ?? "—"
  const origin = trip.origin as string | undefined
  const originAddress = trip.originAddress as string | undefined
  const destination = trip.destination as string | undefined
  const destinationAddress = trip.destinationAddress as string | undefined
  const includeReturn = Boolean(trip.includeReturn)
  const returnOrigin = trip.returnOrigin as string | undefined
  const returnDestination = trip.returnDestination as string | undefined
  const returnOriginAddress = trip.returnOriginAddress as string | undefined
  const returnDestinationAddress = trip.returnDestinationAddress as string | undefined
  const pickupWindow = [schedule.pickupDate, schedule.pickupTime].filter(Boolean).join(" • ")
  const returnWindow = [schedule.returnPickupDate, schedule.returnPickupTime]
    .filter(Boolean)
    .join(" • ")
  const vehicleSummary = Array.isArray(trip.vehicleSummary)
    ? (trip.vehicleSummary as string[]).join(", ")
    : Array.isArray(trip.vehicleSelections)
      ? (trip.vehicleSelections as string[]).join(", ")
      : "Not specified"
  const flightNumber = schedule.flightNumber as string | undefined
  const notes = schedule.notes as string | undefined
  const baseRate = pricing && typeof pricing.baseRate === "number" ? pricing.baseRate : null

  const text = [
    `New Valley Airporter booking request`,
    "",
    `Direction: ${direction}`,
    `Passengers: ${passengerCount}`,
    `Vehicles: ${vehicleSummary}`,
    "",
    `Pickup: ${pickupWindow || "—"}`,
    `Pickup Origin: ${origin ?? "—"}`,
    asLine("Origin Address", originAddress),
    `Destination: ${destination ?? "—"}`,
    asLine("Destination Address", destinationAddress),
    "",
    includeReturn
      ? [
          "Return Trip:",
          asLine("Return Route", `${returnOrigin ?? "—"} → ${returnDestination ?? "—"}`),
          asLine("Return Pickup Window", returnWindow || undefined),
          asLine("Return Pickup Address", returnOriginAddress),
          asLine("Return Drop-off Address", returnDestinationAddress),
        ].join("\n")
      : "Return Trip: Not requested",
    "",
    asLine("Flight Number", flightNumber),
    asLine("Notes", notes),
    "",
    "Passenger:",
    asLine("Primary", passenger.primaryPassenger as string | undefined),
    asLine("Email", passenger.email as string | undefined),
    asLine("Phone", passenger.phone as string | undefined),
    asLine("Baggage", passenger.baggage as string | undefined),
    "",
    baseRate != null ? `Quoted Base Rate: $${baseRate}` : "Quoted Base Rate: Custom quote required",
  ]
    .filter(Boolean)
    .join("\n")

  const html = `
    <p><strong>New Valley Airporter booking request</strong></p>
    <h4>Trip Overview</h4>
    <ul>
      <li><strong>Direction:</strong> ${direction}</li>
      <li><strong>Passengers:</strong> ${passengerCount}</li>
      <li><strong>Vehicles:</strong> ${vehicleSummary}</li>
    </ul>
    <h4>Pickup</h4>
    <ul>
      <li><strong>Window:</strong> ${pickupWindow || "—"}</li>
      <li><strong>Origin:</strong> ${origin ?? "—"}</li>
      <li><strong>Origin Address:</strong> ${originAddress ?? "—"}</li>
      <li><strong>Destination:</strong> ${destination ?? "—"}</li>
      <li><strong>Destination Address:</strong> ${destinationAddress ?? "—"}</li>
    </ul>
    ${
      includeReturn
        ? `<h4>Return Trip</h4>
    <ul>
      <li><strong>Route:</strong> ${returnOrigin ?? "—"} → ${returnDestination ?? "—"}</li>
      <li><strong>Window:</strong> ${returnWindow || "—"}</li>
      <li><strong>Pickup Address:</strong> ${returnOriginAddress ?? "—"}</li>
      <li><strong>Drop-off Address:</strong> ${returnDestinationAddress ?? "—"}</li>
    </ul>`
        : "<p><strong>Return Trip:</strong> Not requested</p>"
    }
    <h4>Passenger</h4>
    <ul>
      <li><strong>Name:</strong> ${passenger.primaryPassenger ?? "—"}</li>
      <li><strong>Email:</strong> ${passenger.email ?? "—"}</li>
      <li><strong>Phone:</strong> ${passenger.phone ?? "—"}</li>
      <li><strong>Baggage:</strong> ${passenger.baggage ?? "—"}</li>
    </ul>
    ${flightNumber ? `<p><strong>Flight:</strong> ${flightNumber}</p>` : ""}
    ${notes ? `<p><strong>Notes:</strong> ${notes.replace(/\n/g, "<br/>")}</p>` : ""}
    <p><strong>Quoted Base Rate:</strong> ${
      baseRate != null ? `$${baseRate}` : "Custom quote required"
    }</p>
  `

  const sent = await sendNotificationEmail("New booking request received", text, html)

  try {
    await snapshot.ref.update({
      notificationStatus: sent ? "sent" : "error",
      notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (error) {
    logger.error("Failed to update booking notification status", error)
  }
})

export const healthCheck = onRequest((request, response) => {
  logger.info("Valley Airporter health check", {path: request.path})
  response.status(200).send("Valley Airporter Functions Ready")
})
