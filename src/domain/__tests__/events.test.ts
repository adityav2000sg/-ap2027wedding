/**
 * Event engine tests.
 *
 * The point of these is the awkward cases, not the happy path: a function that
 * ends tomorrow morning, two functions in one room, two hundred guests asked to
 * cross town in twenty minutes, a puja three months before anything else.
 */

import { describe, expect, it } from "vitest";

import {
  checkEventDraft,
  describeRemoval,
  EVENT_KIND_PRESETS,
  eventDuration,
  eventSpan,
  hasBlockingError,
  nextSortOrder,
  overlaps,
  resolveEndMinute,
  runsPastMidnight,
  slugifyEventName,
  uniqueEventSlug,
  type EventDraft,
  type EventPlanningContext,
} from "../events";
import { makeEvent } from "./fixtures";

const WEDDING_START = new Date(Date.UTC(2027, 5, 16));
const WEDDING_END = new Date(Date.UTC(2027, 5, 19));

const VENUE = {
  id: "venue-1",
  name: "The Ritz-Carlton",
  capacity: 300,
  curfewMinute: 1440, // midnight
  alcoholAllowed: true,
  hasRainBackup: true,
};

function context(overrides: Partial<EventPlanningContext> = {}): EventPlanningContext {
  return {
    weddingStart: WEDDING_START,
    weddingEnd: WEDDING_END,
    events: [],
    venues: [VENUE],
    ...overrides,
  };
}

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    name: "Sangeet",
    kind: "SANGEET",
    date: new Date(Date.UTC(2027, 5, 17)),
    startMinute: 1140, // 7 PM
    endMinute: 1380, // 11 PM
    venueId: "venue-1",
    estimatedGuests: 200,
    isPrivate: false,
    ...overrides,
  };
}

const keys = (checks: { key: string }[]) => checks.map((c) => c.key);

// ────────────────────────────────────────────────────────────────────── Slugs

describe("slugs", () => {
  it("makes a URL-safe slug from a name", () => {
    expect(slugifyEventName("Mata ki Chowki")).toBe("mata-ki-chowki");
    expect(slugifyEventName("Cocktails & Canapés")).toBe("cocktails-and-canapes");
    expect(slugifyEventName("  ")).toBe("event");
  });

  it("never collides with an existing slug", () => {
    expect(uniqueEventSlug("Haldi", [])).toBe("haldi");
    expect(uniqueEventSlug("Haldi", ["haldi"])).toBe("haldi-2");
    expect(uniqueEventSlug("Haldi", ["haldi", "haldi-2"])).toBe("haldi-3");
  });
});

// ────────────────────────────────────────────────────────────────────── Times

describe("times", () => {
  it("treats an end time before the start as the next morning", () => {
    // 10 PM to 2 AM.
    expect(resolveEndMinute(1320, 120, false)).toBe(1560);
    expect(resolveEndMinute(1320, 120, true)).toBe(1560);
  });

  it("leaves a same-day end time alone", () => {
    expect(resolveEndMinute(600, 780, false)).toBe(780);
  });

  it("adds a day when told to, even for a time later in the day", () => {
    expect(resolveEndMinute(600, 780, true)).toBe(780 + 1440);
  });

  it("knows when an event runs past midnight", () => {
    expect(runsPastMidnight({ endMinute: 1500 })).toBe(true);
    expect(runsPastMidnight({ endMinute: 1380 })).toBe(false);
  });

  it("measures duration across midnight correctly", () => {
    expect(eventDuration({ startMinute: 1320, endMinute: 1560 })).toBe(240);
  });

  it("compares spans on different days", () => {
    const day1 = eventSpan({
      date: new Date(Date.UTC(2027, 5, 17)),
      startMinute: 1320,
      endMinute: 1560, // runs into the 18th
    });
    const day2 = eventSpan({
      date: new Date(Date.UTC(2027, 5, 18)),
      startMinute: 60, // 1 AM on the 18th
      endMinute: 180,
    });
    expect(overlaps(day1, day2)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────── Errors

describe("blocking errors", () => {
  it("refuses an event with no name", () => {
    const checks = checkEventDraft(context(), draft({ name: "  " }));
    expect(keys(checks)).toContain("name-missing");
    expect(hasBlockingError(checks)).toBe(true);
  });

  it("refuses an event that ends before it starts", () => {
    const checks = checkEventDraft(
      context(),
      draft({ startMinute: 1140, endMinute: 1000 }),
    );
    expect(keys(checks)).toContain("duration-zero");
    expect(hasBlockingError(checks)).toBe(true);
  });

  it("refuses an absurdly long event", () => {
    const checks = checkEventDraft(
      context(),
      draft({ startMinute: 0, endMinute: 1400 }),
    );
    expect(keys(checks)).toContain("duration-long");
  });

  it("accepts a normal event with nothing blocking", () => {
    expect(hasBlockingError(checkEventDraft(context(), draft()))).toBe(false);
  });

  it("accepts an afterparty that ends at 2 AM", () => {
    const checks = checkEventDraft(
      context(),
      draft({ kind: "AFTERPARTY", name: "Afterparty", startMinute: 1380, endMinute: 1560 }),
    );
    expect(hasBlockingError(checks)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────── Clashes

describe("clashes with other functions", () => {
  const sangeet = makeEvent({
    id: "event-sangeet",
    name: "Sangeet",
    kind: "SANGEET",
    date: new Date(Date.UTC(2027, 5, 17)),
    startMinute: 1140,
    endMinute: 1500,
    venueId: "venue-1",
  });

  it("warns when two functions share a venue at the same time", () => {
    const checks = checkEventDraft(
      context({ events: [sangeet] }),
      draft({ name: "Cocktails", kind: "COCKTAIL", startMinute: 1200, endMinute: 1320 }),
    );
    const clash = checks.find((c) => c.key === "overlap:event-sangeet");
    expect(clash?.severity).toBe("warning");
    expect(clash?.message).toContain("Double-booked");
  });

  it("only notes an overlap when the venues differ", () => {
    const checks = checkEventDraft(
      context({
        events: [sangeet],
        venues: [VENUE, { ...VENUE, id: "venue-2", name: "Beach Club" }],
      }),
      draft({ venueId: "venue-2", startMinute: 1200, endMinute: 1320 }),
    );
    expect(checks.find((c) => c.key === "overlap:event-sangeet")?.severity).toBe("note");
  });

  it("says nothing when the times don't meet", () => {
    const checks = checkEventDraft(
      context({ events: [sangeet] }),
      draft({ date: new Date(Date.UTC(2027, 5, 16)), startMinute: 600, endMinute: 780 }),
    );
    expect(keys(checks)).not.toContain("overlap:event-sangeet");
  });

  it("does not clash with itself when edited", () => {
    const checks = checkEventDraft(
      context({ events: [sangeet] }),
      draft({ id: "event-sangeet", startMinute: 1140, endMinute: 1500 }),
    );
    expect(keys(checks)).not.toContain("overlap:event-sangeet");
  });

  it("notices two hundred guests being moved between venues in twenty minutes", () => {
    const haldi = makeEvent({
      id: "event-haldi",
      name: "Haldi",
      kind: "HALDI",
      date: new Date(Date.UTC(2027, 5, 17)),
      startMinute: 600,
      endMinute: 780,
      venueId: "venue-2",
    });
    const checks = checkEventDraft(
      context({
        events: [haldi],
        venues: [VENUE, { ...VENUE, id: "venue-2", name: "Beach Club" }],
      }),
      draft({ startMinute: 800, endMinute: 1000 }),
    );
    expect(keys(checks)).toContain("travel:event-haldi");
  });
});

// ────────────────────────────────────────────────────────────────────── Venue

describe("the venue", () => {
  it("warns when the event outlasts the curfew", () => {
    const checks = checkEventDraft(
      context({ venues: [{ ...VENUE, curfewMinute: 1380 }] }),
      draft({ startMinute: 1140, endMinute: 1500 }),
    );
    const curfew = checks.find((c) => c.key === "curfew");
    expect(curfew?.severity).toBe("warning");
    expect(curfew?.detail).toContain("120 min past it");
  });

  it("warns when the guests won't fit", () => {
    const checks = checkEventDraft(
      context({ venues: [{ ...VENUE, capacity: 150 }] }),
      draft({ estimatedGuests: 200 }),
    );
    expect(checks.find((c) => c.key === "capacity")?.message).toContain("200 guests");
  });

  it("prefers a known expected headcount over the planning estimate", () => {
    const checks = checkEventDraft(
      context({
        venues: [{ ...VENUE, capacity: 150 }],
        expectedByEvent: { "event-1": 400 },
      }),
      draft({ id: "event-1", estimatedGuests: 10 }),
    );
    expect(checks.find((c) => c.key === "capacity")?.message).toContain("400 guests");
  });

  it("flags a dry venue for a function with a bar", () => {
    const checks = checkEventDraft(
      context({ venues: [{ ...VENUE, alcoholAllowed: false }] }),
      draft({ kind: "COCKTAIL" }),
    );
    expect(keys(checks)).toContain("alcohol");
  });

  it("says so when no venue is chosen, without blocking", () => {
    const checks = checkEventDraft(context(), draft({ venueId: null }));
    expect(checks.find((c) => c.key === "no-venue")?.severity).toBe("note");
    expect(hasBlockingError(checks)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────── Dates and time

describe("dates outside the wedding", () => {
  it("notes a puja held months earlier", () => {
    const checks = checkEventDraft(
      context(),
      draft({ kind: "PUJA", name: "Puja", date: new Date(Date.UTC(2027, 2, 1)), startMinute: 540, endMinute: 660 }),
    );
    const note = checks.find((c) => c.key === "before-window");
    expect(note?.severity).toBe("note");
    expect(note?.message).toContain("107 days before");
    expect(hasBlockingError(checks)).toBe(false);
  });

  it("notes a farewell brunch after the last day", () => {
    const checks = checkEventDraft(
      context(),
      draft({ kind: "BRUNCH", name: "Brunch", date: new Date(Date.UTC(2027, 5, 20)), startMinute: 660, endMinute: 840 }),
    );
    expect(keys(checks)).toContain("after-window");
  });

  it("flags a daytime function scheduled at night", () => {
    const checks = checkEventDraft(
      context(),
      draft({ kind: "HALDI", name: "Haldi", startMinute: 1320, endMinute: 1440 }),
    );
    expect(keys(checks)).toContain("late-daytime");
  });

  it("flags a function running deep into the next morning", () => {
    const checks = checkEventDraft(
      context(),
      draft({ kind: "AFTERPARTY", name: "Afterparty", startMinute: 1380, endMinute: 1740 }),
    );
    expect(keys(checks)).toContain("very-late");
  });
});

// ─────────────────────────────────────────────────────────────────── Presets

describe("presets", () => {
  it("gives every kind a usable starting point", () => {
    for (const [kind, preset] of Object.entries(EVENT_KIND_PRESETS)) {
      expect(preset.durationMinutes, kind).toBeGreaterThan(0);
      expect(preset.startMinute, kind).toBeGreaterThanOrEqual(0);
      expect(preset.startMinute, kind).toBeLessThan(1440);
      expect(preset.hint.length, kind).toBeGreaterThan(0);
    }
  });

  it("never proposes a preset the checks would reject", () => {
    for (const kind of Object.keys(EVENT_KIND_PRESETS) as (keyof typeof EVENT_KIND_PRESETS)[]) {
      const preset = EVENT_KIND_PRESETS[kind];
      const checks = checkEventDraft(
        context(),
        draft({
          kind,
          name: preset.name || "Something",
          startMinute: preset.startMinute,
          endMinute: preset.startMinute + preset.durationMinutes,
        }),
      );
      expect(hasBlockingError(checks), kind).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────────── Housekeeping

describe("housekeeping", () => {
  it("puts a new function at the end of the running order", () => {
    expect(nextSortOrder([])).toBe(10);
    expect(nextSortOrder([{ sortOrder: 10 }, { sortOrder: 30 }])).toBe(40);
  });

  it("describes what removal takes with it, in plain language", () => {
    const lines = describeRemoval({
      tasks: 14,
      invitations: 259,
      budgetItems: 3,
      vendors: 1,
      timelineEntries: 0,
      outfits: 2,
    });
    expect(lines).toContain("14 tasks will be archived with it");
    expect(lines).toContain("1 vendor will no longer be linked to it");
    expect(lines.some((l) => l.includes("run-of-show"))).toBe(false);
  });
});
