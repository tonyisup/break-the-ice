export type CalendarDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const DEFAULT_ORGANIZATION_TIME_ZONE = "America/Los_Angeles";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getZonedCalendarDate(
  date: Date,
  timeZone: string,
): { isoDate: string; dayOfWeek: CalendarDay } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const weekday = value("weekday")?.toLowerCase() as CalendarDay | undefined;

  if (!year || !month || !day || !weekday) {
    throw new Error(`Unable to calculate calendar date for ${timeZone}`);
  }

  return { isoDate: `${year}-${month}-${day}`, dayOfWeek: weekday };
}
