import { describe, expect, it } from "vitest";

import {
  groupGuestRows,
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
