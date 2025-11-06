import { getAuth } from "firebase/auth"

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE"

interface RequestOptions extends RequestInit {
  method?: HttpMethod
  params?: Record<string, string | number | boolean | undefined>
  skipAuth?: boolean
}

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const region = import.meta.env.VITE_FUNCTIONS_REGION ?? "us-central1"
const explicitBaseUrl = import.meta.env.VITE_API_BASE_URL

const apiBaseUrl =
  explicitBaseUrl ??
  (projectId ? `https://${region}-${projectId}.cloudfunctions.net/api` : undefined)

const buildUrl = (path: string, params?: Record<string, string | number | boolean | undefined>) => {
  if (!apiBaseUrl) {
    throw new Error("API base URL is not configured. Set VITE_API_BASE_URL or VITE_FIREBASE_PROJECT_ID.")
  }
  const url = new URL(path.startsWith("http") ? path : `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    })
  }
  return url.toString()
}

export const apiFetch = async <T = unknown>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = "GET", params, headers, body, skipAuth, ...rest } = options
  const url = buildUrl(path, params)
  const finalHeaders = new Headers(headers)

  if (method !== "GET" && method !== "HEAD" && body != null && !(body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json")
  }

  if (!skipAuth) {
    const auth = getAuth()
    const currentUser = auth.currentUser
    if (!currentUser) {
      throw new Error("Authentication required to call this endpoint.")
    }
    const token = await currentUser.getIdToken()
    finalHeaders.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body != null && !(body instanceof FormData) ? JSON.stringify(body) : body,
    ...rest,
  })

  if (!response.ok) {
    let errorDetail: unknown = undefined
    try {
      errorDetail = await response.json()
    } catch {
      errorDetail = await response.text()
    }
    interface RestError extends Error {
      status?: number
      data?: unknown
    }
    const message =
      typeof errorDetail === "string"
        ? errorDetail
        : (errorDetail as Record<string, unknown>)?.error?.toString() ?? response.statusText
    const error = new Error(message) as RestError
    error.status = response.status
    error.data = errorDetail
    throw error
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get("Content-Type") ?? ""
  if (contentType.includes("application/json")) {
    return (await response.json()) as T
  }
  return (await response.text()) as T
}

export type { RequestOptions }
