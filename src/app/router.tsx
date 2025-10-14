import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { AppShell } from "@/components/layout/AppShell"
import { HomePage } from "@/pages/landing/HomePage"
import { CustomerPortal } from "@/pages/portal/CustomerPortal"
import { DriverPortal } from "@/pages/portal/DriverPortal"
import { AdminPortal } from "@/pages/portal/AdminPortal"
import { GuestPortal } from "@/pages/portal/GuestPortal"
import { NotFoundPage } from "@/pages/landing/NotFoundPage"
import { AuthPage } from "@/pages/auth/AuthPage"
import { BookingPage } from "@/pages/booking/BookingPage"
import { FaqPage } from "@/pages/faq/FaqPage"
import { ReviewsPage } from "@/pages/reviews/ReviewsPage"
import { DestinationPage } from "@/pages/destinations/DestinationPage"
import { ContactPage } from "@/pages/contact/ContactPage"
import { ToursPage } from "@/pages/tours/ToursPage"
import type { AuthContextValue } from "@/lib/types/auth"
import type { FirebaseServices } from "@/app/providers/FirebaseContext"

export interface RouterContext {
  auth: AuthContextValue
  firebase: FirebaseServices
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFoundPage,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
})

const customerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/customer",
  component: CustomerPortal,
})

const driverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/driver",
  component: DriverPortal,
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/admin",
  component: AdminPortal,
})

const guestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/guest",
  component: GuestPortal,
})

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: AuthPage,
})

const bookingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booking",
  component: BookingPage,
})

const faqRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/faq",
  component: FaqPage,
})

const reviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reviews",
  component: ReviewsPage,
})

const contactRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contact",
  component: ContactPage,
})

const toursRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tours",
  component: ToursPage,
})

const destinationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/destinations/$slug",
  component: DestinationPage,
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  customerRoute,
  driverRoute,
  adminRoute,
  guestRoute,
  authRoute,
  bookingRoute,
  faqRoute,
  reviewsRoute,
  toursRoute,
  destinationRoute,
  contactRoute,
])

export const router = createRouter({
  routeTree,
  context: {
    auth: undefined!,
    firebase: undefined!,
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
