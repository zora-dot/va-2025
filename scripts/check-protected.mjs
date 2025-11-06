#!/usr/bin/env node

import { execSync } from "node:child_process"
import process from "node:process"

const PROTECTED_PATHS = [
  "src/features/booking/components/BookingWizard.tsx",
  "src/features/booking/pricing.ts",
  "src/features/dashboard",
]

const override = process.env.ALLOW_PROTECTED_EDITS === "true"

if (override) {
  process.exit(0)
}

const runGit = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim()
  } catch (error) {
    console.warn(`[protect] Unable to verify protected files because git ${args} failed.`)
    return ""
  }
}

const statusOutput = runGit("status --porcelain")

if (!statusOutput) {
  process.exit(0)
}

const touchedFiles = statusOutput
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.replace(/^[?MADRCU ]+/, ""))

const violatedPaths = touchedFiles.filter((file) =>
  PROTECTED_PATHS.some((protectedPath) => file === protectedPath || file.startsWith(`${protectedPath}/`)),
)

if (violatedPaths.length) {
  console.warn("")
  console.warn("⚠️  Protected modules changed:")
  violatedPaths.forEach((file) => console.warn(`   - ${file}`))
  console.warn("")
  console.warn("Reminder: these modules are critical. Review changes carefully.")
  console.warn("")
}
