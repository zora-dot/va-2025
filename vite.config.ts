import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import path from "path"

const enablePwa = process.env.VITE_ENABLE_PWA === "true"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(enablePwa
      ? [VitePWA({
      registerType: "autoUpdate",
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "va-images",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/api\/.*$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "va-api",
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: "Valley Airporter Shuttle",
        short_name: "Valley Shuttle",
        description: "Premium airport shuttle bookings, driver tracking, and operations in one modern experience.",
        theme_color: "#050816",
        background_color: "#050816",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      }
    })]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) {
              return "firebase"
            }
            if (id.includes("@tanstack")) {
              return "tanstack"
            }
            if (id.includes("date-fns")) {
              return "date-fns"
            }
            if (id.includes("lucide-react")) {
              return "icons"
            }
          }
        },
      },
    },
  }
})
