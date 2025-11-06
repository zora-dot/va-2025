const SMOKE_KEY = "__vaSmokeLog__"

type SmokeEvent = {
  event: string
  ts: string
  meta?: Record<string, unknown>
}

export const logSmokeEvent = (event: string, meta?: Record<string, unknown>) => {
  if (typeof window === "undefined") return
  const entry: SmokeEvent = {
    event,
    ts: new Date().toISOString(),
    meta,
  }
  const store = (window as typeof window & { [SMOKE_KEY]?: SmokeEvent[] })[SMOKE_KEY] ?? []
  store.push(entry)
  ;(window as typeof window & { [SMOKE_KEY]?: SmokeEvent[] })[SMOKE_KEY] = store
  try {
    const customEvent = new CustomEvent<SmokeEvent>("va-smoke-log", { detail: entry })
    window.dispatchEvent(customEvent)
  } catch (eventError) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[VA SmokeTest] Failed to dispatch smoke event", eventError)
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.info(`[VA SmokeTest] ${event}`, entry)
  }
}

declare global {
  interface Window {
    __vaSmokeLog__?: SmokeEvent[]
  }
  interface GlobalEventHandlersEventMap {
    "va-smoke-log": CustomEvent<SmokeEvent>
  }
}
