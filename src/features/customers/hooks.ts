import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/lib/hooks/useAuth"
import { apiFetch } from "@/lib/api/rest"

export interface CustomerPreferences {
  [key: string]: boolean | string | number | null
}

export interface CustomerNotifications {
  email?: boolean
  sms?: boolean
  calendar?: boolean
  [key: string]: boolean | undefined
}

export interface CustomerDocument {
  id: string
  filename: string
  contentType?: string | null
  sizeBytes?: number | null
  uploadedAt?: number | null
  downloadUrl?: string | null
  [key: string]: unknown
}

interface UploadTargetResponse {
  uploadUrl: string
  documentId?: string
  headers?: Record<string, string>
}

const PROFILE_INCOMPLETE_CODE = "PROFILE_INCOMPLETE"

interface ApiErrorLike extends Error {
  status?: number
  data?: {
    error?: unknown
  }
}

const normalizeApiError = (err: unknown): Error => {
  if (err instanceof Error) {
    const extended = err as ApiErrorLike
    const status = extended.status
    const serverCode =
      typeof extended.data?.error === "string" ? (extended.data.error as string) : null
    if (status === 428 || serverCode === PROFILE_INCOMPLETE_CODE) {
      const profileError: ApiErrorLike = Object.assign(new Error(PROFILE_INCOMPLETE_CODE), {
        status: 428,
      })
      return profileError
    }
    return err
  }
  return new Error(String(err))
}

const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined
  const candidate = error as { status?: unknown }
  return typeof candidate.status === "number" ? candidate.status : undefined
}

export const useCustomerPreferences = () => {
  const auth = useAuth()
  const uid = auth.user?.uid ?? null
  const [preferences, setPreferences] = useState<CustomerPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchPreferences = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<CustomerPreferences | { preferences: CustomerPreferences }>(
        `/customers/${uid}/preferences`,
      )
      const data = (response as { preferences?: CustomerPreferences }).preferences ?? (response as CustomerPreferences)
      setPreferences(data ?? {})
    } catch (err) {
      const normalized = normalizeApiError(err)
      setError(normalized)
      if (normalized.message === PROFILE_INCOMPLETE_CODE) {
        setPreferences(null)
      } else {
        setPreferences({})
      }
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    if (!uid) {
      setPreferences(null)
      setLoading(auth.loading)
      return
    }
    void fetchPreferences()
  }, [uid, auth.loading, fetchPreferences])

  const updatePreferences = useCallback(
    async (updates: CustomerPreferences) => {
      if (!uid) {
        throw new Error("You must be signed in to update preferences.")
      }
      setSaving(true)
      setError(null)
    try {
      await apiFetch(`/customers/${uid}/preferences`, {
        method: "PUT",
        body: updates,
      })
      setPreferences((current) => ({
        ...(current ?? {}),
        ...updates,
      }))
    } catch (err) {
      const normalized = normalizeApiError(err)
      setError(normalized)
      throw normalized
    } finally {
      setSaving(false)
    }
  },
  [uid],
  )

  const combinedLoading = loading || auth.loading
  return {
    preferences,
    loading: combinedLoading,
    saving,
    error,
    refresh: fetchPreferences,
    updatePreferences,
  }
}

export const useCustomerNotifications = () => {
  const auth = useAuth()
  const uid = auth.user?.uid ?? null
  const [notifications, setNotifications] = useState<CustomerNotifications | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<CustomerNotifications | { notifications: CustomerNotifications }>(
        `/customers/${uid}/notifications`,
      )
      const data =
        (response as { notifications?: CustomerNotifications }).notifications ?? (response as CustomerNotifications)
      setNotifications(data ?? {})
    } catch (err) {
      const normalized = normalizeApiError(err)
      setError(normalized)
      if (normalized.message === PROFILE_INCOMPLETE_CODE) {
        setNotifications(null)
      } else {
        setNotifications({})
      }
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    if (!uid) {
      setNotifications(null)
      setLoading(auth.loading)
      return
    }
    void fetchNotifications()
  }, [uid, auth.loading, fetchNotifications])

  const updateNotifications = useCallback(
    async (updates: CustomerNotifications) => {
      if (!uid) {
        throw new Error("You must be signed in to update notifications.")
      }
      setSaving(true)
      setError(null)
    try {
      await apiFetch(`/customers/${uid}/notifications`, {
        method: "PUT",
        body: updates,
      })
      setNotifications((current) => ({
        ...(current ?? {}),
        ...updates,
      }))
    } catch (err) {
      const normalized = normalizeApiError(err)
      setError(normalized)
      throw normalized
    } finally {
      setSaving(false)
    }
  },
  [uid],
  )

  const combinedLoading = loading || auth.loading
  return {
    notifications,
    loading: combinedLoading,
    saving,
    error,
    refresh: fetchNotifications,
    updateNotifications,
  }
}

export const useCustomerDocuments = () => {
  const auth = useAuth()
  const uid = auth.user?.uid ?? null
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchDocuments = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<CustomerDocument[] | { documents: CustomerDocument[] }>(
        `/customers/${uid}/documents`,
      )
      const items = Array.isArray(response)
        ? response
        : (response as { documents?: CustomerDocument[] }).documents ?? []
      setDocuments(items)
      setError(null)
    } catch (err) {
      const normalized = normalizeApiError(err)
      const status = getErrorStatus(normalized)
      if (status === 404) {
        setDocuments([])
        setError(null)
      } else {
        setError(normalized)
        setDocuments([])
      }
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    if (!uid) {
      setDocuments([])
      setLoading(auth.loading)
      return
    }
    void fetchDocuments()
  }, [uid, auth.loading, fetchDocuments])

  const uploadDocument = useCallback(
    async (file: File) => {
      if (!uid) {
        throw new Error("You must be signed in to upload documents.")
      }
      setUploading(true)
      setError(null)
      try {
        const payload = {
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        }
        const target = await apiFetch<UploadTargetResponse>(
          `/customers/${uid}/documents/upload-target`,
          {
            method: "POST",
            body: payload,
          },
        )

        if (!target?.uploadUrl) {
          throw new Error("Upload target missing uploadUrl.")
        }

        const uploadHeaders = target.headers ?? {
          "Content-Type": payload.contentType,
        }

        const uploadResponse = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: uploadHeaders,
          body: file,
        })

        if (!uploadResponse.ok) {
          throw new Error("Unable to upload file to storage target.")
        }

        if (target.documentId) {
          await apiFetch(`/customers/${uid}/documents/${target.documentId}`, {
            method: "PUT",
            body: {
              filename: file.name,
              contentType: payload.contentType,
              sizeBytes: file.size,
              status: "uploaded",
            },
          })
        }

        await fetchDocuments()
      } catch (err) {
        const normalized = normalizeApiError(err)
        setError(normalized)
        throw normalized
      } finally {
        setUploading(false)
      }
    },
    [uid, fetchDocuments],
  )

  const updateDocumentMetadata = useCallback(
    async (documentId: string, updates: Record<string, unknown>) => {
      if (!uid) {
        throw new Error("You must be signed in to update document metadata.")
      }
      setError(null)
      try {
        await apiFetch(`/customers/${uid}/documents/${documentId}`, {
          method: "PUT",
          body: updates,
        })
        await fetchDocuments()
      } catch (err) {
        const normalized = normalizeApiError(err)
        setError(normalized)
        throw normalized
      }
    },
    [uid, fetchDocuments],
  )

  const combinedLoading = loading || auth.loading
  return {
    documents,
    loading: combinedLoading,
    uploading,
    error,
    refresh: fetchDocuments,
    uploadDocument,
    updateDocumentMetadata,
  }
}
