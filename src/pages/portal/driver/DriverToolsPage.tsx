import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { useToast } from "@/components/ui/ToastProvider"
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  Upload,
  Wrench,
  CheckCircle2,
} from "lucide-react"
import {
  useCreateDriverInspection,
  useDriverInspections,
  type DriverInspection,
} from "@/features/drivers/inspections"

const checklistItems = [
  { key: "exterior", label: "Exterior & tires" },
  { key: "lights", label: "Lights & signals" },
  { key: "interior", label: "Cabin & passenger area" },
  { key: "safety", label: "Safety equipment" },
  { key: "cleanliness", label: "Cleanliness & supplies" },
]

const VEHICLE_STORAGE_KEY = "va-driver-last-vehicle"

type ChecklistState = Record<string, boolean>

const buildInitialChecklist = (): ChecklistState =>
  checklistItems.reduce<ChecklistState>((acc, item) => {
    acc[item.key] = true
    return acc
  }, {})

const formatInspectionTimestamp = (inspection: DriverInspection) => {
  if (!inspection.submittedAt) return "Pending timestamp"
  return format(new Date(inspection.submittedAt), "EEE, MMM d • h:mm a")
}

export const DriverToolsPage = () => {
  const { present } = useToast()
  const { inspections, loading, error: inspectionsError, refresh } = useDriverInspections()
  const createInspection = useCreateDriverInspection()

  const [vehicleId, setVehicleId] = useState(() => {
    if (typeof window === "undefined") return ""
    return window.localStorage.getItem(VEHICLE_STORAGE_KEY) ?? ""
  })
  const [odometer, setOdometer] = useState("")
  const [notes, setNotes] = useState("")
  const [checklist, setChecklist] = useState<ChecklistState>(() => buildInitialChecklist())
  const [issues, setIssues] = useState<string[]>([])

  const hasIssues = issues.length > 0 || notes.trim().length > 0

  const checklistSummary = useMemo(() => {
    const passed = Object.values(checklist).filter(Boolean).length
    const total = checklistItems.length
    return { passed, total }
  }, [checklist])

  const toggleChecklist = (key: string, label: string) => {
    setChecklist((current) => {
      const next = { ...current, [key]: !current[key] }
      setIssues((currentIssues) => {
        if (next[key]) {
          return currentIssues.filter((entry) => entry !== label)
        }
        if (currentIssues.includes(label)) return currentIssues
        return [...currentIssues, label]
      })
      return next
    })
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VEHICLE_STORAGE_KEY, vehicleId.trim())
    }
  }, [vehicleId])

  useEffect(() => {
    if (inspections.length === 0) return
    const latest = inspections[0]
    if (!vehicleId && latest.vehicleId) {
      setVehicleId(latest.vehicleId)
    }
    if (!odometer) {
      const suggestion = latest.odometer != null ? latest.odometer + 15 : undefined
      if (suggestion && Number.isFinite(suggestion)) {
        setOdometer(String(suggestion))
      }
    }
  }, [inspections, odometer, vehicleId])

  const resetForm = () => {
    setOdometer("")
    setNotes("")
    setChecklist(buildInitialChecklist())
    setIssues([])
  }

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()

    const odometerValue = odometer.trim() ? Number(odometer) : undefined
    if (odometerValue != null && Number.isNaN(odometerValue)) {
      present({
        title: "Invalid odometer",
        description: "Please enter a numeric odometer reading.",
        tone: "danger",
      })
      return
    }

    try {
      await createInspection.mutateAsync({
        vehicleId: vehicleId.trim() || undefined,
        odometer: odometerValue,
        checklist,
        issues: issues.length > 0 ? issues : undefined,
        notes: notes.trim() || undefined,
      })
      present({
        title: "Inspection submitted",
        description: hasIssues
          ? "Dispatch sees your flagged items and will follow up if needed."
          : "Vehicle is logged as ready for service.",
        tone: "success",
      })
      resetForm()
      refresh()
    } catch (error) {
      present({
        title: "Submission failed",
        description:
          error instanceof Error ? error.message : "Unable to create inspection right now.",
        tone: "danger",
      })
    }
  }

  return (
    <RoleGate
      allowedRoles={["driver", "admin"]}
      headline="Driver toolbox"
      description="Submit inspections, review your logs, and reference quick actions."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">
                Pre-trip checklist
              </p>
              <h1 className="font-heading text-xl uppercase tracking-[0.3em] text-horizon">
                Vehicle inspection
              </h1>
            </div>
            <span className="va-chip bg-white/80 text-midnight/70">
              {checklistSummary.passed}/{checklistSummary.total} passed
            </span>
          </header>
          <form className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-midnight/70">
                  Vehicle unit
                  <input
                    type="text"
                    value={vehicleId}
                    onChange={(event) => setVehicleId(event.target.value)}
                    placeholder="e.g., VAN-12"
                    className="h-10 rounded-xl border border-horizon/20 bg-white/85 px-3 text-sm text-midnight outline-none focus:border-horizon focus:ring-2 focus:ring-glacier/30"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-midnight/70">
                  Odometer (km)
                  <input
                    type="number"
                    value={odometer}
                    onChange={(event) => setOdometer(event.target.value)}
                    placeholder="57820"
                    className="h-10 rounded-xl border border-horizon/20 bg-white/85 px-3 text-sm text-midnight outline-none focus:border-horizon focus:ring-2 focus:ring-glacier/30"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {checklistItems.map((item) => {
                  const checked = checklist[item.key]
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleChecklist(item.key, item.label)}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        checked
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-300 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span className="text-sm font-medium">{item.label}</span>
                      {checked ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                      ) : (
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  )
                })}
              </div>

              <label className="flex flex-col gap-2 text-sm text-midnight/70">
                Notes for dispatch (optional)
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="Describe any issues, missing equipment, or rider feedback."
                  className="rounded-xl border border-horizon/20 bg-white/85 px-3 py-2 text-sm text-midnight outline-none focus:border-horizon focus:ring-2 focus:ring-glacier/30"
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="va-button va-button--primary px-6 py-3"
                  disabled={createInspection.isPending}
                >
                  {createInspection.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Submitting
                    </>
                  ) : (
                    "Submit inspection"
                  )}
                </button>
                <button
                  type="button"
                  className="va-button va-button--ghost px-6 py-3"
                  onClick={resetForm}
                  disabled={createInspection.isPending}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-horizon/15 bg-white/85 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-midnight/85">Submission summary</h2>
                <Wrench className="h-4 w-4 text-horizon/70" aria-hidden />
              </div>
              <ul className="space-y-2 text-sm text-midnight/70">
                <li>
                  Checklist result:{" "}
                  <strong>
                    {checklistSummary.passed}/{checklistSummary.total} clear
                  </strong>
                </li>
                <li>
                  Flagged items:{" "}
                  {issues.length > 0 ? (
                    <span className="text-amber-600">{issues.join(", ")}</span>
                  ) : (
                    <span className="text-emerald-600">None</span>
                  )}
                </li>
                <li>Vehicle: {vehicleId.trim().length > 0 ? vehicleId : "TBD"}</li>
                <li>Odometer: {odometer.trim().length > 0 ? `${odometer} km` : "Pending"}</li>
              </ul>
              <p className="text-xs text-midnight/60">
                Dispatch reviews your inspection instantly. If something critical is reported, a duty manager will call within minutes.
              </p>
            </div>
          </form>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Recent submissions</p>
              <h2 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">
                Inspection history
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.3em] text-midnight/60">
                Latest {inspections.length} entries
              </span>
              <button
                type="button"
                onClick={() => refresh()}
                className="va-button va-button--ghost px-4 py-[0.45rem] text-xs uppercase tracking-[0.3em]"
              >
                Refresh
              </button>
            </div>
          </header>
          {loading ? (
            <div className="mt-5 flex items-center gap-2 text-sm text-midnight/70">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading inspections…
            </div>
          ) : inspectionsError ? (
            <div className="mt-5 flex flex-col items-start gap-3 text-sm text-amber-600">
              <p>Unable to load inspections. Please try again.</p>
              <button
                type="button"
                onClick={() => refresh()}
                className="va-button va-button--secondary px-4 py-[0.45rem] text-xs"
              >
                Retry
              </button>
            </div>
          ) : inspections.length === 0 ? (
            <div className="mt-5 flex flex-col items-start gap-3 text-sm text-midnight/70">
              <p>No inspections yet today. Log your pre-trip before your first pickup.</p>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-horizon underline-offset-2 hover:underline"
              >
                Jump to inspection form
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {inspections.map((inspection) => (
                <div
                  key={inspection.id}
                  className="rounded-2xl border border-horizon/15 bg-white/85 p-4 text-sm text-midnight/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-midnight/85">
                      {formatInspectionTimestamp(inspection)}
                    </span>
                    <span className="va-chip bg-white/80 text-horizon">
                      {inspection.vehicleId ?? "Vehicle TBD"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.3em] text-midnight/60">
                    <span>Odometer: {inspection.odometer ?? "—"}</span>
                    <span>
                      Issues:{" "}
                      {inspection.issues && inspection.issues.length > 0
                        ? inspection.issues.join(", ")
                        : "None"}
                    </span>
                  </div>
                  {inspection.notes ? (
                    <p className="mt-2 text-sm text-midnight/70">{inspection.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Upload documents</p>
              <h2 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">
                Fleet paperwork
              </h2>
            </div>
            <Upload className="h-5 w-5 text-horizon/70" aria-hidden />
          </header>
          <p className="mt-3 text-sm text-midnight/75">
            Need to send proof of insurance or a trip receipt? Email documents to{" "}
            <strong>dispatch@valleyairporter.ca</strong> or hand them in at the office. Keep originals for 30 days.
          </p>
        </GlassPanel>

        <GlassPanel className="p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Incident reporting</p>
              <h2 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">
                Escalation protocol
              </h2>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
          </header>
          <p className="mt-3 text-sm text-midnight/75">
            Call dispatch immediately at <strong>(604) 751-6688</strong> for urgent issues. For non-urgent events, email notes and photos to <strong>incidents@valleyairporter.ca</strong>.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-midnight/70">
            <li className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-horizon/70" aria-hidden />
              Include booking ID, passengers impacted, and any injuries.
            </li>
            <li className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-horizon/70" aria-hidden />
              Document vehicle damage with photos before leaving the scene.
            </li>
          </ul>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}
