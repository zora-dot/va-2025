export const vehicleOptions = [
  {
    id: "sevenVan",
    label: "7-Seater Van (up to 5 passengers)",
    helper: "Plenty of room for families and carry-ons.",
  },
  {
    id: "chevyExpress",
    label: "8-Seater Chevrolet Express (up to 7 passengers, extra luggage space)",
    helper: "Great for sports teams and ski groups.",
  },
  {
    id: "mercedesSprinter",
    label: "12-Seater Mercedes Benz Sprinter Van (up to 11 passengers)",
    helper: "Premium shuttle with standing room height.",
  },
  {
    id: "freightlinerSprinter",
    label: "15-Seater Freightliner Sprinter (up to 14 passengers)",
    helper: "Max capacity option for large crews.",
  },
] as const

export type VehicleOptionId = (typeof vehicleOptions)[number]["id"]

export const vehicleLabelMap: Record<VehicleOptionId, string> = Object.fromEntries(
  vehicleOptions.map((option) => [option.id, option.label]),
) as Record<VehicleOptionId, string>

export const vehiclePreferenceMap: Record<VehicleOptionId, "standard" | "van"> = {
  sevenVan: "van",
  chevyExpress: "van",
  mercedesSprinter: "van",
  freightlinerSprinter: "van",
}

export const determineVehicleOption = (passengerCount: number): VehicleOptionId => {
  if (passengerCount >= 12) return "freightlinerSprinter"
  if (passengerCount >= 8) return "mercedesSprinter"
  if (passengerCount >= 6) return "chevyExpress"
  return "sevenVan"
}

const unknownVehicleLabel = (vehicleId: string) =>
  vehicleId
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

export const summarizeVehicleSelections = (selections?: readonly string[] | null): string | null => {
  if (!Array.isArray(selections) || selections.length === 0) return null
  const labels = selections
    .map((selection) => vehicleLabelMap[selection as VehicleOptionId] ?? unknownVehicleLabel(selection))
    .filter((label) => label.length > 0)
  return labels.length > 0 ? labels.join(", ") : null
}
