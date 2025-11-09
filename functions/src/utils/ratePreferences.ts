export const derivePreferredRateKey = (
  passengerCount: number,
  vehicleSelections?: string[] | null,
): string | null => {
  if (!Array.isArray(vehicleSelections) || vehicleSelections.length === 0) {
    return null
  }

  const primary = vehicleSelections.find((value) => typeof value === "string" && value.trim().length > 0)
  if (!primary) return null

  if (passengerCount === 6) {
    if (primary === "chevyExpress") return "7v"
  }

  if (passengerCount >= 8 && passengerCount <= 11 && primary === "mercedesSprinter") {
    return "8-11"
  }

  if (passengerCount >= 12 && primary === "freightlinerSprinter") {
    return "12-14"
  }

  return null
}
