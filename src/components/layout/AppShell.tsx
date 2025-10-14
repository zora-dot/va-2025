import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { LogOut, Menu, MapPin, Phone, Mail, Clock } from "lucide-react"
import { useMemo, useState } from "react"
import { clsx } from "clsx"
import { useAuth } from "@/lib/hooks/useAuth"
import logoImage from "@/assets/valley-airporter-logo.svg"

const navItems = [
  {
    to: "/",
    label: "Home",
    children: [
      { to: "/destinations/abbotsford", label: "Abbotsford to Airport Shuttles" },
      { to: "/destinations/chilliwack", label: "Chilliwack to Airport Shuttles" },
      { to: "/destinations/rosedale", label: "Rosedale or Hope to Airport Shuttles" },
      { to: "/destinations/mission", label: "Mission to Airport Shuttles" },
      { to: "/destinations/surrey", label: "Surrey to Airport Shuttles" },
      { to: "/destinations/vancouver", label: "Vancouver to Airport Shuttles" },
    ],
  },
  { to: "/booking", label: "Book Now" },
  { to: "/faq", label: "FAQ" },
  { to: "/reviews", label: "Reviews" },
  { to: "/tours", label: "Tours by Shuttle" },
  { to: "/contact", label: "Contact Us" },
]

export const AppShell = () => {
  const { location } = useRouterState()
  const navigate = useNavigate()
  const auth = useAuth()
  const [isMenuOpen, setMenuOpen] = useState(false)

  const activePath = useMemo(() => location.pathname, [location.pathname])
  const redirectTarget = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.pathname}${window.location.search}${window.location.hash}`
    }
    const hash = location.hash ?? ""
    const searchObj = location.search
    let searchString = ""
    if (searchObj && typeof searchObj === "object") {
      const params = new URLSearchParams()
      for (const key of Object.keys(searchObj)) {
        const value = (searchObj as Record<string, unknown>)[key]
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, String(v)))
        } else if (value !== undefined && value !== null) {
          params.set(key, String(value))
        }
      }
      const query = params.toString()
      searchString = query ? `?${query}` : ""
    }
    return `${location.pathname}${searchString}${hash}`
  }, [location.hash, location.pathname, location.search])

  const handleSignOut = async () => {
    await auth.signOut()
    navigate({ to: "/" })
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden text-midnight">
      <BackgroundCanvases />
      <header className="sticky top-0 z-40 bg-gradient-to-b from-white/35 via-white/20 to-transparent text-midnight backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-3 text-midnight transition hover:opacity-90">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/95 shadow-inner">
              <img src={logoImage} alt="Valley Airporter logo" className="h-10 w-10 object-contain" />
            </div>
            <div>
              <p className="font-heading text-lg uppercase tracking-[0.35em] text-horizon drop-shadow-sm">
                Valley Airporter
              </p>
              <p className="text-xs text-horizon/70">
                Convenience • Safety • Reliability
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-midnight backdrop-blur-2xl md:flex">
            {navItems.map((item) => (
              <div key={item.to} className="group relative">
                <Link
                  to={item.to}
                  className={clsx(
                    "relative px-3 py-1 text-sm font-medium text-horizon transition whitespace-nowrap",
                    "rounded-full border border-transparent hover:text-midnight",
                    activePath === item.to &&
                      "border-horizon/50 bg-white text-midnight shadow-glow",
                  )}
                >
                  {item.label}
                </Link>
                {item.children ? (
                  <div className="invisible absolute left-0 top-full z-40 mt-2 min-w-[260px] rounded-2xl border border-white/40 bg-white/90 p-3 text-sm shadow-xl opacity-0 transition group-hover:visible group-hover:opacity-100">
                    <ul className="space-y-2">
                      {item.children.map((child) => (
                        <li key={child.to}>
                          <Link
                            to={child.to}
                            className="block rounded-xl px-3 py-2 text-midnight/80 transition hover:bg-horizon/10 hover:text-horizon"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {auth.user ? (
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 rounded-full border border-horizon/40 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-white/90"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            ) : (
              <Link
                to="/auth"
                search={{ redirect: redirectTarget }}
                className="inline-flex items-center gap-2 rounded-full border border-horizon/40 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-white/90"
              >
                Sign In
              </Link>
            )}
          </div>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-white/60 text-horizon backdrop-blur-2xl md:hidden"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
        {isMenuOpen ? (
          <div className="border-t border-white/40 bg-white/60 px-4 pb-6 pt-2 text-midnight backdrop-blur-2xl md:hidden">
            <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <div key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm font-medium text-midnight transition",
                    activePath === item.to &&
                      "bg-white/80 text-horizon shadow-glow",
                  )}
                >
                  {item.label}
                </Link>
                {item.children ? (
                  <div className="ml-4 mt-2 space-y-2">
                    {item.children.map((child) => (
                      <Link
                        key={child.to}
                        to={child.to}
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-xl px-3 py-2 text-sm text-midnight/70 transition hover:bg-horizon/10 hover:text-horizon"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <button
              onClick={() => {
                setMenuOpen(false)
                if (auth.user) {
                  void handleSignOut()
                } else {
                  navigate({
                    to: "/auth",
                    search: { redirect: redirectTarget },
                  })
                }
              }}
              className="rounded-full border border-horizon/40 bg-white/70 px-4 py-2 text-sm font-semibold uppercase tracking-[0.32em] text-horizon transition hover:bg-white/90"
            >
              {auth.user ? "Sign Out" : "Sign In"}
            </button>
          </nav>
          </div>
        ) : null}
      </header>
      <main className="relative z-30 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 overflow-y-auto px-4 pb-16 pt-10 text-midnight sm:px-8">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}

const BackgroundCanvases = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
    <div className="absolute inset-0 bg-gradient-to-br from-[#f9fbff] via-[#f1f6ff] to-[#e3edff]" />
    <div className="absolute inset-x-0 top-10 mx-auto h-[520px] w-[92%] max-w-6xl rounded-full bg-gradient-to-r from-[#f7fbff] via-[#e8f5ff] to-[#fef6ff] blur-[140px] opacity-80" />
    <div className="absolute left-[-10%] top-1/3 h-72 w-72 rounded-full bg-[#c7e7ff66] blur-[120px]" />
    <div className="absolute right-[-8%] top-1/2 h-[22rem] w-[22rem] rounded-full bg-[#ffd1f066] blur-[130px]" />
    <div className="absolute bottom-[-12%] left-1/4 h-[18rem] w-[18rem] rounded-full bg-[#cbdcff80] blur-[120px]" />
  </div>
)

const SiteFooter = () => (
  <footer className="relative z-30 border-t border-white/40 bg-white/20 text-midnight backdrop-blur-2xl">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-8">
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        <FooterInfo
          icon={MapPin}
          title="Address"
          lines={[
            "31631 S Fraser Way Unit #101",
            "Abbotsford, BC V2T 1T8",
          ]}
        />
        <FooterInfo
          icon={Phone}
          title="Call / Text"
          lines={[
            "(604) 751-6688",
            "Toll-free (877) 604-6688",
          ]}
        />
        <FooterInfo icon={Mail} title="Email" lines={["info@valleyairporter.ca"]} />
        <FooterInfo icon={Clock} title="Hours" lines={["24 hours • 7 days • 365"]} />
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="space-y-4">
          <p className="font-heading text-sm uppercase tracking-[0.3em] text-horizon">
            About Valley Airporter
          </p>
          <p className="text-sm text-midnight/80">
            Trusted Fraser Valley airport shuttle since 2008. From solo travellers to corporate
            charters, our professional chauffeurs deliver dependable door-to-door service.
          </p>
        </div>
        <div>
          <p className="font-heading text-sm uppercase tracking-[0.3em] text-horizon">
            Quick Links
          </p>
          <ul className="mt-4 space-y-2 text-sm text-midnight/80">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="transition hover:text-horizon">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-heading text-sm uppercase tracking-[0.3em] text-horizon">
            Dispatch Hotline
          </p>
          <p className="mt-4 text-sm text-midnight/80">
            Same-day or emergency travel? Call or text for immediate scheduling.
          </p>
          <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-horizon/40 bg-white/70 px-4 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-horizon shadow-sm">
            <Phone className="h-4 w-4" />
            (604) 751-6688
          </div>
        </div>
      </div>

      <div className="border-t border-white/40 pt-6 text-xs text-midnight/70">
        © {new Date().getFullYear()} Valley Airporter Ltd. All rights reserved.
      </div>
    </div>
  </footer>
)

const FooterInfo = ({
  icon: Icon,
  title,
  lines,
}: {
  icon: typeof MapPin
  title: string
  lines: string[]
}) => (
  <div className="flex items-start gap-3">
    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-horizon/40 bg-white/70 text-horizon">
      <Icon className="h-5 w-5" aria-hidden />
    </div>
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-horizon/80">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-sm text-midnight/80">
          {line}
        </p>
      ))}
    </div>
  </div>
)
