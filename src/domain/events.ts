/**
 * Event engine.
 *
 * Adding a function to a wedding is not "insert a row". A new event lands in
 * the middle of four days that are already spoken for: venues have curfews and
 * capacities, guests have to physically travel between places, two things
 * cannot happen in the same room at the same time, and a Sangeet that runs to
 * 1 AM is normal while a Haldi that does is a typo.
 *
 * So this module answers one question — *what should someone know before they
 * commit this event?* — as a pure function over serialisable inputs, which is
 * why the same checks run live in the editor as the user types and again on the
 * server before the write.
 *
 * Times are minutes from midnight of the event's own date, and are allowed to
 * exceed 1440 when a function runs past midnight: the seeded Sangeet ends at
 * 1500, which is 1 AM the next morning. Every helper here respects that.
 */

import { MINUTES_PER_DAY, formatMinute, toCivil } from "@/lib/dates";
import type { EventKind, EventNode, VenueNode } from "./types";

// ────────────────────────────────────────────────────────────── Kinds & presets

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  HALDI: "Haldi",
  MEHENDI: "Mehendi",
  SANGEET: "Sangeet",
  SHAADI: "Shaadi",
  RECEPTION: "Reception",
  WELCOME: "Welcome dinner",
  PUJA: "Puja",
  COCKTAIL: "Cocktails",
  AFTERPARTY: "Afterparty",
  BRUNCH: "Brunch",
  CUSTOM: "Something else",
};

/**
 * What each kind of function usually looks like.
 *
 * Not rules — starting points. Choosing "Mehendi" fills in a late-afternoon
 * start, a six-hour run and a green accent, and every one of them stays
 * editable. It exists so the common case is three fields, not fourteen.
 */
export interface EventKindPreset {
  /** Suggested name, which the family can overwrite. */
  name: string;
  tone: string;
  startMinute: number;
  durationMinutes: number;
  dressCode: string;
  /** Shown under the picker so the choice explains itself. */
  hint: string;
  /** Daytime functions read badly at midnight; used for the odd-hours check. */
  daytime: boolean;
}

export const EVENT_KIND_PRESETS: Record<EventKind, EventKindPreset> = {
  HALDI: {
    name: "Haldi", tone: "haldi", startMinute: 600, durationMinutes: 180,
    dressCode: "Yellows and whites", daytime: true,
    hint: "Morning, at home or poolside. Turmeric ruins clothes — say so in the dress code.",
  },
  MEHENDI: {
    name: "Mehendi", tone: "mehendi", startMinute: 960, durationMinutes: 360,
    dressCode: "Greens and pastels", daytime: false,
    hint: "Long and unhurried — henna takes hours per pair of hands.",
  },
  SANGEET: {
    name: "Sangeet", tone: "sangeet", startMinute: 1140, durationMinutes: 360,
    dressCode: "Cocktail Indian", daytime: false,
    hint: "Runs late. Check the venue's curfew before promising an after-hours DJ.",
  },
  SHAADI: {
    name: "Shaadi", tone: "shaadi", startMinute: 1020, durationMinutes: 480,
    dressCode: "Traditional formal", daytime: false,
    hint: "The muhurat drives the start time — set it once the pandit confirms.",
  },
  RECEPTION: {
    name: "Reception", tone: "reception", startMinute: 1140, durationMinutes: 270,
    dressCode: "Black tie / Indian formal", daytime: false,
    hint: "Seated dinner and speeches. Usually the last night.",
  },
  WELCOME: {
    name: "Welcome dinner", tone: "amber", startMinute: 1140, durationMinutes: 210,
    dressCode: "Smart casual", daytime: false,
    hint: "For guests who fly in early. Smaller than everything that follows.",
  },
  PUJA: {
    name: "Puja", tone: "saffron", startMinute: 540, durationMinutes: 120,
    dressCode: "Traditional", daytime: true,
    hint: "Often family-only and often weeks before the wedding — both are fine here.",
  },
  COCKTAIL: {
    name: "Cocktails", tone: "indigo", startMinute: 1200, durationMinutes: 180,
    dressCode: "Cocktail", daytime: false,
    hint: "Check the venue actually permits alcohol before you plan a bar.",
  },
  AFTERPARTY: {
    name: "Afterparty", tone: "plum", startMinute: 1380, durationMinutes: 180,
    dressCode: "Whatever you're still standing in", daytime: false,
    hint: "Crosses midnight — the end time is allowed to be tomorrow.",
  },
  BRUNCH: {
    name: "Farewell brunch", tone: "teal", startMinute: 660, durationMinutes: 180,
    dressCode: "Relaxed", daytime: true,
    hint: "The goodbye. Schedule it against departure flights, not the party before.",
  },
  CUSTOM: {
    name: "", tone: "slate", startMinute: 1080, durationMinutes: 180,
    dressCode: "", daytime: false,
    hint: "A pooja, a cricket match, a boat day — anything the family is doing.",
  },
};

/** Kinds a family usually only holds once, offered but flagged on a repeat. */
const SINGULAR_KINDS: EventKind[] = ["SHAADI", "RECEPTION"];

// ─────────────────────────────────────────────────────────────────────── Slugs

export function slugifyEventName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "event";
}

/** A slug that doesn't collide, because `[weddingId, slug]` is unique. */
export function uniqueEventSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugifyEventName(name);
  if (!used.has(base)) return base;
  for (let n = 2; n < 200; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ─────────────────────────────────────────────────────────────────────── Times

/** Absolute minutes on a shared origin, so cross-midnight spans compare cleanly. */
export function absoluteMinute(date: Date, minute: number): number {
  const day = Math.round(toCivil(date).getTime() / 86_400_000);
  return day * MINUTES_PER_DAY + minute;
}

export function eventSpan(event: {
  date: Date;
  startMinute: number;
  endMinute: number;
}): { start: number; end: number } {
  return {
    start: absoluteMinute(event.date, event.startMinute),
    end: absoluteMinute(event.date, event.endMinute),
  };
}

export function eventDuration(event: { startMinute: number; endMinute: number }): number {
  return event.endMinute - event.startMinute;
}

/** True when the end time falls on the following calendar day. */
export function runsPastMidnight(event: { endMinute: number }): boolean {
  return event.endMinute >= MINUTES_PER_DAY;
}

/**
 * Turn what a time input can express into stored minutes.
 *
 * `<input type="time">` can only say "02:00", never "2 AM tomorrow", so the
 * form carries a separate "ends the next day" switch and this puts the two
 * back together.
 */
export function resolveEndMinute(
  startMinute: number,
  endInputMinute: number,
  endsNextDay: boolean,
): number {
  if (endsNextDay) return endInputMinute + MINUTES_PER_DAY;
  // A plain end-before-start is almost always someone meaning "past midnight".
  if (endInputMinute <= startMinute) return endInputMinute + MINUTES_PER_DAY;
  return endInputMinute;
}

export function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

// ────────────────────────────────────────────────────────────────────── Checks

export type CheckSeverity = "error" | "warning" | "note";

export interface EventCheck {
  key: string;
  severity: CheckSeverity;
  message: string;
  detail?: string;
}

/**
 * Everything the checks need, in a shape that survives the server→client
 * boundary — the editor runs these on every keystroke without a round trip.
 */
export interface EventPlanningContext {
  weddingStart: Date;
  weddingEnd: Date;
  events: EventLike[];
  venues: VenueLike[];
  /** Expected heads per event, when known. Falls back to `estimatedGuests`. */
  expectedByEvent?: Record<string, number>;
}

/**
 * Only the parts of an event and a venue the checks actually read.
 *
 * Narrow on purpose: the editor runs these checks in the browser on every
 * keystroke, so the page ships six fields per event rather than the whole
 * snapshot. `EventNode` and `VenueNode` both satisfy these structurally.
 */
export type EventLike = Pick<
  EventNode,
  "id" | "name" | "kind" | "date" | "startMinute" | "endMinute" | "venueId"
>;

export type VenueLike = Pick<
  VenueNode,
  "id" | "name" | "capacity" | "curfewMinute" | "alcoholAllowed" | "hasRainBackup"
>;

export interface EventDraft {
  /** Set when editing, so the event doesn't clash with itself. */
  id?: string | null;
  name: string;
  kind: EventKind;
  date: Date;
  startMinute: number;
  endMinute: number;
  venueId: string | null;
  estimatedGuests: number;
  isPrivate: boolean;
}

/** Minutes of travel below which two venues in one day look optimistic. */
const TRAVEL_GAP_MINUTES = 45;
const MAX_SENSIBLE_DURATION = 18 * 60;

/**
 * Everything worth knowing before this event is saved.
 *
 * Errors block the write. Warnings and notes never do — a family that wants a
 * 4 AM havan is right and the app is wrong, so the app says its piece once and
 * gets out of the way.
 */
export function checkEventDraft(
  context: EventPlanningContext,
  draft: EventDraft,
): EventCheck[] {
  const checks: EventCheck[] = [];
  const others = context.events.filter((e) => e.id !== draft.id);
  const span = eventSpan(draft);
  const duration = eventDuration(draft);
  const venue = draft.venueId
    ? context.venues.find((v) => v.id === draft.venueId) ?? null
    : null;

  // ── Errors ───────────────────────────────────────────────────────────────
  if (!draft.name.trim()) {
    checks.push({
      key: "name-missing",
      severity: "error",
      message: "Give the function a name.",
    });
  }

  if (duration <= 0) {
    checks.push({
      key: "duration-zero",
      severity: "error",
      message: "It has to last longer than nothing.",
      detail: "Set an end time after the start, or tick “runs past midnight”.",
    });
  } else if (duration > MAX_SENSIBLE_DURATION) {
    checks.push({
      key: "duration-long",
      severity: "error",
      message: `That's ${Math.round(duration / 60)} hours long.`,
      detail:
        "Anything over eighteen hours is usually a mistyped end time. Split it into two functions if it really does run all day and all night.",
    });
  }

  if (draft.estimatedGuests < 0) {
    checks.push({
      key: "guests-negative",
      severity: "error",
      message: "Guest numbers can't be negative.",
    });
  }

  // ── The wedding window ───────────────────────────────────────────────────
  const day = toCivil(draft.date).getTime();
  const windowStart = toCivil(context.weddingStart).getTime();
  const windowEnd = toCivil(context.weddingEnd).getTime();

  if (day < windowStart) {
    const days = Math.round((windowStart - day) / 86_400_000);
    checks.push({
      key: "before-window",
      severity: "note",
      message: `${days} ${days === 1 ? "day" : "days"} before the wedding begins.`,
      detail:
        "Fine for a puja, a mata ki chowki or a welcome dinner — just checking the date is the one you meant.",
    });
  } else if (day > windowEnd) {
    const days = Math.round((day - windowEnd) / 86_400_000);
    checks.push({
      key: "after-window",
      severity: "note",
      message: `${days} ${days === 1 ? "day" : "days"} after the last day.`,
      detail:
        "Farewell brunches and post-wedding pujas live here. Guests booked to fly home may not be around.",
    });
  }

  // ── Clashes with other functions ─────────────────────────────────────────
  for (const other of others) {
    const otherSpan = eventSpan(other);
    if (!overlaps(span, otherSpan)) continue;

    const sameVenue =
      draft.venueId !== null && other.venueId === draft.venueId;

    checks.push({
      key: `overlap:${other.id}`,
      severity: sameVenue ? "warning" : "note",
      message: sameVenue
        ? `Double-booked with ${other.name} at the same venue.`
        : `Runs at the same time as ${other.name}.`,
      detail: `${other.name} runs ${formatMinute(other.startMinute)}–${formatMinute(
        other.endMinute,
      )}. ${
        sameVenue
          ? "One room cannot host both."
          : "Guests invited to both will have to choose."
      }`,
    });
  }

  // ── Travel between venues on the same day ────────────────────────────────
  if (draft.venueId) {
    for (const other of others) {
      if (!other.venueId || other.venueId === draft.venueId) continue;
      const otherSpan = eventSpan(other);
      if (overlaps(span, otherSpan)) continue;

      const gap =
        span.start >= otherSpan.end
          ? span.start - otherSpan.end
          : otherSpan.start - span.end;
      if (gap >= 0 && gap < TRAVEL_GAP_MINUTES) {
        const otherVenue = context.venues.find((v) => v.id === other.venueId);
        checks.push({
          key: `travel:${other.id}`,
          severity: "note",
          message: `Only ${gap} min between this and ${other.name}.`,
          detail: `They're at different venues${
            otherVenue ? ` — ${otherVenue.name}` : ""
          }. Two hundred guests do not move in ${gap} minutes.`,
        });
      }
    }
  }

  // ── The venue itself ─────────────────────────────────────────────────────
  if (!draft.venueId) {
    checks.push({
      key: "no-venue",
      severity: "note",
      message: "No venue yet.",
      detail:
        "Perfectly fine — the event still counts toward readiness and will flag itself until one is chosen.",
    });
  } else if (venue) {
    if (venue.curfewMinute !== null && draft.endMinute > venue.curfewMinute) {
      const over = draft.endMinute - venue.curfewMinute;
      checks.push({
        key: "curfew",
        severity: "warning",
        message: `${venue.name} closes at ${formatMinute(venue.curfewMinute)}.`,
        detail: `This runs ${over} min past it. Either bring the end forward or get the curfew extended in writing.`,
      });
    }

    const expected =
      context.expectedByEvent?.[draft.id ?? ""] ?? draft.estimatedGuests;
    if (venue.capacity !== null && expected > venue.capacity) {
      checks.push({
        key: "capacity",
        severity: "warning",
        message: `${expected} guests, but ${venue.name} holds ${venue.capacity}.`,
        detail: `${expected - venue.capacity} more than the venue can take.`,
      });
    }

    if (!venue.alcoholAllowed && ALCOHOL_KINDS.includes(draft.kind)) {
      checks.push({
        key: "alcohol",
        severity: "warning",
        message: `${venue.name} doesn't allow alcohol.`,
        detail: "Worth knowing before the bar is quoted for.",
      });
    }

    if (!venue.hasRainBackup) {
      checks.push({
        key: "rain",
        severity: "note",
        message: `${venue.name} has no wet-weather backup.`,
        detail: "One monsoon afternoon and there's nowhere to move to.",
      });
    }
  }

  // ── Sanity on the clock ──────────────────────────────────────────────────
  const preset = EVENT_KIND_PRESETS[draft.kind];
  if (preset.daytime && draft.startMinute >= 20 * 60) {
    checks.push({
      key: "late-daytime",
      severity: "note",
      message: `A ${EVENT_KIND_LABEL[draft.kind].toLowerCase()} starting at ${formatMinute(
        draft.startMinute,
      )}?`,
      detail: "Usually a daytime function. Check AM/PM.",
    });
  }
  if (draft.startMinute < 5 * 60) {
    checks.push({
      key: "very-early",
      severity: "note",
      message: `Starts at ${formatMinute(draft.startMinute)}.`,
      detail: "Right for a muhurat, worth a second look otherwise.",
    });
  }
  if (draft.endMinute > MINUTES_PER_DAY + 4 * 60) {
    checks.push({
      key: "very-late",
      severity: "note",
      message: `Runs until ${formatMinute(draft.endMinute)} the next morning.`,
      detail: "Check staff, transport and the venue's curfew all stretch that far.",
    });
  }

  // ── Duplicates ───────────────────────────────────────────────────────────
  const nameKey = draft.name.trim().toLowerCase();
  if (nameKey && others.some((e) => e.name.trim().toLowerCase() === nameKey)) {
    checks.push({
      key: "duplicate-name",
      severity: "note",
      message: `There's already a function called “${draft.name.trim()}”.`,
      detail: "Two are allowed — give them distinct names so nobody confuses them.",
    });
  }

  if (
    SINGULAR_KINDS.includes(draft.kind) &&
    others.some((e) => e.kind === draft.kind)
  ) {
    checks.push({
      key: "duplicate-kind",
      severity: "note",
      message: `You already have a ${EVENT_KIND_LABEL[draft.kind]}.`,
      detail: "Both will generate their own vendor and readiness requirements.",
    });
  }

  // ── Visibility ───────────────────────────────────────────────────────────
  if (draft.isPrivate && draft.estimatedGuests > 40) {
    checks.push({
      key: "private-large",
      severity: "note",
      message: `Marked private, but planned for ${draft.estimatedGuests} guests.`,
      detail: "Private functions stay off guest-facing views and RSVP pages.",
    });
  }

  return checks;
}

const ALCOHOL_KINDS: EventKind[] = ["COCKTAIL", "AFTERPARTY", "SANGEET", "RECEPTION"];

export function hasBlockingError(checks: EventCheck[]): boolean {
  return checks.some((check) => check.severity === "error");
}

/** Where a new function belongs in the running order. */
export function nextSortOrder(events: { sortOrder: number }[]): number {
  return events.reduce((max, e) => Math.max(max, e.sortOrder), 0) + 10;
}

/**
 * A plain-language summary of what removing an event takes with it.
 *
 * Archiving is soft — nothing is destroyed — but the family still deserves to
 * be told that fourteen tasks and a booked photographer are attached to the
 * thing they're about to remove.
 */
export interface EventRemovalImpact {
  tasks: number;
  invitations: number;
  budgetItems: number;
  vendors: number;
  timelineEntries: number;
  outfits: number;
}

export function describeRemoval(impact: EventRemovalImpact): string[] {
  const lines: string[] = [];
  const add = (n: number, one: string, many: string, fate: string) => {
    if (n > 0) lines.push(`${n} ${n === 1 ? one : many} ${fate}`);
  };
  add(impact.tasks, "task", "tasks", "will be archived with it");
  add(impact.timelineEntries, "run-of-show entry", "run-of-show entries", "will be archived with it");
  add(impact.invitations, "invitation", "invitations", "will be withdrawn");
  add(impact.budgetItems, "budget line", "budget lines", "will stop being forecast");
  add(impact.vendors, "vendor", "vendors", "will no longer be linked to it");
  add(impact.outfits, "outfit", "outfits", "will lose their occasion");
  return lines;
}
