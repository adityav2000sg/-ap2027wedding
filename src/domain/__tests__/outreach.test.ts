import { describe, expect, it } from "vitest";

import { outreachByTier, outreachGaps, outreachRows, outreachStats } from "../outreach";
import { makeSnapshot } from "./fixtures";
import type { WeddingSnapshot } from "../types";

/** Two households, three people, so headcount and household counts can't be confused. */
function snapshotWith(
  households: Partial<WeddingSnapshot["households"][number]>[],
): WeddingSnapshot {
  const base = makeSnapshot();
  const template = base.households[0];

  const built = households.map((overrides, index) => ({
    ...template,
    id: `h${index}`,
    name: `Household ${index}`,
    rsvpToken: `token${index}`,
    saveTheDateSentAt: null,
    rsvpSentAt: null,
    rsvpReply: "AWAITING" as const,
    rsvpRepliedAt: null,
    tier: "A" as const,
    ...overrides,
  }));

  return {
    ...base,
    households: built,
    guests: [
      { ...base.guests[0], id: "g0", householdId: "h0", firstName: "Ana", lastName: "One" },
      { ...base.guests[0], id: "g1", householdId: "h0", firstName: "Bo", lastName: "One" },
      { ...base.guests[0], id: "g2", householdId: "h1", firstName: "Cal", lastName: "Two" },
    ],
  };
}

describe("outreach", () => {
  it("tracks the two sends independently", () => {
    const snapshot = snapshotWith([
      { saveTheDateSentAt: new Date("2026-01-01"), rsvpSentAt: null },
      { saveTheDateSentAt: null, rsvpSentAt: new Date("2026-05-01") },
    ]);

    const stats = outreachStats(snapshot);
    expect(stats.stdSent).toBe(1);
    expect(stats.stdNotSent).toBe(1);
    expect(stats.rsvpSent).toBe(1);
    expect(stats.rsvpNotSent).toBe(1);
  });

  it("counts people as well as households, so a large family's no carries its weight", () => {
    const snapshot = snapshotWith([
      { rsvpSentAt: new Date("2026-05-01"), rsvpReply: "NO" },
      { rsvpSentAt: new Date("2026-05-01"), rsvpReply: "YES" },
    ]);

    const stats = outreachStats(snapshot);
    expect(stats.no).toBe(1);
    expect(stats.yes).toBe(1);
    // h0 has two people, h1 has one.
    expect(stats.peopleNo).toBe(2);
    expect(stats.peopleYes).toBe(1);
  });

  it("treats awaiting as its own state rather than folding it into no", () => {
    const snapshot = snapshotWith([
      { rsvpSentAt: new Date("2026-05-01") },
      { rsvpSentAt: new Date("2026-05-01"), rsvpReply: "NO" },
    ]);

    const stats = outreachStats(snapshot);
    expect(stats.awaiting).toBe(1);
    expect(stats.no).toBe(1);
    expect(stats.peopleAwaiting).toBe(2);
  });

  it("measures response rate against invitations sent, not the whole list", () => {
    const snapshot = snapshotWith([
      { rsvpSentAt: new Date("2026-05-01"), rsvpReply: "YES" },
      // Never invited, so it can't count against the response rate.
      {},
    ]);

    const stats = outreachStats(snapshot);
    expect(stats.rsvpSent).toBe(1);
    expect(stats.responseRate).toBe(100);
  });

  it("reports no response rate rather than dividing by zero", () => {
    expect(outreachStats(snapshotWith([{}, {}])).responseRate).toBe(0);
  });

  it("surfaces the chase list and the households nobody has contacted", () => {
    const snapshot = snapshotWith([
      { rsvpSentAt: new Date("2026-05-01") },
      {},
    ]);

    const gaps = outreachGaps(snapshot);
    expect(gaps.awaitingReply.map((r) => r.householdId)).toEqual(["h0"]);
    expect(gaps.neverContacted.map((r) => r.householdId)).toEqual(["h1"]);
  });

  it("flags a reply that arrived without an invitation ever being sent", () => {
    const snapshot = snapshotWith([{ rsvpReply: "YES" }, {}]);
    expect(outreachGaps(snapshot).repliedWithoutInvite.map((r) => r.householdId)).toEqual(["h0"]);
  });

  it("sorts rows by name so the list is stable between renders", () => {
    const snapshot = snapshotWith([{ name: "Zutshi" }, { name: "Abrol" }]);
    expect(outreachRows(snapshot).map((r) => r.name)).toEqual(["Abrol", "Zutshi"]);
  });
  it("keeps the first wave's numbers separate from the rest", () => {
    const snapshot = snapshotWith([
      { tier: "A", saveTheDateSentAt: new Date("2026-01-01") },
      { tier: "B" },
    ]);

    const tiers = outreachByTier(snapshot);
    const a = tiers.find((t) => t.tier === "A")!;
    const b = tiers.find((t) => t.tier === "B")!;

    expect(a.households).toBe(1);
    expect(a.people).toBe(2);
    expect(a.stdSent).toBe(1);
    // Tier B hasn't been written to, which is the entire point of tiering.
    expect(b.stdSent).toBe(0);
  });

  it("reports empty tiers as absent rather than as zeroes", () => {
    const tiers = outreachByTier(snapshotWith([{ tier: "A" }, { tier: "A" }]));
    expect(tiers.map((t) => t.tier)).toEqual(["A"]);
  });

  it("lists the people in a household so invitations can go to individuals", () => {
    const rows = outreachRows(snapshotWith([{}, {}]));
    const first = rows.find((r) => r.householdId === "h0")!;

    expect(first.people.map((p) => p.name)).toEqual(["Ana One", "Bo One"]);
    expect(first.headcount).toBe(2);
  });

  it("counts who has personally been messaged, not just the household", () => {
    const snapshot = snapshotWith([{ saveTheDateSentAt: new Date("2026-01-01") }, {}]);
    // The household is marked sent, but only one of its two people is.
    snapshot.guests[0].saveTheDateSentAt = new Date("2026-01-01");

    const first = outreachRows(snapshot).find((r) => r.householdId === "h0")!;
    expect(first.saveTheDateSent).toBe(true);
    expect(first.peopleSaveTheDateSent).toBe(1);
    expect(first.headcount).toBe(2);
  });

  it("orders by tier first, so the wave being worked on comes first", () => {
    const rows = outreachRows(
      snapshotWith([{ name: "Aaa", tier: "B" }, { name: "Zzz", tier: "A" }]),
    );
    expect(rows.map((r) => r.name)).toEqual(["Zzz", "Aaa"]);
  });
});
