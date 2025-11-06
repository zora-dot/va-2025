import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/lib/hooks/useAuth"
import { apiFetch } from "@/lib/api/rest"

export interface AlertChannelSettings {
  email?: boolean
  sms?: boolean
  push?: boolean
  [key: string]: boolean | undefined
}

export type AlertsSettings = Record<string, AlertChannelSettings>

export const useAdminAlertsSettings = () => {
  const auth = useAuth()
  const isAdmin = auth.hasRole("admin")
  const [settings, setSettings] = useState<AlertsSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchSettings = useCallback(async () => {
    if (!isAdmin) {
      setSettings({})
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<AlertsSettings | { settings: AlertsSettings }>(
        "/admin/alerts/settings",
      )
      const data = (response as { settings?: AlertsSettings }).settings ?? (response as AlertsSettings)
      setSettings(data ?? {})
    } catch (err) {
      setError(err as Error)
      setSettings({})
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const updateSettings = useCallback(
    async (next: AlertsSettings) => {
      if (!isAdmin) {
        throw new Error("Only admins can update alert settings.")
      }
      setSaving(true)
      setError(null)
      try {
        await apiFetch("/admin/alerts/settings", {
          method: "PUT",
          body: next,
        })
        setSettings(next)
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [isAdmin],
  )

  const updateChannel = useCallback(
    async (alertId: string, channel: string, enabled: boolean) => {
      const next = {
        ...settings,
        [alertId]: {
          ...(settings[alertId] ?? {}),
          [channel]: enabled,
        },
      }
      await updateSettings(next)
    },
    [settings, updateSettings],
  )

  return {
    settings,
    loading,
    saving,
    error,
    refresh: fetchSettings,
    updateSettings,
    updateChannel,
  }
}
