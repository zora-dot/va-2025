import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { clsx } from "clsx"

type ToastTone = "info" | "success" | "warning" | "danger"

interface Toast {
  id: string
  title: string
  description?: string
  tone?: ToastTone
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  present: (toast: Omit<Toast, "id">) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const present = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = crypto.randomUUID()
      const entry: Toast = {
        id,
        tone: toast.tone ?? "info",
        duration: toast.duration ?? 4000,
        ...toast,
      }
      setToasts((current) => [...current.slice(-3), entry])
      window.setTimeout(() => dismiss(id), entry.duration)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toasts, present, dismiss }), [toasts, present, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

const toneStyle: Record<ToastTone, string> = {
  info: "border-horizon/30 bg-white/90 text-horizon",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-sky/50 bg-sky/15 text-horizon",
  danger: "border-ember/60 bg-ember/10 text-ember",
}

const ToastViewport = ({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) => {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-3 px-4 sm:inset-auto sm:bottom-6 sm:right-6 sm:top-auto sm:items-end sm:px-0"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            "pointer-events-auto w-full max-w-xs rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-xl sm:max-w-sm",
            toneStyle[toast.tone ?? "info"],
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em]">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-sm leading-relaxed text-midnight/75">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="va-button va-button--ghost px-2 py-1 text-[0.65rem]"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
