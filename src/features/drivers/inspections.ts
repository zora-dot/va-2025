import { useCallback, useEffect, useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/useAuth"
import { apiFetch } from "@/lib/api/rest"

export interface DriverInspection {
  id: string
  driverId: string
  vehicleId?: string | null
  odometer?: number | null
  notes?: string | null
  issues?: string[]
  submittedAt?: number | null
  checklist?: Record<string, boolean>
}

export const useDriverInspections = (limitCount = 10) => {
  const auth = useAuth()
  const [inspections, setInspections] = useState<DriverInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const driverId = auth.user?.uid ?? null
  const canQuery = useMemo(() => Boolean(driverId), [driverId])

  const fetchInspections = useCallback(async () => {
    if (!driverId) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<{ inspections?: DriverInspection[] } | DriverInspection[]>(
        "/driver-inspections",
        {
          method: "GET",
          params: {
            driverId,
            limit: limitCount,
          },
        },
      )
      const parsed =
        Array.isArray(response) ? response : response.inspections ?? []
      setInspections(parsed)
    } catch (fetchError) {
      setError(fetchError as Error)
      setInspections([])
    } finally {
      setLoading(false)
    }
  }, [driverId, limitCount])

  useEffect(() => {
    if (!canQuery) {
      setInspections([])
      setLoading(false)
      return
    }
    void fetchInspections()
  }, [canQuery, fetchInspections, refreshToken])

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1)
  }, [])

  return { inspections, loading, error, refresh }
}

export interface CreateInspectionPayload {
  vehicleId?: string
  odometer?: number
  checklist?: Record<string, boolean>
  issues?: string[]
  notes?: string
}

export const useCreateDriverInspection = () => {
  const auth = useAuth()

  const mutationFn = useCallback(
    async (payload: CreateInspectionPayload) => {
      if (!auth.user?.uid) {
        throw new Error("You need to be signed in as a driver.")
      }

      const body = {
        driverId: auth.user.uid,
        vehicleId: payload.vehicleId ?? undefined,
        odometer: typeof payload.odometer === "number" ? payload.odometer : undefined,
        notes: payload.notes?.trim() || undefined,
        issues: payload.issues?.length ? payload.issues : undefined,
        checklist: payload.checklist,
      }

      await apiFetch("/driver-inspections", {
        method: "POST",
        body,
      })
    },
    [auth.user?.uid],
  )

  return useMutation({ mutationFn })
}
