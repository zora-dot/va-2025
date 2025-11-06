import { createRootRouteWithContext, createRoute, createRouter } from "@tanstack/react-router"
import { lazy } from "react"
import { AppShell } from "@/components/layout/AppShell"
import type { AuthContextValue } from "@/lib/types/auth"
import type { FirebaseServices } from "@/app/providers/FirebaseContext"

const HomePage = lazy(async () => {
  const module = await import("@/pages/landing/HomePage")
  return { default: module.HomePage }
})

const CustomerPortal = lazy(async () => {
  const module = await import("@/pages/portal/CustomerPortal")
  return { default: module.CustomerPortal }
})

const CustomerReceiptsPage = lazy(async () => {
  const module = await import("@/pages/portal/customer/CustomerReceiptsPage")
  return { default: module.CustomerReceiptsPage }
})

const CustomerDocumentsPage = lazy(async () => {
  const module = await import("@/pages/portal/customer/CustomerDocumentsPage")
  return { default: module.CustomerDocumentsPage }
})

const CustomerSupportPage = lazy(async () => {
  const module = await import("@/pages/portal/customer/CustomerSupportPage")
  return { default: module.CustomerSupportPage }
})

const CustomerBookingOptionsPage = lazy(async () => {
  const module = await import("@/pages/portal/customer/CustomerBookingOptionsPage")
  return { default: module.CustomerBookingOptionsPage }
})

const CustomerPreferencesPage = lazy(async () => {
  const module = await import("@/pages/portal/customer/CustomerPreferencesPage")
  return { default: module.CustomerPreferencesPage }
})

const CustomerNotificationsPage = lazy(async () => {
  const module = await import("@/pages/portal/customer/CustomerNotificationsPage")
  return { default: module.CustomerNotificationsPage }
})

const DriverPortal = lazy(async () => {
  const module = await import("@/pages/portal/DriverPortal")
  return { default: module.DriverPortal }
})

const DriverToolsPage = lazy(async () => {
  const module = await import("@/pages/portal/driver/DriverToolsPage")
  return { default: module.DriverToolsPage }
})

const AdminPortal = lazy(async () => {
  const module = await import("@/pages/portal/AdminPortal")
  return { default: module.AdminPortal }
})

const AdminOperationsPage = lazy(async () => {
  const module = await import("@/pages/portal/admin/AdminOperationsPage")
  return { default: module.AdminOperationsPage }
})

const AdminFleetPage = lazy(async () => {
  const module = await import("@/pages/portal/admin/AdminFleetPage")
  return { default: module.AdminFleetPage }
})

const AdminCommunicationsPage = lazy(async () => {
  const module = await import("@/pages/portal/admin/AdminCommunicationsPage")
  return { default: module.AdminCommunicationsPage }
})

const AdminAnalyticsPage = lazy(async () => {
  const module = await import("@/pages/portal/admin/AdminAnalyticsPage")
  return { default: module.AdminAnalyticsPage }
})

const AdminAlertsPage = lazy(async () => {
  const module = await import("@/pages/portal/admin/AdminAlertsPage")
  return { default: module.AdminAlertsPage }
})

const AdminDocumentsPage = lazy(async () => {
  const module = await import("@/pages/portal/admin/AdminDocumentsPage")
  return { default: module.AdminDocumentsPage }
})

const GuestPortal = lazy(async () => {
  const module = await import("@/pages/portal/GuestPortal")
  return { default: module.GuestPortal }
})

const NotFoundPage = lazy(async () => {
  const module = await import("@/pages/landing/NotFoundPage")
  return { default: module.NotFoundPage }
})

const AuthPage = lazy(async () => {
  const module = await import("@/pages/auth/AuthPage")
  return { default: module.AuthPage }
})

const ProfileCompletionPage = lazy(async () => {
  const module = await import("@/pages/auth/ProfileCompletionPage")
  return { default: module.ProfileCompletionPage }
})

const MagicLinkPage = lazy(async () => {
  const module = await import("@/pages/auth/MagicLinkPage")
  return { default: module.MagicLinkPage }
})

const SetPasswordPage = lazy(async () => {
  const module = await import("@/pages/auth/SetPasswordPage")
  return { default: module.SetPasswordPage }
})

const BookingPage = lazy(async () => {
  const module = await import("@/pages/booking/BookingPage")
  return { default: module.BookingPage }
})

const FaqPage = lazy(async () => {
  const module = await import("@/pages/faq/FaqPage")
  return { default: module.FaqPage }
})

const ReviewsPage = lazy(async () => {
  const module = await import("@/pages/reviews/ReviewsPage")
  return { default: module.ReviewsPage }
})

const ContactPage = lazy(async () => {
  const module = await import("@/pages/contact/ContactPage")
  return { default: module.ContactPage }
})

const ToursPage = lazy(async () => {
  const module = await import("@/pages/tours/ToursPage")
  return { default: module.ToursPage }
})

const ThankYouPage = lazy(async () => {
  const module = await import("@/pages/thank-you/ThankYouPage")
  return { default: module.ThankYouPage }
})
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

const customerReceiptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/customer/receipts",
  component: CustomerReceiptsPage,
})

const customerDocumentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/customer/documents",
  component: CustomerDocumentsPage,
})

const customerSupportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/customer/support",
  component: CustomerSupportPage,
})

const customerPreferencesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/customer/preferences",
  component: CustomerPreferencesPage,
})

const customerNotificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/customer/notifications",
  component: CustomerNotificationsPage,
})

const customerBookingOptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/customer/bookings/$bookingId/options",
  component: CustomerBookingOptionsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    payment: typeof search.payment === "string" ? (search.payment as string) : undefined,
    canSwitchToOnline:
      typeof search.canSwitchToOnline === "boolean"
        ? (search.canSwitchToOnline as boolean)
        : search.canSwitchToOnline === "true",
    bookingNumber:
      typeof search.bookingNumber === "number"
        ? (search.bookingNumber as number)
        : typeof search.bookingNumber === "string"
          ? Number.parseInt(search.bookingNumber as string, 10) || undefined
          : undefined,
  }),
})

const driverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/driver",
  component: DriverPortal,
})

const driverToolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/driver/tools",
  component: DriverToolsPage,
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/admin",
  component: AdminPortal,
})

const adminOperationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/admin/operations",
  component: AdminOperationsPage,
})

const adminFleetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/admin/fleet",
  component: AdminFleetPage,
})

const adminCommunicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/admin/communications",
  component: AdminCommunicationsPage,
})

const adminAnalyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/admin/analytics",
  component: AdminAnalyticsPage,
})

const adminAlertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/admin/alerts",
  component: AdminAlertsPage,
})

const adminDocumentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/admin/documents",
  component: AdminDocumentsPage,
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

const profileCompletionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/profile",
  component: ProfileCompletionPage,
})

const magicLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/magic-link",
  component: MagicLinkPage,
})

const setPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/set-password",
  component: SetPasswordPage,
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

const thankYouRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/thank-you",
  component: ThankYouPage,
})
const toursRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tours",
  component: ToursPage,
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  customerRoute,
  customerReceiptsRoute,
  customerDocumentsRoute,
  customerSupportRoute,
  customerPreferencesRoute,
  customerNotificationsRoute,
  customerBookingOptionsRoute,
  driverRoute,
  driverToolsRoute,
  adminRoute,
  adminOperationsRoute,
  adminFleetRoute,
  adminCommunicationsRoute,
  adminAnalyticsRoute,
  adminAlertsRoute,
  adminDocumentsRoute,
  guestRoute,
  authRoute,
  magicLinkRoute,
  setPasswordRoute,
  profileCompletionRoute,
  bookingRoute,
  faqRoute,
  reviewsRoute,
  toursRoute,
  thankYouRoute,
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
