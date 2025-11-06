export const trackPurchase = (valueCAD: number, transactionId: string) => {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  if (!transactionId) return

  const roundedValue = Number.isFinite(valueCAD) ? Number(valueCAD) : 0

  window.gtag("event", "purchase", {
    transaction_id: transactionId,
    value: roundedValue,
    currency: "CAD",
  })
}

type AnalyticsPayload = Record<string, unknown> | undefined

export const trackQuoteEvent = (eventName: string, payload?: AnalyticsPayload) => {
  if (typeof window === "undefined") return
  const data = payload ?? {}
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, data)
    return
  }

  const layer = (window as typeof window & { dataLayer?: Array<Record<string, unknown>> }).dataLayer
  if (Array.isArray(layer)) {
    layer.push({
      event: eventName,
      ...data,
    })
  }
}
