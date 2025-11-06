import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { queueEmailNotification } from "./notifications";

const DEFAULT_DISPATCH_EMAIL = process.env.DISPATCH_EMAIL ?? "info@valleyairporter.ca";

const resolveDispatchActor = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const displayName =
    typeof record.displayName === "string" && record.displayName.trim().length > 0
      ? record.displayName.trim()
      : null;
  if (displayName) return displayName;
  const email =
    typeof record.email === "string" && record.email.trim().length > 0
      ? record.email.trim()
      : null;
  if (email) return email;
  const uid =
    typeof record.uid === "string" && record.uid.trim().length > 0
      ? record.uid.trim()
      : null;
  return uid;
};

export const handleQuoteRequestCreated = onDocumentCreated("quoteRequests/{quoteId}", async (event) => {
  const data = event.data?.data();
  if (!data) {
    logger.warn("quoteRequests onCreate missing data", { id: event.params.quoteId });
    return;
  }
  if (data.dispatchNotifiedAt) return;
  const dispatchEmail = DEFAULT_DISPATCH_EMAIL;
  if (!dispatchEmail) {
    logger.warn("Dispatch email not configured; skipping quote alert", { id: event.params.quoteId });
    return;
  }
  const trip = data.trip ?? {};
  const passenger = data.passenger ?? {};
  const schedule = data.schedule ?? {};
  const subject = `Manual quote request – ${trip.origin ?? "Unknown"} → ${trip.destination ?? "Unknown"}`;
  const lines = [
    `Quote ID: ${event.params.quoteId}`,
    `Direction: ${trip.direction ?? ""}`,
    `Route: ${trip.origin ?? ""} → ${trip.destination ?? ""}`,
    `Passengers: ${trip.passengerCount ?? "n/a"}`,
    `Pickup: ${schedule.pickupDate ?? ""} ${schedule.pickupTime ?? ""}`,
    `Passenger: ${passenger.name ?? ""} (${passenger.email ?? "no email"})`,
    `Phone: ${passenger.phone ?? "n/a"}`,
  ];

  await queueEmailNotification({
    to: dispatchEmail,
    subject,
    text: lines.join("\n"),
    html: lines.join("<br/>") + `<p>Respond from the admin portal to approve or decline.</p>`
  });

  await event.data?.ref.set(
    {
      dispatchNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
});

export const handleQuoteRequestUpdated = onDocumentUpdated("quoteRequests/{quoteId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after) return;
  const prevStatus = (before?.response?.status ?? "").toLowerCase();
  const nextStatus = (after.response?.status ?? "").toLowerCase();
  if (!nextStatus || prevStatus === nextStatus) return;
  if (nextStatus !== "approved" && nextStatus !== "declined") return;
  const passengerEmail = after.passenger?.email;
  if (!passengerEmail) return;
  const trip = after.trip ?? {};
  const amountCents = typeof after.response?.amountCents === "number" ? after.response.amountCents : null;
  const operatorLabel = resolveDispatchActor(after.response?.decidedBy);
  const lines = [
    `Request ID: ${event.params.quoteId}`,
    `Route: ${trip.origin ?? ""} → ${trip.destination ?? ""}`,
  ];
  if (nextStatus === "approved") {
    const amountDisplay = amountCents != null ? `$${(amountCents / 100).toFixed(2)} CAD` : "custom";
    lines.push(`Approved amount: ${amountDisplay}`);
    if (after.response?.message) {
      lines.push(`Notes: ${after.response.message}`);
    }
    if (operatorLabel) {
      lines.push(`Reviewed by: ${operatorLabel}`);
    }
  } else {
    lines.push(
      after.response?.message ??
        "We couldn’t approve this fare automatically. Please contact dispatch to continue your booking.",
    );
    if (operatorLabel) {
      lines.push(`Reviewed by: ${operatorLabel}`);
    }
  }

  await queueEmailNotification({
    to: passengerEmail,
    subject:
      nextStatus === "approved"
        ? "Your Valley Airporter quote is ready"
        : "Update on your Valley Airporter quote",
    text: lines.join("\n"),
    html: lines.join("<br/>") + `<p>You can return to the booking form to continue.</p>`
  });
});
