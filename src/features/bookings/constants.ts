export const STATUS_REASON_CODES = [
  { value: "customer_request", label: "Customer requested change" },
  { value: "driver_delay", label: "Driver delay" },
  { value: "vehicle_issue", label: "Vehicle issue" },
  { value: "weather", label: "Weather" },
  { value: "comms_failure", label: "Communications failure" },
  { value: "operational_override", label: "Operational override" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
] as const;

export type StatusReasonCode = (typeof STATUS_REASON_CODES)[number]["value"];

export const PRICING_ADJUST_REASON_CODES = [
  { value: "fare_match", label: "Fare match / competitor parity" },
  { value: "loyalty_credit", label: "Loyalty credit" },
  { value: "service_recovery", label: "Service recovery" },
  { value: "vehicle_change", label: "Vehicle change" },
  { value: "manual_override", label: "Manual override" },
  { value: "staff_error", label: "Staff correction" },
  { value: "other", label: "Other" },
] as const;

export type PricingAdjustReasonCode =
  (typeof PRICING_ADJUST_REASON_CODES)[number]["value"];
