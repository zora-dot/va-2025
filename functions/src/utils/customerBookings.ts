import * as admin from "firebase-admin"

const db = admin.firestore()

const resolveCustomerUid = (data: admin.firestore.DocumentData | undefined): string | null => {
  if (!data) return null
  const user = data.user
  if (!user || typeof user !== "object") return null
  const uid = (user as { uid?: unknown }).uid
  return typeof uid === "string" && uid.trim().length ? uid : null
}

export const syncCustomerBooking = async (bookingId: string): Promise<void> => {
  const bookingSnap = await db.collection("bookings").doc(bookingId).get()
  if (!bookingSnap.exists) return
  const bookingData = bookingSnap.data()
  if (!bookingData) return
  const uid = resolveCustomerUid(bookingData)
  if (!uid) return
  await db
    .collection("customers")
    .doc(uid)
    .collection("bookings")
    .doc(bookingId)
    .set(
      {
        ...bookingData,
        mirroredAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
}

export const removeCustomerBooking = async (bookingId: string): Promise<void> => {
  const bookingSnap = await db.collection("bookings").doc(bookingId).get()
  if (!bookingSnap.exists) return
  const bookingData = bookingSnap.data()
  const uid = resolveCustomerUid(bookingData)
  if (!uid) return
  await db.collection("customers").doc(uid).collection("bookings").doc(bookingId).delete()
}
