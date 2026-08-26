/**
 * Date helpers.
 *
 * Every calendar day in this app is a "civil date" — a day with no timezone.
 * Postgres `@db.Date` hands us a JS Date pinned to UTC midnight, so all day
 * arithmetic happens in UTC and never shifts when the user's clock does.
 *
 * Times-of-day are integer minutes from midnight (1035 === 5:15 PM). That makes
 * run-of-show maths exact and drag-to-reschedule a subtraction.
 */

export const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86_400_000;

/** Parse `YYYY-MM-DD` into a UTC-midnight Date. */
export function civilDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Strip any time component, returning UTC midnight of that calendar day. */
export function toCivil(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Today as a civil date, read from the viewer's local calendar. */
export function today(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function toISODate(date: Date): string {
  return toCivil(date).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(toCivil(date).getTime() + days * MS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((toCivil(to).getTime() - toCivil(from).getTime()) / MS_PER_DAY);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toCivil(a).getTime() === toCivil(b).getTime();
}

// ───────────────────────────────────────────────────────── Minutes of the day

/** 1035 -> "5:15 PM" */
export function formatMinute(minute: number): string {
  const normalised = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(normalised / 60);
  const mins = normalised % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

/** 1035 -> "17:15", for `<input type="time">`. */
export function minuteToTimeInput(minute: number): string {
  const normalised = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalised / 60)).padStart(2, "0")}:${String(
    normalised % 60,
  ).padStart(2, "0")}`;
}

/** "17:15" -> 1035 */
export function timeInputToMinute(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatDuration(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

// ───────────────────────────────────────────────────────────────── Formatting

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** "16 June 2027" */
export function formatLongDate(date: Date): string {
  const d = toCivil(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "16 Jun" */
export function formatShortDate(date: Date): string {
  const d = toCivil(date);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "16 Jun 2027" */
export function formatMediumDate(date: Date): string {
  const d = toCivil(date);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatWeekday(date: Date): string {
  return WEEKDAYS[toCivil(date).getUTCDay()];
}

/** "16–19 June 2027", collapsing shared month and year. */
export function formatDateRange(start: Date, end: Date): string {
  const s = toCivil(start);
  const e = toCivil(end);
  if (s.getTime() === e.getTime()) return formatLongDate(s);
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
  }
  if (s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${formatShortDate(s)} – ${formatShortDate(e)} ${s.getUTCFullYear()}`;
  }
  return `${formatMediumDate(s)} – ${formatMediumDate(e)}`;
}

/**
 * Human relative day: "Today", "Tomorrow", "In 4 days", "3 days ago".
 * Deliberately plain language — families read this, not project managers.
 */
export function formatRelativeDay(target: Date, from: Date = today()): string {
  const diff = daysBetween(from, target);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0) {
    if (diff < 7) return `In ${diff} days`;
    if (diff < 14) return "Next week";
    if (diff < 60) return `In ${Math.round(diff / 7)} weeks`;
    return `In ${Math.round(diff / 30)} months`;
  }
  const past = -diff;
  if (past < 7) return `${past} days ago`;
  if (past < 60) return `${Math.round(past / 7)} weeks ago`;
  return `${Math.round(past / 30)} months ago`;
}

/** "2 days late" / "Due in 3 days" — used on task rows. */
export function formatDueLabel(due: Date, from: Date = today()): string {
  const diff = daysBetween(from, due);
  if (diff < 0) return `${-diff} ${-diff === 1 ? "day" : "days"} late`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff < 7) return `Due in ${diff} days`;
  return `Due ${formatMediumDate(due)}`;
}

export function formatDateTime(date: Date): string {
  const local = new Date(date);
  const mins = local.getHours() * 60 + local.getMinutes();
  return `${local.getDate()} ${MONTHS_SHORT[local.getMonth()]} · ${formatMinute(mins)}`;
}

/** "just now", "12 min ago", "3 hr ago", "yesterday" — for the activity feed. */
export function formatTimeAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return formatMediumDate(new Date(date));
}

/** `<input type="date">` value. */
export function toDateInput(date: Date | null | undefined): string {
  return date ? toISODate(date) : "";
}
