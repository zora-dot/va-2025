import * as functions from "firebase-functions";

const asTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const functionsConfig = (() => {
  try {
    return functions.config();
  } catch {
    return {};
  }
})();

export const SERVICE_TIME_ZONE =
  asTrimmedString(process.env.SERVICE_TIME_ZONE) ??
  asTrimmedString(functionsConfig?.service?.time_zone) ??
  "America/Vancouver";

type DateParts = { year: number; month: number; day: number };
type TimeParts = { hour: number; minute: number; second: number };

const parseDateParts = (value?: string | null): DateParts | null => {
  if (!value) return null;
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
};

const parseTimeParts = (value?: string | null): TimeParts | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?$/i.exec(trimmed);
  if (!match) return null;

  let hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const second = match[3] ? Number.parseInt(match[3], 10) : 0;
  const period = match[4] ? match[4].toUpperCase() : null;

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  if (period) {
    hour = hour % 12;
    if (period === "PM") hour += 12;
  }

  if (hour < 0 || hour > 23) return null;

  return { hour, minute, second };
};

const getTimeZoneOffsetMinutes = (timeZone: string, date: Date) => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number.parseInt(map.year, 10),
    Number.parseInt(map.month, 10) - 1,
    Number.parseInt(map.day, 10),
    Number.parseInt(map.hour, 10),
    Number.parseInt(map.minute, 10),
    Number.parseInt(map.second, 10),
  );

  return (asUtc - date.getTime()) / 60000;
};

const buildDateInTimeZone = (dateParts: DateParts, timeParts: TimeParts, timeZone: string) => {
  const initial = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    timeParts.second,
  );
  const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, new Date(initial));
  return new Date(initial - offsetMinutes * 60 * 1000);
};

export const parseDateTimeInTimeZone = (
  dateValue?: string | null,
  timeValue?: string | null,
  timeZone: string = SERVICE_TIME_ZONE,
): Date | null => {
  const dateParts = parseDateParts(dateValue);
  const timeParts = parseTimeParts(timeValue);
  if (!dateParts || !timeParts) return null;
  try {
    return buildDateInTimeZone(dateParts, timeParts, timeZone);
  } catch {
    return null;
  }
};
