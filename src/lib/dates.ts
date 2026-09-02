// Timezone-aware date helpers, shared by the UI and the API.
//
// Two traps this exists to close:
//  1. Netlify functions and Neon both run in UTC, so CURRENT_DATE rolls over
//     mid-evening for anyone west of Greenwich - an 8pm workout landed on
//     tomorrow.
//  2. `new Date('2026-09-01')` parses as UTC midnight, which renders as
//     Aug 31 in any negative-offset timezone.

export const DEFAULT_TIME_ZONE = 'UTC';

export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date it is right now in `timeZone`, as YYYY-MM-DD. */
export function todayIn(timeZone: string | null | undefined, now: Date = new Date()): string {
  const zone = isValidTimeZone(timeZone) ? (timeZone as string) : DEFAULT_TIME_ZONE;
  // en-CA renders as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The browser's own zone, e.g. "America/New_York". */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Today where the user actually is, as YYYY-MM-DD. */
export function localToday(): string {
  return todayIn(browserTimeZone());
}

/** Parse a date-only value as local midnight, so it displays as the day it says. */
export function parseDateOnly(value: string): Date {
  return new Date(`${String(value).slice(0, 10)}T00:00:00`);
}

/** Format a date-only value for display, without the UTC shift. */
export function formatDateOnly(
  value: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return parseDateOnly(value).toLocaleDateString(undefined, options);
}

/** `days` before the given YYYY-MM-DD, as YYYY-MM-DD. */
export function daysBefore(date: string, days: number): string {
  const d = parseDateOnly(date);
  d.setDate(d.getDate() - days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
