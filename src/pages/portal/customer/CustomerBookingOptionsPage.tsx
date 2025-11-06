import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { ArrowLeft, CreditCard, DollarSign, PenLine, Loader2, Copy, ExternalLink, Check } from "lucide-react"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { callFunction } from "@/lib/api/client"
import { useAuth } from "@/lib/hooks/useAuth"
import { useToast } from "@/components/ui/ToastProvider"

const ROUTE_ID = "/portal/customer/bookings/$bookingId/options"

type BookingSearchParams = {
  payment?: string
  bookingNumber?: number
  canSwitchToOnline?: boolean
  passengerName?: string
  status?: string
}

interface ActionCardProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  title: string
  description: string
  footer: ReactNode
}

const ActionCard = ({ icon: Icon, title, description, footer }: ActionCardProps) => (
  <div className="flex h-full flex-col justify-between gap-7 rounded-3xl border border-horizon/20 bg-white/90 p-7 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
    <div className="space-y-5">
      <Icon className="h-8 w-8 text-horizon/80" aria-hidden />
      <h2 className="font-heading text-sm uppercase tracking-[0.3em] text-horizon">{title}</h2>
      <p className="text-sm leading-relaxed text-midnight/75">{description}</p>
    </div>
    <div className="space-y-5">{footer}</div>
  </div>
)

const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (!navigator?.clipboard) {
            window.prompt("Copy link", value)
            return
          }
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch (error) {
          console.error("Clipboard copy failed", error)
        }
      }}
      className="inline-flex items-center gap-1 rounded-full border border-horizon/25 px-3 py-1 text-[0.65rem] uppercase tracking-[0.28em] text-horizon/80 transition hover:border-horizon/40 hover:text-horizon"
    >
      {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

const LinkPreview = ({ label, url }: { label: string; url: string }) => (
  <div className="space-y-3 rounded-2xl border border-horizon/15 bg-white/90 p-4 text-sm text-midnight/75">
    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70">{label}</p>
    <div className="flex items-center justify-between gap-3">
      <span className="flex-1 truncate text-xs text-midnight/70">{url}</span>
      <CopyButton value={url} />
    </div>
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-horizon/80 transition hover:text-horizon"
    >
      <ExternalLink className="h-3 w-3" aria-hidden />
      Open link
    </a>
  </div>
)

export const CustomerBookingOptionsPage = () => {
  const { bookingId } = useParams({ from: ROUTE_ID })
  const search = useSearch({ from: ROUTE_ID }) as BookingSearchParams
  const navigate = useNavigate()
  const auth = useAuth()
  const { present } = useToast()

  const uid = auth.user?.uid ?? null

  const bookingNumber =
    typeof search.bookingNumber === "number" && Number.isFinite(search.bookingNumber)
      ? search.bookingNumber
      : undefined
  const bookingLabel = bookingNumber ? `Form #${bookingNumber}` : `Booking ${bookingId}`
  const paymentPreference = search.payment === "pay_on_arrival" ? "Pay on Arrival" : search.payment === "pay_now" ? "Pay Online" : undefined
  const passengerName = search.passengerName ?? undefined
  const canSwitchToOnline = Boolean(search.canSwitchToOnline)
  const statusLabel = useMemo(
    () => (search.status ? search.status.replace(/_/g, " ") : undefined),
    [search.status],
  )
  const canCancel = useMemo(() => {
    if (!search.status) return true
    return search.status !== "completed" && search.status !== "cancelled"
  }, [search.status])

  const [payLink, setPayLink] = useState<string | null>(null)
  const [tipAmount, setTipAmount] = useState("")
  const [tipLink, setTipLink] = useState<string | null>(null)
  const [tipError, setTipError] = useState<string | null>(null)
  const [cancelNote, setCancelNote] = useState("")

  const payNowMutation = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("You need to be signed in.")
      return await callFunction<{ link?: string | null }>(
        `api/customers/${uid}/bookings/${bookingId}/pay-now`,
        {
          method: "POST",
          auth: true,
        },
      )
    },
    onSuccess: (data) => {
      if (data?.link) {
        setPayLink(data.link)
        present({
          tone: "success",
          title: "Payment link ready",
          description: "A new Square payment link was generated.",
        })
        window.open(data.link, "_blank", "noopener")
      } else {
        present({ tone: "warning", title: "No link returned", description: "Dispatch will follow up shortly." })
      }
    },
    onError: (error) => {
      present({ tone: "danger", title: "Unable to generate link", description: (error as Error).message ?? "Please try again." })
    },
  })

  const tipMutation = useMutation({
    mutationFn: async (amount: number) => {
      if (!uid) throw new Error("You need to be signed in.")
      return await callFunction<{ link?: string | null }>(
        `api/customers/${uid}/bookings/${bookingId}/tip-link`,
        {
          method: "POST",
          auth: true,
          body: { amount },
        },
      )
    },
    onSuccess: (data) => {
      if (data?.link) {
        setTipLink(data.link)
        present({
          tone: "success",
          title: "Tip link created",
          description: "Share the Square link with anyone who wants to add a gratuity.",
        })
        window.open(data.link, "_blank", "noopener")
      } else {
        present({ tone: "warning", title: "No link returned", description: "Dispatch will follow up shortly." })
      }
    },
    onError: (error) => {
      present({ tone: "danger", title: "Unable to create tip link", description: (error as Error).message ?? "Please try again." })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("You need to be signed in.")
      const note = cancelNote.trim()
      await callFunction(
        `api/customers/${uid}/bookings/${bookingId}/cancel`,
        {
          method: "POST",
          auth: true,
          body: {
            note: note || undefined,
            reasonNote: note || undefined,
          },
        },
      )
    },
    onSuccess: () => {
      present({
        tone: "success",
        title: "Booking cancelled",
        description: "We let dispatch know—expect a confirmation shortly.",
      })
      navigate({ to: "/portal/customer" })
    },
    onError: (error) => {
      present({ tone: "danger", title: "Unable to cancel", description: (error as Error).message ?? "Please contact dispatch." })
    },
  })

  const handleTipSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTipError(null)
    const numeric = Number(tipAmount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setTipError("Enter a positive amount.")
      return
    }
    tipMutation.mutate(numeric)
  }

  const handleCancel = () => {
    if (!canCancel || cancelMutation.isPending) return
    const confirmed = window.confirm("Cancel this booking? We'll notify dispatch immediately.")
    if (!confirmed) return
    cancelMutation.mutate()
  }

  return (
    <RoleGate
      allowedRoles={["customer", "admin"]}
      headline="Manage booking"
      description="Switch payments, add gratuities, or request edits to your itinerary."
    >
      <section className="flex flex-col gap-8 pb-20">
        <Link
          to="/portal/customer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-horizon transition hover:text-horizon/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>

        <GlassPanel className="flex flex-col gap-10 p-9">
          <header className="space-y-5">
            <div className="space-y-2">
              <h1 className="font-heading text-3xl uppercase tracking-[0.26em] text-horizon">{bookingLabel}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-midnight/70">
                {paymentPreference ? <span>{`Current payment preference: ${paymentPreference}`}</span> : null}
              </div>
            </div>
            <p className="text-sm leading-relaxed text-midnight/75">
              Choose an action below—we’ll generate the links instantly and sync everything with dispatch.
            </p>
          </header>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            <ActionCard
              icon={CreditCard}
              title="Pay online now instead"
              description={
                canSwitchToOnline
                  ? "Generate a secure Square checkout link so you can settle the fare before your trip."
                  : "Your booking is already set to pay online. Regenerating a link will resend it to you."
              }
              footer={
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => payNowMutation.mutate()}
                    disabled={payNowMutation.isPending}
                    className="va-button va-button--primary w-full justify-center"
                  >
                    {payNowMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      "Generate payment link"
                    )}
                  </button>
                  {payLink ? <LinkPreview label="Latest payment link" url={payLink} /> : null}
                </div>
              }
            />

            <ActionCard
              icon={DollarSign}
              title="Add a tip amount"
              description="Create a Square link that only collects a gratuity—perfect for sharing with family or teammates."
              footer={
                <form onSubmit={handleTipSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70" htmlFor="tip-amount">
                      Tip amount (CAD)
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        id="tip-amount"
                        type="number"
                        min="1"
                        step="0.5"
                        value={tipAmount}
                        onChange={(event) => setTipAmount(event.target.value)}
                        className="va-input h-11 w-full flex-1"
                        placeholder="Enter amount"
                      />
                      <button
                        type="submit"
                        disabled={tipMutation.isPending}
                        className="va-button va-button--secondary whitespace-nowrap px-5 py-[0.65rem]"
                      >
                        {tipMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Create tip link"}
                      </button>
                    </div>
                    {tipError ? <p className="text-xs text-ember">{tipError}</p> : null}
                  </div>
                  {tipLink ? <LinkPreview label="Latest tip link" url={tipLink} /> : null}
                </form>
              }
            />

            <ActionCard
              icon={PenLine}
              title="Cancel booking"
              description={
                canCancel
                  ? "Need to cancel? We’ll flip the status to cancelled and notify dispatch immediately."
                  : "This trip is already completed or cancelled. Contact dispatch if something looks wrong."
              }
              footer={
                <div className="space-y-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.28em] text-horizon/70" htmlFor="cancel-note">
                    Optional note for dispatch
                  </label>
                  <textarea
                    id="cancel-note"
                    className="va-textarea min-h-[110px]"
                    placeholder="Add context (flight changes, reschedule plans, etc.)"
                    value={cancelNote}
                    onChange={(event) => setCancelNote(event.target.value)}
                    disabled={!canCancel}
                  />
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={!canCancel || cancelMutation.isPending}
                    className="va-button va-button--danger w-full justify-center"
                  >
                    {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Cancel this booking"}
                  </button>
                  {!canCancel ? (
                    <p className="text-xs text-midnight/60">
                      Already completed or cancelled. Reach out to dispatch if you need further assistance.
                    </p>
                  ) : null}
                </div>
              }
            />
          </div>

          <div className="pt-4">
            <p className="text-xs text-midnight/60">
              Need something different? Reply to any Valley Airporter email or call/text
              <a className="mx-1 text-horizon underline-offset-2 hover:underline" href="tel:+16047516688">
                (604) 751-6688
              </a>
              .
            </p>
          </div>
        </GlassPanel>
      </section>
    </RoleGate>
  )
}

export default CustomerBookingOptionsPage
