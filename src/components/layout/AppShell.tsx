import { Link, Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router"
import { LogOut, Menu, MapPin, Phone, Mail, Clock } from "lucide-react"
import { Component, ReactNode, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { clsx } from "clsx"
import { useAuth } from "@/lib/hooks/useAuth"

const baseNavItems = [
  {
    to: "/",
    label: "Home",
  },
  { to: "/booking", label: "Book Now" },
  { to: "/faq", label: "FAQ" },
  { to: "/reviews", label: "Reviews" },
  { to: "/tours", label: "Tours by Shuttle" },
  { to: "/contact", label: "Contact Us" },
]

const roleRouteMap: Record<string, { to: string; label: string }> = {
  customer: { to: "/portal/customer", label: "Customer" },
  driver: { to: "/portal/driver", label: "Driver" },
  admin: { to: "/portal/admin", label: "Admin" },
}

const LOGO_IMAGE_URL = "https://i.postimg.cc/R0q7gbmw/compressed-transparent-logo.png"
const CANONICAL_ORIGIN = "https://valleyairporter.ca"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export const AppShell = () => {
  const { location } = useRouterState()
  const navigate = useNavigate()
  const router = useRouter()
  const auth = useAuth()
  const [isMenuOpen, setMenuOpen] = useState(false)
  const mainRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const contentOffset = 10

  const dashboardLinks = useMemo(() => {
    if (!auth.user) return []
    const roles = Array.from(new Set(auth.roles ?? []))
    const mapped = roles
      .map((role) => roleRouteMap[role])
      .filter((entry): entry is { to: string; label: string } => Boolean(entry))

    mapped.sort((a, b) => {
      if (a.label === "Customer") return -1
      if (b.label === "Customer") return 1
      return a.label.localeCompare(b.label)
    })

    if (mapped.length === 0) {
      return [roleRouteMap.customer]
    }

    return mapped
  }, [auth.roles, auth.user])

  const navItems = useMemo(() => {
    const items = [...baseNavItems]
    if (auth.user && dashboardLinks.length > 0) {
      const primary = dashboardLinks[0]
      items.splice(1, 0, { to: primary.to, label: "Dashboard" })
    }
    return items
  }, [auth.user, dashboardLinks])

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

  useEffect(() => {
    if (typeof window === "undefined") return
    const routesToPrefetch: Array<
      "/portal/customer" | "/portal/driver" | "/portal/admin" | "/booking"
    > = auth.user
      ? ["/portal/customer", "/portal/driver", "/portal/admin"]
      : ["/booking"]

    const schedulePrefetch = () => {
      routesToPrefetch.forEach((path) => {
        router.preloadRoute({ to: path })
      })
    }

    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(schedulePrefetch)
      return () => window.cancelIdleCallback(handle)
    }

    const timeout = window.setTimeout(schedulePrefetch, 200)
    return () => window.clearTimeout(timeout)
  }, [auth.user, router])

  useEffect(() => {
    setMenuOpen(false)
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, left: 0 })
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    }
  }, [location.pathname, location.search])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return
    const pagePath = redirectTarget
    const pageLocation =
      typeof window !== "undefined" && window.location ? window.location.href : pagePath

    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: pageLocation,
    })
  }, [redirectTarget])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    const update = () => {
      setHeaderHeight(headerRef.current?.offsetHeight ?? 0)
    }
    update()
    const resizeObserverAvailable = typeof ResizeObserver !== "undefined"
    let observer: ResizeObserver | null = null
    if (resizeObserverAvailable && headerRef.current) {
      observer = new ResizeObserver(() => update())
      observer.observe(headerRef.current)
    }
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("resize", update)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.style.setProperty("--va-header-height", `${headerHeight}px`)
  }, [headerHeight])

  useEffect(() => {
    if (typeof document === "undefined") return
    const canonicalUrl = new URL(`${location.pathname}${location.search ?? ""}`, CANONICAL_ORIGIN).toString()
    let canonicalLink = document.head.querySelector<HTMLLinkElement>("link[rel='canonical']")
    if (!canonicalLink) {
      canonicalLink = document.createElement("link")
      canonicalLink.setAttribute("rel", "canonical")
      document.head.appendChild(canonicalLink)
    }
    canonicalLink.setAttribute("href", canonicalUrl)
  }, [location.pathname, location.search])

  return (
    <div className="flex min-h-screen flex-col text-midnight">
      <BackgroundCanvases />
      <header
        role="banner"
        ref={headerRef}
        className="relative z-40 text-midnight shadow-md"
        data-app-header
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-3 text-midnight transition hover:opacity-90">
            <div className="flex h-[150px] w-[200px] items-center justify-center overflow-visible">
              <img
                src={LOGO_IMAGE_URL}
                alt="Valley Airporter logo"
                className="h-[150px] w-[200px] rounded-none object-contain"
              />
            </div>
          </Link>
          <nav className="hidden items-center gap-6 px-4 py-2 text-midnight md:flex">
            {navItems.map((item) => {
              const isActive = activePath === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={clsx(
                    "relative whitespace-nowrap px-3 py-1 text-lg font-medium text-horizon transition",
                    "hover:text-midnight",
                    isActive && "text-midnight underline decoration-horizon/60 decoration-2 underline-offset-8",
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {auth.user ? (
              <button onClick={handleSignOut} className="va-button va-button--secondary">
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            ) : null}
          </div>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/45 bg-transparent text-horizon transition hover:bg-white/20 md:hidden"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMenuOpen}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {isMenuOpen ? (
          <div className="border-t border-white/40 px-4 pb-6 pt-2 text-midnight md:hidden">
            <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = activePath === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={clsx(
                    "px-4 py-2 text-sm font-medium text-midnight transition",
                    isActive && "text-horizon underline decoration-horizon/60 decoration-2 underline-offset-6",
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
            {auth.user ? (
              <button
                onClick={() => {
                  setMenuOpen(false)
                  void handleSignOut()
                }}
                className="va-button va-button--secondary w-full justify-center"
              >
                Sign Out
              </button>
            ) : null}
          </nav>
          </div>
        ) : null}
      </header>
      <main
        role="main"
        id="main-content"
        ref={mainRef}
        className="relative z-30 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 pb-16 text-midnight sm:px-8"
        style={{
          paddingTop: `${contentOffset}px`,
          scrollPaddingTop: `var(--va-header-height, ${headerHeight}px)`,
        }}
      >
        <RouteErrorBoundary>
          <Suspense fallback={<RouteLoading />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <SiteFooter />
    </div>
  )
}

const RouteLoading = () => (
  <div className="grid animate-pulse gap-6">
    <div className="h-44 rounded-3xl bg-white/60" />
    <div className="grid gap-4 md:grid-cols-2">
      <div className="h-32 rounded-3xl bg-white/50" />
      <div className="h-32 rounded-3xl bg-white/50" />
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="h-24 rounded-3xl bg-white/40" />
      <div className="h-24 rounded-3xl bg-white/40" />
      <div className="h-24 rounded-3xl bg-white/40" />
    </div>
  </div>
)

class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined as Error | undefined }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
    if (typeof window !== "undefined") {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="max-w-md rounded-3xl border border-horizon/20 bg-white/80 p-6 text-center text-midnight/80 shadow-glow">
            <p className="font-heading text-base uppercase tracking-[0.3em] text-horizon/70">
              Something went wrong
            </p>
            <p className="mt-3 text-sm text-midnight/70">
              {this.state.error?.message ?? "We hit a snag loading this view. Try again in a moment."}
            </p>
            <button
              onClick={this.handleRetry}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-horizon/40 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-horizon transition hover:border-horizon/60 hover:bg-white"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const BackgroundCanvases = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
    <div className="absolute inset-0 bg-gradient-to-br from-[#95b7ff] via-[#c2d7ff] to-[#e0ecff]" />
    <div className="absolute inset-x-0 top-10 mx-auto h-[520px] w-[92%] max-w-6xl rounded-full bg-gradient-to-r from-[#aecaff] via-[#cce1ff] to-[#e9f1ff] blur-[140px] opacity-85" />
    <div className="absolute left-[-10%] top-1/3 h-72 w-72 rounded-full bg-[#8bb2ff75] blur-[120px]" />
    <div className="absolute right-[-8%] bottom-1/3 h-[22rem] w-[22rem] rounded-full bg-[#9abfff70] blur-[130px]" />
    <div className="absolute bottom-[-12%] left-1/4 h-[18rem] w-[18rem] rounded-full bg-[#d1e4ff85] blur-[120px]" />
  </div>
)

const SiteFooter = () => (
  <footer
    role="contentinfo"
    className="relative z-30 border-t border-white/40 bg-white/20 text-midnight backdrop-blur-2xl"
  >
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
            <a key="call" href="tel:+16047516688" className="text-horizon underline-offset-2 hover:underline">
              (604) 751-6688
            </a>,
            <a key="text" href="sms:+16047516688" className="text-horizon underline-offset-2 hover:underline">
              Text dispatch
            </a>,
          ]}
        />
        <FooterInfo
          icon={Mail}
          title="Email"
          lines={[
            <a key="mail" href="mailto:info@valleyairporter.ca" className="text-horizon underline-offset-2 hover:underline">
              info@valleyairporter.ca
            </a>,
          ]}
        />
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
            {baseNavItems.map((item) => (
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
          <a
            href="tel:+16047516688"
            className="mt-4 inline-flex items-center gap-3 rounded-full border border-horizon/40 bg-white/70 px-4 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-horizon shadow-sm transition hover:border-horizon/60 hover:text-horizon"
          >
            <Phone className="h-4 w-4" />
            (604) 751-6688
          </a>
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
  lines: Array<string | ReactNode>
}) => (
  <div className="flex items-start gap-3">
    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-horizon/40 bg-white/70 text-horizon">
      <Icon className="h-5 w-5" aria-hidden />
    </div>
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-horizon/80">{title}</p>
      {lines.map((line, index) => (
        <p key={index} className="text-sm text-midnight/80">
          {line}
        </p>
      ))}
    </div>
  </div>
)
