import { getAuth } from "firebase/auth"

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const region = import.meta.env.VITE_FUNCTIONS_REGION ?? "us-central1"
const baseUrl =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ?? `https://${region}-${projectId}.cloudfunctions.net`

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  auth?: boolean
  headers?: Record<string, string>
  params?: Record<string, string | number | undefined>
}

const buildUrl = (endpoint: string, params?: Record<string, string | number | undefined>) => {
  if (!params) return `${baseUrl}/${endpoint}`
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      search.set(key, String(value))
    }
  })
  const query = search.toString()
  return query ? `${baseUrl}/${endpoint}?${query}` : `${baseUrl}/${endpoint}`
}

export async function callFunction<T = unknown>(endpoint: string, options: RequestOptions = {}) {
  const { method = "GET", body, auth = false, headers = {}, params } = options
  const requestHeaders: Record<string, string> = {
    ...headers,
  }

  if (method !== "GET" && method !== "HEAD") {
    requestHeaders["Content-Type"] = "application/json"
  }

  if (auth) {
    const authInstance = getAuth()
    const user = authInstance.currentUser
    if (user) {
      const token = await user.getIdToken()
      requestHeaders.Authorization = `Bearer ${token}`
    }
  }

  const response = await fetch(buildUrl(endpoint, params), {
    method,
    headers: requestHeaders,
    body: body != null ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }

  if (!response.ok) {
    interface FetchError extends Error {
      status?: number
      data?: unknown
    }
    const error = new Error(
      typeof (json as { error?: unknown })?.error === "string"
        ? ((json as { error?: string }).error as string)
        : response.statusText,
    ) as FetchError
    error.status = response.status
    error.data = json
    throw error
  }

  return json as T
}
