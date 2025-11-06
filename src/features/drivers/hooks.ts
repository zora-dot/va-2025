import { useEffect, useMemo, useState } from "react"
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from "firebase/firestore"
import { useFirebase } from "@/lib/hooks/useFirebase"
import { useAuth } from "@/lib/hooks/useAuth"

export interface DriverProfile {
  id: string
  name: string
  status?: string | null
  rating?: string | number | null
  vehicle?: string | null
  phone?: string | null
  email?: string | null
  active?: boolean | null
  note?: string | null
  dutyStatus?: "on" | "off" | "break" | null
  shiftStart?: number | null
  shiftEnd?: number | null
  compliance?: {
    licenseExpiresAt?: number | null
    insuranceExpiresAt?: number | null
    airportPermitExpiresAt?: number | null
  }
}

const driverConverter: FirestoreDataConverter<DriverProfile> = {
  toFirestore(driver: DriverProfile): DocumentData {
    return driver
  },
  fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>) {
    const data = snapshot.data() ?? {}
    const normalizeTimestamp = (value: unknown): number | null => {
      if (!value) return null
      if (typeof value === "number") return value
      if (value instanceof Date) return value.getTime()
      if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
        try {
          return (value as { toMillis: () => number }).toMillis()
        } catch {
          return null
        }
      }
      return null
    }
    const shift = data.shift ?? {}
    const compliance = data.compliance ?? {}
    return {
      id: snapshot.id,
      name:
        typeof data.name === "string"
          ? data.name
          : typeof data.fullName === "string"
            ? data.fullName
            : "Unnamed driver",
      status: typeof data.status === "string" ? data.status : null,
      rating: data.rating ?? null,
      vehicle:
        typeof data.vehicle === "string"
          ? data.vehicle
          : typeof data.vehicleLabel === "string"
            ? data.vehicleLabel
            : null,
      phone:
        typeof data.phone === "string"
          ? data.phone
          : typeof data.phoneNumber === "string"
            ? data.phoneNumber
            : null,
      email:
        typeof data.email === "string"
          ? data.email
          : typeof data.contactEmail === "string"
            ? data.contactEmail
            : null,
      active:
        typeof data.active === "boolean"
          ? data.active
          : typeof data.isActive === "boolean"
            ? data.isActive
            : null,
      note: typeof data.note === "string" ? data.note : null,
      dutyStatus:
        typeof data.dutyStatus === "string"
          ? (data.dutyStatus as DriverProfile["dutyStatus"])
          : null,
      shiftStart: normalizeTimestamp(shift.start ?? data.shiftStart),
      shiftEnd: normalizeTimestamp(shift.end ?? data.shiftEnd),
      compliance: {
        licenseExpiresAt: normalizeTimestamp(
          compliance.licenseExpiresAt ?? compliance.licenseExpiry ?? compliance.license,
        ),
        insuranceExpiresAt: normalizeTimestamp(
          compliance.insuranceExpiresAt ?? compliance.insuranceExpiry ?? compliance.insurance,
        ),
        airportPermitExpiresAt: normalizeTimestamp(
          compliance.airportPermitExpiresAt ??
            compliance.airportPermitExpiry ??
            compliance.airportPermit,
        ),
      },
    }
  },
}

export const useDriversDirectory = () => {
  const firebase = useFirebase()
  const auth = useAuth()
  const [drivers, setDrivers] = useState<DriverProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const canRead = useMemo(
    () => firebase.enabled && Boolean(firebase.firestore) && auth.hasRole("admin"),
    [firebase.enabled, firebase.firestore, auth],
  )

  useEffect(() => {
    if (!canRead || !firebase.firestore) {
      setDrivers([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const ref = collection(firebase.firestore, "drivers").withConverter(driverConverter)
    const q = query(ref, orderBy("name", "asc"))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setDrivers(snapshot.docs.map((doc) => doc.data()))
        setLoading(false)
      },
      (snapshotError) => {
        setError(snapshotError)
        setDrivers([])
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [canRead, firebase.firestore])

  return { drivers, loading, error }
}
