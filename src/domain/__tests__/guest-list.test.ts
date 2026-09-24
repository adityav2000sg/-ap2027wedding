import { describe, expect, it } from "vitest";

import {
  groupGuestRows,
  sortInvitationRows,
  summariseGuestRows,
  matchesSentFilter,
  nextSort,
  sortGuestRows,
  SORT_DEFAULT_DIR,
  type GuestListRow,
} from "../guest-list";

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.UTC(2026, 8, 1);

function row(over: Partial<GuestListRow> & { firstName: string; lastName: string }): GuestListRow {
  return {
    householdName: `${over.lastName} Family`,
    saveTheDateSent: true,
    sentAt: BASE,
    repliedAt: null,
    ...over,
  };
}

describe("ordering the guest list", () => {
  it("puts the newest reply first by default", () => {
    const rows = [
      row({ firstName: "Aarti", lastName: "Gujral", repliedAt: BASE + 2 * DAY }),
      row({ firstName: "Sivesh", lastName: "Sukumar", repliedAt: BASE + 9 * DAY }),
      row({ firstName: "Amit", lastName: "Arora", repliedAt: BASE + 5 * DAY }),
    ];
    const sorted = sortGuestRows(rows, { key: "replied", dir: SORT_DEFAULT_DIR.replied });
    expect(sorted.map((r) => r.firstName)).toEqual(["Sivesh", "Amit", "Aarti"]);
  });

  it("reverses to oldest first", () => {
    const rows = [
      row({ firstName: "Aarti", lastName: "Gujral", repliedAt: BASE + 2 * DAY }),
      row({ firstName: "Sivesh", lastName: "Sukumar", repliedAt: BASE + 9 * DAY }),
      row({ firstName: "Amit", lastName: "Arora", repliedAt: BASE + 5 * DAY }),
    ];
    const sorted = sortGuestRows(rows, { key: "replied", dir: "asc" });
    expect(sorted.map((r) => r.firstName)).toEqual(["Aarti", "Amit", "Sivesh"]);
  });

  /**
   * The bug this whole ordering exists to avoid. With 249 on the list and 30
   * replies, treating "hasn't replied" as time zero means "earliest first"
   * shows 219 silent people before the first actual answer.
   */
  it("sinks people with no reply to the bottom, whichever way it points", () => {
    const rows = [
      row({ firstName: "Silent", lastName: "Aaa", repliedAt: null }),
      row({ firstName: "Early", lastName: "Bbb", repliedAt: BASE + DAY }),
      row({ firstName: "Late", lastName: "Ccc", repliedAt: BASE + 8 * DAY }),
    ];
    for (const dir of ["asc", "desc"] as const) {
      const sorted = sortGuestRows(rows, { key: "replied", dir });
      expect(sorted[sorted.length - 1].firstName).toBe("Silent");
    }
  });

  it("orders the undated tail by name rather than at random", () => {
    const rows = [
      row({ firstName: "Zoya", lastName: "Zaveri", repliedAt: null }),
      row({ firstName: "Anil", lastName: "Anand", repliedAt: null }),
      row({ firstName: "Meera", lastName: "Mohindra", repliedAt: null }),
    ];
    const sorted = sortGuestRows(rows, { key: "replied", dir: "desc" });
    expect(sorted.map((r) => r.lastName)).toEqual(["Anand", "Mohindra", "Zaveri"]);
  });

  /**
   * A household link dates everybody in the family to the same moment. They
   * must not shuffle between renders, or the list flickers as it refreshes.
   */
  it("breaks ties on identical household timestamps by name, stably", () => {
    const together = BASE + 3 * DAY;
    const rows = [
      row({ firstName: "Swati", lastName: "Lamba", repliedAt: together }),
      row({ firstName: "Aakash", lastName: "Lamba", repliedAt: together }),
    ];
    const once = sortGuestRows(rows, { key: "replied", dir: "desc" });
    const twice = sortGuestRows(once, { key: "replied", dir: "desc" });
    expect(once.map((r) => r.firstName)).toEqual(["Aakash", "Swati"]);
    expect(twice.map((r) => r.firstName)).toEqual(once.map((r) => r.firstName));
  });

  it("sorts by name on the surname, both ways", () => {
    const rows = [
      row({ firstName: "Kapil", lastName: "Gujral" }),
      row({ firstName: "Aaditya", lastName: "Chowdhry" }),
      row({ firstName: "Swati", lastName: "Lamba" }),
    ];
    expect(sortGuestRows(rows, { key: "name", dir: "asc" }).map((r) => r.lastName))
      .toEqual(["Chowdhry", "Gujral", "Lamba"]);
    expect(sortGuestRows(rows, { key: "name", dir: "desc" }).map((r) => r.lastName))
      .toEqual(["Lamba", "Gujral", "Chowdhry"]);
  });

  it("sinks the never-sent when ordering by when the save-the-date went", () => {
    const rows = [
      row({ firstName: "Notyet", lastName: "Aaa", saveTheDateSent: false, sentAt: null }),
      row({ firstName: "Older", lastName: "Bbb", sentAt: BASE }),
      row({ firstName: "Newer", lastName: "Ccc", sentAt: BASE + 4 * DAY }),
    ];
    const sorted = sortGuestRows(rows, { key: "sent", dir: SORT_DEFAULT_DIR.sent });
    expect(sorted.map((r) => r.firstName)).toEqual(["Newer", "Older", "Notyet"]);
  });

  it("leaves the input array alone", () => {
    const rows = [
      row({ firstName: "Second", lastName: "Bbb", repliedAt: BASE }),
      row({ firstName: "First", lastName: "Aaa", repliedAt: BASE + DAY }),
    ];
    const before = rows.map((r) => r.firstName);
    sortGuestRows(rows, { key: "replied", dir: "desc" });
    expect(rows.map((r) => r.firstName)).toEqual(before);
  });
});

describe("grouping the guest list", () => {
  it("keeps families together and titled when ordered by household", () => {
    const rows = [
      row({ firstName: "Swati", lastName: "Lamba" }),
      row({ firstName: "Aaditya", lastName: "Chowdhry" }),
      row({ firstName: "Aakash", lastName: "Lamba" }),
    ];
    const sections = groupGuestRows(rows, { key: "household", dir: "asc" });
    expect(sections.map(([name]) => name)).toEqual(["Chowdhry Family", "Lamba Family"]);
    expect(sections[1][1]).toHaveLength(2);
  });

  it("flattens to one untitled run for every other ordering", () => {
    const rows = [
      row({ firstName: "Swati", lastName: "Lamba", repliedAt: BASE }),
      row({ firstName: "Aaditya", lastName: "Chowdhry", repliedAt: BASE + DAY }),
    ];
    const sections = groupGuestRows(rows, { key: "replied", dir: "desc" });
    expect(sections).toHaveLength(1);
    expect(sections[0][0]).toBeNull();
    expect(sections[0][1]).toHaveLength(2);
  });

  it("loses nobody, whatever the ordering", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row({
        firstName: `Guest${i}`,
        lastName: `Name${i % 7}`,
        repliedAt: i % 3 === 0 ? null : BASE + i * DAY,
      }),
    );
    for (const key of ["household", "name", "sent", "replied"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        const sections = groupGuestRows(sortGuestRows(rows, { key, dir }), { key, dir });
        const seen = sections.flatMap(([, people]) => people.map((p) => p.firstName));
        expect(new Set(seen).size).toBe(30);
      }
    }
  });

  it("files people with no household under one heading rather than dropping them", () => {
    const rows = [
      row({ firstName: "Alistair", lastName: "McGuire", householdName: null }),
      row({ firstName: "Aakash", lastName: "Lamba" }),
    ];
    const sections = groupGuestRows(rows, { key: "household", dir: "asc" });
    expect(sections.map(([name]) => name)).toContain("No household");
    expect(sections.flatMap(([, people]) => people)).toHaveLength(2);
  });
});

describe("the save-the-date filter", () => {
  it("passes everybody when unset", () => {
    expect(matchesSentFilter({ saveTheDateSent: true }, "")).toBe(true);
    expect(matchesSentFilter({ saveTheDateSent: false }, "")).toBe(true);
  });

  it("separates sent from not sent", () => {
    expect(matchesSentFilter({ saveTheDateSent: true }, "sent")).toBe(true);
    expect(matchesSentFilter({ saveTheDateSent: false }, "sent")).toBe(false);
    expect(matchesSentFilter({ saveTheDateSent: false }, "unsent")).toBe(true);
    expect(matchesSentFilter({ saveTheDateSent: true }, "unsent")).toBe(false);
  });
});

describe("clicking a column heading", () => {
  it("adopts the column's own default direction when you move to it", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "replied")).toEqual({
      key: "replied",
      dir: "desc",
    });
  });

  it("flips direction when you click the column you're already on", () => {
    expect(nextSort({ key: "replied", dir: "desc" }, "replied")).toEqual({
      key: "replied",
      dir: "asc",
    });
  });
});


function countable(over: Partial<Parameters<typeof summariseGuestRows>[0][number]> = {}) {
  return {
    householdId: "household-1",
    stdResponse: null,
    saveTheDateSent: true,
    needsAccommodation: false,
    rsvp: {},
    ...over,
  };
}

/**
 * These are the figures above the list, and the whole point of counting them
 * here is that they follow whatever the caller narrowed to. A count that
 * describes a different population from the rows underneath it is the bug.
 */
describe("counting the list you are looking at", () => {
  it("counts only the rows it is given", () => {
    const brideSide = [
      countable({ stdResponse: "YES" }),
      countable({ stdResponse: "YES" }),
      countable({ stdResponse: null }),
    ];
    const summary = summariseGuestRows(brideSide, 2);
    expect(summary.onTheList).toBe(3);
    expect(summary.yes).toBe(2);
    expect(summary.awaiting).toBe(1);
  });

  it("keeps yes, no and awaiting adding up to the list", () => {
    const rows = [
      ...Array.from({ length: 30 }, () => countable({ stdResponse: "YES" as const })),
      ...Array.from({ length: 4 }, () => countable({ stdResponse: "NO" as const })),
      ...Array.from({ length: 215 }, () => countable()),
    ];
    const summary = summariseGuestRows(rows, 2);
    expect(summary.yes + summary.no + summary.awaiting).toBe(summary.onTheList);
    expect(summary.onTheList).toBe(249);
    expect(summary.yes).toBe(30);
  });

  it("reports an empty list as zeroes rather than dividing by nothing", () => {
    const summary = summariseGuestRows([], 2);
    expect(summary.onTheList).toBe(0);
    expect(summary.awaiting).toBe(0);
    expect(summary.rooms).toBe(0);
    for (const value of Object.values(summary)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("counts rooms for the slice, rounding a part-share up to a whole room", () => {
    const rows = Array.from({ length: 5 }, () => countable({ needsAccommodation: true }));
    expect(summariseGuestRows(rows, 2).rooms).toBe(3);
    expect(summariseGuestRows(rows, 1).rooms).toBe(5);
  });

  it("never divides by zero if the wedding says nobody shares a room", () => {
    const rows = Array.from({ length: 3 }, () => countable({ needsAccommodation: true }));
    expect(summariseGuestRows(rows, 0).rooms).toBe(3);
  });

  it("counts households, giving anybody without one a party of their own", () => {
    const rows = [
      countable({ householdId: "a" }),
      countable({ householdId: "a" }),
      countable({ householdId: "b" }),
      countable({ householdId: null }),
      countable({ householdId: null }),
    ];
    const summary = summariseGuestRows(rows, 2);
    expect(summary.households).toBe(4);
  });

  it("counts the save-the-dates actually sent within the slice", () => {
    const rows = [
      countable({ saveTheDateSent: true }),
      countable({ saveTheDateSent: true }),
      countable({ saveTheDateSent: false }),
    ];
    const summary = summariseGuestRows(rows, 2);
    expect(summary.sent).toBe(2);
    expect(summary.onTheList).toBe(3);
  });

  it("reads per-event answers for the invitation stage", () => {
    const rows = [
      countable({ rsvp: { e1: "CONFIRMED", e2: "CONFIRMED" } }),
      countable({ rsvp: { e1: "DECLINED", e2: "NOT_INVITED" } }),
      countable({ rsvp: { e1: "PENDING" } }),
      countable({ rsvp: { e1: "NOT_INVITED", e2: "NOT_INVITED" } }),
    ];
    const summary = summariseGuestRows(rows, 2);
    expect(summary.confirmed).toBe(1);
    expect(summary.declined).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.notContacted).toBe(1);
  });
});


function household(name: string, over: { sentAt?: number | null; repliedAt?: number | null } = {}) {
  return { name, sentAt: BASE, repliedAt: null, ...over };
}

/**
 * The invitations tab is the one read to see what came in overnight, and it was
 * alphabetical only — so this morning's reply sat somewhere in the middle of
 * the As with nothing to distinguish it.
 */
describe("ordering the invitations list", () => {
  it("is alphabetical by household by default", () => {
    const rows = [household("Lamba"), household("Arora"), household("Chowdhry")];
    expect(sortInvitationRows(rows, { key: "name", dir: "asc" }).map((r) => r.name))
      .toEqual(["Arora", "Chowdhry", "Lamba"]);
    expect(sortInvitationRows(rows, { key: "name", dir: "desc" }).map((r) => r.name))
      .toEqual(["Lamba", "Chowdhry", "Arora"]);
  });

  it("puts the household that replied most recently first", () => {
    const rows = [
      household("Arora", { repliedAt: BASE + 2 * DAY }),
      household("Lamba", { repliedAt: BASE + 9 * DAY }),
      household("Chowdhry", { repliedAt: BASE + 5 * DAY }),
    ];
    expect(sortInvitationRows(rows, { key: "replied", dir: "desc" }).map((r) => r.name))
      .toEqual(["Lamba", "Chowdhry", "Arora"]);
  });

  it("keeps households that have not replied at the bottom, both ways", () => {
    const rows = [
      household("Aaa", { repliedAt: null }),
      household("Bbb", { repliedAt: BASE + DAY }),
      household("Ccc", { repliedAt: BASE + 6 * DAY }),
    ];
    for (const dir of ["asc", "desc"] as const) {
      const sorted = sortInvitationRows(rows, { key: "replied", dir });
      expect(sorted[sorted.length - 1].name).toBe("Aaa");
    }
  });

  it("falls back to the household name when two replied at the same moment", () => {
    const together = BASE + 3 * DAY;
    const rows = [
      household("Zaveri", { repliedAt: together }),
      household("Anand", { repliedAt: together }),
    ];
    expect(sortInvitationRows(rows, { key: "replied", dir: "desc" }).map((r) => r.name))
      .toEqual(["Anand", "Zaveri"]);
  });

  it("orders by when the save-the-date went, never-sent last", () => {
    const rows = [
      household("Aaa", { sentAt: null }),
      household("Bbb", { sentAt: BASE }),
      household("Ccc", { sentAt: BASE + 4 * DAY }),
    ];
    expect(sortInvitationRows(rows, { key: "sent", dir: "desc" }).map((r) => r.name))
      .toEqual(["Ccc", "Bbb", "Aaa"]);
  });

  it("leaves the input alone and loses nobody", () => {
    const rows = [
      household("Bbb", { repliedAt: BASE }),
      household("Aaa", { repliedAt: null }),
      household("Ccc", { repliedAt: BASE + DAY }),
    ];
    const before = rows.map((r) => r.name);
    for (const key of ["name", "sent", "replied"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        expect(sortInvitationRows(rows, { key, dir })).toHaveLength(3);
      }
    }
    expect(rows.map((r) => r.name)).toEqual(before);
  });
});
