const TZ = 'America/New_York';

export const fmtNumber = (n: number) => n.toLocaleString('en-US');

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(iso).toLocaleString('en-US', { timeZone: TZ, ...opts });

export const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

/** A date-only value (YYYY-MM-DD) shown as a calendar day, with no time zone shift. */
export const fmtDay = (isoDate: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'UTC', ...opts });

export const todayLabel = (now = new Date()) =>
  now.toLocaleString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });

/** "Today 9:12 AM", "Yesterday 11:00 PM" or "Oct 2, 2026 9:12 AM". */
export function fmtRelativeDay(iso: string, now = new Date()) {
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
  const d = new Date(iso);
  if (day(d) === day(now)) return `Today ${fmtTime(iso)}`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday ${fmtTime(iso)}`;
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

export function fmtBytes(n: number) {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function fmtDuration(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}, ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
