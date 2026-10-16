export const TIME_ZONE = 'America/New_York';

/** Calendar date (YYYY-MM-DD) of an instant in America/New_York. */
export function nyDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Term dates are stored as midnight UTC of the calendar day. */
export function parseDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days from `fromIsoDate` to `toIsoDate`. */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  return Math.round((parseDateOnly(toIsoDate).getTime() - parseDateOnly(fromIsoDate).getTime()) / 86_400_000);
}

/** The last second of a calendar day in America/New_York, as a UTC instant. */
export function nyEndOfDay(isoDate: string): Date {
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(`${isoDate}T23:59:59.000Z`);
    candidate.setUTCHours(candidate.getUTCHours() + offsetHours);
    if (nyDate(candidate) === isoDate) {
      const next = new Date(candidate.getTime() + 1000);
      if (nyDate(next) !== isoDate) return candidate;
    }
  }
  // Unreachable for America/New_York; fall back to noon UTC of the next day minus a second.
  return new Date(`${isoDate}T23:59:59.000-05:00`);
}
