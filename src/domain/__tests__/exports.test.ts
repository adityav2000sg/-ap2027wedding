import { describe, expect, it } from "vitest";

import { guestTable, householdTable, roomTable } from "@/server/exports";
import { makeGuest, makeSnapshot } from "./fixtures";

/** A snapshot with people in it — the default fixture has an empty guest list. */
function populated() {
  const base = makeSnapshot();
  const household = { ...base.households[0], id: "h1", name: "Anand", tier: "B" as const };
  return makeSnapshot({
    households: [household],
    guests: [
      makeGuest("g1", {
        householdId: "h1",
        firstName: "Rohan",
        lastName: "Anand",
        phone: "+44 7700 900000",
        dietary: "JAIN",
        needsAccommodation: true,
      }),
      makeGuest("g2", { householdId: "h1", firstName: "Priya", lastName: "Anand" }),
    ],
  });
}

describe("exports", () => {
  it("gives every column a value on every row, so no cell silently shifts", () => {
    const snapshot = populated();
    for (const table of [guestTable(snapshot), householdTable(snapshot), roomTable(snapshot)]) {
      for (const row of table.rows) {
        for (const column of table.columns) {
          expect(row).toHaveProperty(column.key);
        }
      }
    }
  });

  it("names each guest's household rather than exporting a bare list of people", () => {
    const rows = guestTable(populated()).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.household === "Anand")).toBe(true);
  });

  it("carries the tier through, since that decides who gets written to first", () => {
    const rows = householdTable(populated()).rows;
    expect(rows[0].tier).toBe("B");
    expect(rows[0].people).toBe(2);
  });

  it("translates codes into words a caterer can read", () => {
    const rohan = guestTable(populated()).rows.find((r) => r.name === "Rohan Anand")!;
    expect(rohan.dietary).toBe("Jain");
    expect(rohan.room).toBe("Yes");
    // Not "NOT_INVITED".
    expect(rohan.coming).toBe("Not invited");
  });

  it("sorts by household so families stay together on the page", () => {
    const snapshot = makeSnapshot({
      households: [
        { ...makeSnapshot().households[0], id: "h1", name: "Zutshi" },
        { ...makeSnapshot().households[0], id: "h2", name: "Abrol", rsvpToken: "t2" },
      ],
      guests: [
        makeGuest("g1", { householdId: "h1", firstName: "Zara", lastName: "Zutshi" }),
        makeGuest("g2", { householdId: "h2", firstName: "Amit", lastName: "Abrol" }),
      ],
    });
    expect(guestTable(snapshot).rows.map((r) => r.household)).toEqual(["Abrol", "Zutshi"]);
  });
});
