import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { AppProviders } from "@/app/providers/AppProviders"
import { router } from "@/app/router"

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Root element #root not found.")
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders router={router} />
  </StrictMode>,
)
