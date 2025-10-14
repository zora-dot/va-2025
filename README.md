# Valley Airporter Progressive Web App

Modern 2025 booking and operations platform for Valley Airporter Ltd. Built with React, Vite, Tailwind, and Firebase to deliver a glassmorphism interface for customers, drivers, admins, and guests.

## Tech Stack

- React 19 + Vite 7 (TypeScript) with TanStack Router and Query
- Tailwind CSS with custom glass UI tokens
- Firebase (Auth, Firestore, Storage, Messaging) with local emulator support
- Square Web Payments SDK (primary) and Stripe fallback via Firebase Cloud Functions
- Google Calendar sync, Aviationstack proxy, and offline-ready PWA (vite-plugin-pwa)

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Copy the environment template**

   ```bash
   cp .env.example .env.local
   ```

   Populate `.env.local` with Firebase config, Google Calendar API key, Square/Stripe IDs, etc. Do not commit this file.

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   When `VITE_APP_ENV=local` the app connects to Firebase emulators (Auth, Firestore, Storage).

4. **Build the PWA**

   ```bash
   npm run build
   npm run preview
   ```

   Output includes an installable manifest and icons in `dist/`.

## Firebase Setup

- `firebase.json`, `firestore.rules`, `storage.rules`, and `firestore.indexes.json` are preconfigured.
- After running `firebase init`, use `firebase emulators:start` alongside `npm run dev`.
- Cloud Functions (not yet scaffolded) will orchestrate payments (Square/Stripe), Google Calendar sync, and Aviationstack status polling.
- Outbound email notifications use SMTP credentials exposed as function environment variables:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, optional `SMTP_SECURE`, `NOTIFY_FROM`, `NOTIFY_TO` (defaults to `info@valleyairporter.ca`).
  - Configure via `firebase functions:config:set` or the Firebase console before deploying the new contact/booking triggers.

## Project Structure

- `src/app` – router tree and shared providers
- `src/components` – layout shell and reusable glass UI pieces
- `src/pages/landing` – marketing/overview views
- `src/pages/portal` – role dashboards (admin, driver, customer, guest)
- `src/lib` – environment helpers, Firebase bootstrap, shared types
- `src/data/pricing/pricingMatrix.json` – Valley Airporter pricing matrix (imported from source JSON)

## Next Steps

- Wire Firebase Auth (email verification) and role-based access control
- Build booking flow with pricing matrix logic and Square payments
- Implement messaging threads + push/SMS notifications
- Add driver telemetry map, analytics dashboards, and calendar sync
- Expand accessibility testing (WCAG 2.1 AA) and automated test suites
