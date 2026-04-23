/**
 * Timezone-aware date helpers. Prateek is always in Asia/Kolkata so we
 * trust `user.timezone` as the single source of truth.
 */

export function getLocalDate(timezone: string, date: Date = new Date()): string {
  // YYYY-MM-DD in the user's local timezone.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getLocalHour(timezone: string, date: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return parseInt(h, 10);
}

export function getLocalMinute(timezone: string, date: Date = new Date()): number {
  const m = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    minute: "2-digit",
  }).format(date);
  return parseInt(m, 10);
}

/** ISO day of week: Monday = 1 … Sunday = 7, in the user's timezone. */
export function getLocalIsoDayOfWeek(timezone: string, date: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(date);
  const map: Record<string, number> = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };
  return map[weekday] ?? 1;
}

/** Returns midnight-of-local-date as a UTC Date suitable for a Postgres DATE column. */
export function getLocalDateUTC(timezone: string, date: Date = new Date()): Date {
  const ymd = getLocalDate(timezone, date);
  return new Date(`${ymd}T00:00:00Z`);
}
