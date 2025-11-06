import { useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { Bell, Briefcase, Luggage, UtensilsCrossed } from "lucide-react"
import { useCustomerPreferences } from "@/features/customers/hooks"

const preferenceOptions = [
  {
    key: "carryOnHelp",
    label: "Assistance with luggage",
    description: "Let drivers know you regularly travel with heavy or oversized bags.",
    icon: Luggage,
  },
  {
    key: "quietRide",
    label: "Quiet ride preference",
    description: "Dispatch will note a low-noise cabin whenever possible.",
    icon: Bell,
  },
  {
    key: "businessDesk",
    label: "Business traveller alerts",
    description: "Receive priority notices about wifi availability and flight delays.",
    icon: Briefcase,
  },
  {
    key: "snackAllergy",
    label: "Snack & beverage guidance",
    description: "Flag allergies or requests so drivers can prep the vehicle.",
    icon: UtensilsCrossed,
  },
]

export const CustomerPreferencesPage = () => {
  const { preferences, loading, saving, error, updatePreferences } = useCustomerPreferences()
  const profileBlocked = error?.message === "PROFILE_INCOMPLETE"

  const normalizedPreferences = useMemo(() => {
    return preferenceOptions.reduce<Record<string, boolean>>((acc, option) => {
      const value = preferences?.[option.key]
      acc[option.key] = typeof value === "boolean" ? value : Boolean(value)
      return acc
    }, {})
  }, [preferences])

  const handleToggle = async (key: string) => {
    const current = normalizedPreferences[key] ?? false
    try {
      await updatePreferences({ [key]: !current })
    } catch (toggleError) {
      console.error(toggleError)
    }
  }

  return (
    <RoleGate
      allowedRoles={["customer", "admin"]}
      headline="Travel preferences"
      description="Save default ride preferences so dispatch can plan ahead before each trip."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Personalize</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
                Your ride profile
              </h2>
            </div>
            <Link to="/portal/customer" className="va-button va-button--subtle px-5 py-[0.6rem] text-xs">
              Back to dashboard
            </Link>
          </header>
          <p className="mt-2 text-sm text-midnight/70">
            Toggle what matters most so we can configure your booking automatically. Changes apply to all future rides unless you override them during checkout.
          </p>
          {profileBlocked ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>
                Add your contact phone number and access request to finish setting up your account. Once complete,
                you can manage travel preferences here.
              </p>
              <Link to="/auth/profile?redirect=/portal/customer/preferences" className="va-button va-button--secondary inline-flex px-4 py-[0.55rem] text-xs">
                Complete profile
              </Link>
            </div>
          ) : error ? (
            <p className="mt-4 text-xs text-amber-600">
              We couldn’t load your saved preferences. Try refreshing the page or toggle an option to retry.
            </p>
          ) : null}
        </GlassPanel>

        {profileBlocked ? (
          <GlassPanel className="p-6 text-sm text-midnight/70">
            <p>
              We’ll unlock preference controls as soon as your profile is complete. This ensures dispatch always has
              a working phone number on file before honoring account-wide requests.
            </p>
          </GlassPanel>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {preferenceOptions.map((option) => {
              const active = normalizedPreferences[option.key] ?? false
              return (
                <GlassPanel key={option.key} className="flex items-start justify-between gap-4 p-6">
                  <div className="space-y-2">
                    <option.icon className="h-5 w-5 text-horizon/70" aria-hidden />
                    <h3 className="font-heading text-sm uppercase tracking-[0.3em] text-horizon/80">
                      {option.label}
                    </h3>
                    <p className="text-sm text-midnight/70">{option.description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={loading || saving}
                    onClick={() => handleToggle(option.key)}
                  className={
                    active
                      ? "va-chip va-chip--status-enabled"
                      : "va-chip border border-horizon/30 bg-white/80 text-horizon"
                  }
                  >
                    {loading ? "Loading…" : active ? "Enabled" : "Disabled"}
                  </button>
                </GlassPanel>
              )
            })}
          </div>
        )}
      </section>
    </RoleGate>
  )
}
