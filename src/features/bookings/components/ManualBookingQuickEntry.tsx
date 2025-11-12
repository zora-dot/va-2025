import { FormEvent, useCallback, useMemo, useState } from "react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { parseManualBookingText, type ManualBookingDraft } from "@/features/bookings/utils/manualBookingParser"
import type { TripDirection } from "@/features/booking/pricing"
import { callFunction } from "@/lib/api/client"
import { useToast } from "@/components/ui/ToastProvider"
import { Loader2, Sparkles, ClipboardCheck } from "lucide-react"

type SubmissionResult = {
  ok?: boolean
  id: string
  bookingNumber?: number
  entryIndex?: number
}

type SubmissionBatchResponse = {
  ok?: boolean
  results: SubmissionResult[]
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  awaiting_payment: "Awaiting payment",
  assigned: "Assigned",
  completed: "Completed",
  cancelled: "Cancelled",
}

const DIRECTION_OPTIONS: ManualBookingDraft["direction"][] = ["To the Airport", "From the Airport"]
const MAX_BOOKINGS = 5

export const ManualBookingQuickEntry = () => {
  const [rawText, setRawText] = useState("")
  const [drafts, setDrafts] = useState<ManualBookingDraft[]>([])
  const [rawSegments, setRawSegments] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitErrors, setSubmitErrors] = useState<(string | null)[]>([])
  const [globalSubmitError, setGlobalSubmitError] = useState<string | null>(null)
  const [recentResults, setRecentResults] = useState<SubmissionResult[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { present } = useToast()

  const clearFormState = useCallback(() => {
    setRawText("")
    setDrafts([])
    setRawSegments([])
    setParseError(null)
    setSubmitErrors([])
    setGlobalSubmitError(null)
    setActiveIndex(0)
  }, [])

  const handleParse = useCallback(() => {
    if (submitting) return
    setParseError(null)
    setGlobalSubmitError(null)
    setRecentResults(null)
    setActiveIndex(0)
    try {
      const parsedEntries = parseManualBookingText(rawText)
      setDrafts(parsedEntries.map((entry) => entry.draft))
      setRawSegments(parsedEntries.map((entry) => entry.rawText))
      setSubmitErrors(new Array(parsedEntries.length).fill(null))
    } catch (error) {
      setDrafts([])
      setRawSegments([])
      setSubmitErrors([])
      setParseError(error instanceof Error ? error.message : "Unable to parse booking details.")
    }
  }, [rawText, submitting])

  const handleReset = useCallback(() => {
    clearFormState()
    setRecentResults(null)
  }, [clearFormState])

  const handleDraftChange = useCallback(
    <K extends keyof ManualBookingDraft>(key: K, value: ManualBookingDraft[K]) => {
      setDrafts((current) => {
        if (!current[activeIndex]) return current
        const next = [...current]
        next[activeIndex] = { ...next[activeIndex], [key]: value }
        return next
      })
      setSubmitErrors((current) => {
        if (!current[activeIndex]) return current
        const next = [...current]
        next[activeIndex] = null
        return next
      })
      setGlobalSubmitError(null)
    },
    [activeIndex],
  )

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!drafts.length) {
        setGlobalSubmitError("Parse at least one booking before submitting.")
        return
      }
      if (submitting) return

      setGlobalSubmitError(null)

      const nextErrors = drafts.map(() => null as string | null)
      let firstErrorIndex: number | null = null

      drafts.forEach((draft, index) => {
        let error: string | null = null
        if (!draft.passengerName.trim()) {
          error = "Passenger name is required before submitting."
        } else if (!draft.origin.trim() || !draft.destination.trim()) {
          error = "Origin and destination must be provided."
        }
        nextErrors[index] = error
        if (error && firstErrorIndex === null) {
          firstErrorIndex = index
        }
      })

      setSubmitErrors(nextErrors)
      if (firstErrorIndex !== null) {
        setActiveIndex(firstErrorIndex)
        setGlobalSubmitError("Fix the highlighted booking before submitting.")
        return
      }

      setSubmitting(true)
      try {
        const payload = drafts.map((draft, index) => ({
          rawText: rawSegments[index] ?? rawText,
          status: draft.status,
          pickupDate: draft.pickupDate,
          pickupTime: draft.pickupTime,
          timeZone: draft.timeZone,
          passenger: {
            name: draft.passengerName,
            phone: draft.passengerPhone,
            email: draft.passengerEmail,
            baggage: draft.baggage,
            specialNotes: draft.specialNotes,
          },
          trip: {
            origin: draft.origin,
            destination: draft.destination,
            direction: draft.direction,
            passengerCount: draft.passengerCount,
          },
          payment: {
            totalCents: draft.totalCents,
            currency: draft.currency,
            preference: draft.paymentPreference,
          },
          scheduleNotes: draft.scheduleNotes,
          flightNumber: draft.flightNumber,
        }))

        const response = await callFunction<SubmissionBatchResponse>("manualBookingImport", {
          method: "POST",
          body: payload,
          auth: true,
        })

        const createdResults = response.results ?? []
        setRecentResults(createdResults)

        const bookingLabels = createdResults
          .map((result) =>
            typeof result.bookingNumber === "number" ?
              `#${result.bookingNumber.toString().padStart(5, "0")}` :
              null,
          )
          .filter((value): value is string => Boolean(value))
          .join(", ")

        present({
          title:
            createdResults.length > 1 ?
              `Created ${createdResults.length} bookings` :
              "Booking created",
          tone: "success",
          description: bookingLabels || undefined,
        })

        clearFormState()
      } catch (error) {
        setGlobalSubmitError(
          error instanceof Error ? error.message : "Something went wrong while creating the bookings.",
        )
      } finally {
        setSubmitting(false)
      }
    },
    [drafts, rawSegments, rawText, present, clearFormState, submitting],
  )

  const currentDraft = drafts[activeIndex] ?? null
  const currentSubmitError = submitErrors[activeIndex] ?? null
  const isSubmitting = submitting

  const fareInputValue = useMemo(() => {
    if (!currentDraft || currentDraft.totalCents == null) return ""
    return (currentDraft.totalCents / 100).toFixed(2)
  }, [currentDraft])

  return (
    <GlassPanel className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="font-heading text-xs uppercase tracking-[0.4em] text-horizon/70">Manual import</p>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-horizon" />
          <h3 className="text-xl font-semibold text-midnight">Paste-to-booking converter</h3>
        </div>
        <p className="text-sm text-midnight/70">
          Drop in the confirmation email, review the parsed fields, and push it straight into the booking calendar.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-midnight">
            Raw confirmation text
            <textarea
              rows={14}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 font-mono text-sm text-midnight shadow-inner focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
              placeholder="Paste the booking email here..."
            />
          </label>
          {parseError && <p className="text-sm text-rose-600">{parseError}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full bg-horizon px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-midnight disabled:cursor-not-allowed disabled:opacity-60"
            >
              Parse details
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-midnight transition hover:border-horizon hover:text-horizon disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {drafts.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {Array.from({ length: MAX_BOOKINGS }, (_, index) => {
                const hasDraft = index < drafts.length
                const isActiveTab = index === activeIndex
                const hasError = Boolean(submitErrors[index])
                const tabClasses = [
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition",
                  !hasDraft ?
                    "cursor-not-allowed border-dashed border-slate-300 text-slate-300" :
                    isActiveTab ?
                      "border-midnight bg-midnight text-white" :
                      "border-slate-200 bg-white text-midnight hover:border-horizon hover:text-horizon",
                  hasError ? "border-rose-400 text-rose-600" : "",
                  submitting ? "pointer-events-none opacity-70" : "",
                ]
                  .filter(Boolean)
                  .join(" ")

                return (
                  <button
                    key={`booking-tab-${index}`}
                    type="button"
                    aria-label={`Booking ${index + 1}`}
                    aria-pressed={isActiveTab}
                    onClick={() => {
                      if (hasDraft && !submitting) {
                        setActiveIndex(index)
                      }
                    }}
                    disabled={!hasDraft || submitting}
                    className={tabClasses}
                  >
                    {index + 1}
                  </button>
                )
              })}
            </div>
          )}
          {currentDraft ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-midnight">
                  Status
                  <select
                    value={currentDraft.status}
                    onChange={(event) => handleDraftChange("status", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  >
                    {Object.keys(STATUS_LABELS).map((statusKey) => (
                      <option key={statusKey} value={statusKey}>
                        {STATUS_LABELS[statusKey]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-midnight">
                  Payment preference
                  <select
                    value={currentDraft.paymentPreference}
                    onChange={(event) =>
                      handleDraftChange(
                        "paymentPreference",
                        event.target.value === "pay_now" ? "pay_now" : "pay_on_arrival",
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  >
                    <option value="pay_on_arrival">Pay on arrival</option>
                    <option value="pay_now">Pay now</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-midnight">
                  Pickup date
                  <input
                    type="date"
                    value={currentDraft.pickupDate}
                    onChange={(event) => handleDraftChange("pickupDate", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
                <label className="text-sm font-medium text-midnight">
                  Pickup time
                  <input
                    type="time"
                    value={currentDraft.pickupTime}
                    onChange={(event) => handleDraftChange("pickupTime", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-midnight">
                  Passenger name
                  <input
                    type="text"
                    value={currentDraft.passengerName}
                    onChange={(event) => handleDraftChange("passengerName", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
                <label className="text-sm font-medium text-midnight">
                  Phone number
                  <input
                    type="tel"
                    value={currentDraft.passengerPhone ?? ""}
                    onChange={(event) => handleDraftChange("passengerPhone", event.target.value || null)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
              </div>

              <label className="text-sm font-medium text-midnight">
                Flight number
                <input
                  type="text"
                  value={currentDraft.flightNumber ?? ""}
                  onChange={(event) => handleDraftChange("flightNumber", event.target.value || null)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-midnight">
                  From
                  <input
                    type="text"
                    value={currentDraft.origin}
                    onChange={(event) => handleDraftChange("origin", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
                <label className="text-sm font-medium text-midnight">
                  To
                  <input
                    type="text"
                    value={currentDraft.destination}
                    onChange={(event) => handleDraftChange("destination", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm font-medium text-midnight md:col-span-2">
                  Trip direction
                  <select
                    value={currentDraft.direction}
                    onChange={(event) =>
                      handleDraftChange(
                        "direction",
                        DIRECTION_OPTIONS.includes(event.target.value as TripDirection)
                          ? (event.target.value as TripDirection)
                          : "To the Airport",
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  >
                    {DIRECTION_OPTIONS.map((direction) => (
                      <option key={direction} value={direction}>
                        {direction}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-midnight">
                  Passengers
                  <input
                    type="number"
                    min={1}
                    value={currentDraft.passengerCount}
                    onChange={(event) =>
                      handleDraftChange(
                        "passengerCount",
                        Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
              </div>

              <label className="text-sm font-medium text-midnight">
                Baggage
                <input
                  type="text"
                  value={currentDraft.baggage ?? ""}
                  onChange={(event) => handleDraftChange("baggage", event.target.value || null)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                />
              </label>

              <label className="text-sm font-medium text-midnight">
                Special notes
                <textarea
                  rows={2}
                  value={currentDraft.scheduleNotes ?? ""}
                  onChange={(event) => handleDraftChange("scheduleNotes", event.target.value || null)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-midnight">
                  Total fare (CAD)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fareInputValue}
                    onChange={(event) => {
                      const numeric = Number.parseFloat(event.target.value)
                      handleDraftChange(
                        "totalCents",
                        Number.isFinite(numeric) ? Math.round(numeric * 100) : null,
                      )
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
                <label className="text-sm font-medium text-midnight">
                  Currency
                  <input
                    type="text"
                    value={currentDraft.currency}
                    onChange={(event) => handleDraftChange("currency", event.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm uppercase text-midnight focus:border-horizon focus:outline-none focus:ring-2 focus:ring-horizon/20"
                  />
                </label>
              </div>

              {currentSubmitError && <p className="text-sm text-rose-600">{currentSubmitError}</p>}
              {globalSubmitError && <p className="text-sm text-rose-600">{globalSubmitError}</p>}
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-midnight px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-horizon disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={submitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
                  </>
                ) : (
                  drafts.length > 1 ?
                    `Create ${drafts.length} bookings` :
                    "Create booking"
                )}
              </button>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/40 p-6 text-center text-sm text-midnight/70">
              <p>Paste a booking transcript to unlock the quick-entry form.</p>
              <p className="mt-2 text-xs uppercase tracking-[0.35em] text-slate-400">
                Waiting for input
              </p>
            </div>
          )}
        </form>
      </div>
      {recentResults && recentResults.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            <p className="font-semibold uppercase tracking-[0.3em] text-emerald-700">Last import</p>
          </div>
          <ul className="mt-2 space-y-1 text-midnight">
            {recentResults.map((result, index) => (
              <li key={`${result.id}-${index}`}>
                Entry {result.entryIndex ?? index + 1}:{" "}
                {result.bookingNumber ?
                  `Booking #${result.bookingNumber.toString().padStart(5, "0")}` :
                  "Booking saved"}{" "}
                — ref: {result.id}
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassPanel>
  )
}
