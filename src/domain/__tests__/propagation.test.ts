import { describe, expect, it } from "vitest";

import { analyseChange, impactFingerprint } from "../impact";
import {
  makeBudgetItem,
  makeSnapshot,
  makeVendor,
  snapshotWithGuests,
} from "./fixtures";

/**
 * The propagation guarantees. These are the properties the whole
 * preview → confirm → apply architecture rests on, so they're pinned here
 * rather than left to manual testing.
 */

describe("impact fingerprint", () => {
  it("is stable when nothing material changes", () => {
    const snapshot = snapshotWithGuests(50);
    const before = impactFingerprint(snapshot);

    // A cosmetic edit must not invalidate somebody's pending preview.
    const cosmetic = {
      ...snapshot,
      guests: snapshot.guests.map((g) => ({ ...g, notes: "changed a note" })),
    };
    expect(impactFingerprint(cosmetic)).toBe(before);
  });

  it("changes when the guest estimate moves", () => {
    const snapshot = snapshotWithGuests(50);
    const before = impactFingerprint(snapshot);
    const after = {
      ...snapshot,
      wedding: { ...snapshot.wedding, estimatedGuests: 999 },
    };
    expect(impactFingerprint(after)).not.toBe(before);
  });

  it("changes when somebody else edits room inventory", () => {
    const snapshot = snapshotWithGuests(50);
    const before = impactFingerprint(snapshot);
    const after = {
      ...snapshot,
      hotels: [
        {
          id: "h1", name: "Hotel", city: null, address: null,
          contactName: null, phone: null, contractedRooms: 40,
          ratePerNight: null, currency: "GBP", rooms: [],
        },
      ],
    };
    expect(impactFingerprint(after)).not.toBe(before);
  });

  it("changes when a vendor is requoted", () => {
    const snapshot = makeSnapshot({ vendors: [makeVendor("v1", { quoteAmount: 100 })] });
    const before = impactFingerprint(snapshot);
    const after = {
      ...snapshot,
      vendors: [makeVendor("v1", { quoteAmount: 200 })],
    };
    expect(impactFingerprint(after)).not.toBe(before);
  });

  it("changes when a run-of-show entry moves", () => {
    const base = makeSnapshot();
    const entry = {
      id: "t1", eventId: "event-shaadi", title: "Makeup",
      date: new Date(Date.UTC(2027, 5, 18)), startMinute: 600, endMinute: 700,
      location: null, ownerId: null, vendorId: null, participants: [],
      notes: null, status: "PLANNED" as const, isLocked: false, sortOrder: 0,
    };
    const before = impactFingerprint({ ...base, timeline: [entry] });
    const after = impactFingerprint({
      ...base,
      timeline: [{ ...entry, startMinute: 645, endMinute: 745 }],
    });
    expect(after).not.toBe(before);
  });
});

describe("impact classification", () => {
  it("separates the direct change from its consequences", () => {
    const snapshot = makeSnapshot({
      vendors: [makeVendor("photo", { category: "PHOTOGRAPHY", eventIds: ["event-shaadi"] })],
      timeline: [
        {
          id: "t1", eventId: "event-shaadi", title: "Makeup",
          date: new Date(Date.UTC(2027, 5, 18)), startMinute: 1020, endMinute: 1100,
          location: null, ownerId: null, vendorId: null, participants: [],
          notes: null, status: "PLANNED", isLocked: false, sortOrder: 0,
        },
      ],
    });

    const report = analyseChange(snapshot, {
      type: "event.time",
      eventId: "event-shaadi",
      startMinute: 1065,
      endMinute: 1545,
    });

    const direct = report.impacts.filter((i) => i.kind === "direct");
    const suggestions = report.impacts.filter((i) => i.kind === "suggestion");

    // Exactly one thing was changed; the vendor call time is a follow-up.
    expect(direct).toHaveLength(1);
    expect(direct[0].message).toContain("moves 45 minutes later");
    expect(suggestions.some((i) => i.message.includes("call time"))).toBe(true);
  });

  it("marks going over budget as a risk, not a recalculation", () => {
    const snapshot = makeSnapshot({
      wedding: { ...makeSnapshot().wedding, totalBudget: 650_000 },
      vendors: [makeVendor("v1", { quoteAmount: 600_000 })],
      budgetItems: [makeBudgetItem({ vendorId: "v1", quoteAmount: 600_000 })],
    });

    const report = analyseChange(snapshot, {
      type: "vendor.quote", vendorId: "v1", amount: 750_000,
    });

    const risks = report.impacts.filter((i) => i.kind === "risk");
    expect(risks.some((i) => i.message.includes("over budget"))).toBe(true);
  });

  it("gives every impact a kind", () => {
    const snapshot = snapshotWithGuests(200, "CONFIRMED", {
      budgetItems: [
        makeBudgetItem({
          costModel: "PER_GUEST", guestBasis: "CONFIRMED", unitRate: 240,
        }),
      ],
    });
    const report = analyseChange(snapshot, {
      type: "wedding.guests", estimatedGuests: 300,
    });
    for (const impact of report.impacts) {
      expect(["direct", "automatic", "risk", "suggestion"]).toContain(impact.kind);
    }
  });
});

describe("trivial vs material changes", () => {
  it("a change with no downstream effect reports nothing to confirm", () => {
    const snapshot = makeSnapshot();
    const report = analyseChange(snapshot, {
      type: "wedding.guests", estimatedGuests: snapshot.wedding.estimatedGuests,
    });
    expect(report.impacts.filter((i) => i.kind !== "direct")).toHaveLength(0);
    expect(report.material).toBe(false);
  });

  it("a change that moves real money is material", () => {
    const snapshot = makeSnapshot({
      vendors: [makeVendor("v1", { quoteAmount: 100_000 })],
      budgetItems: [makeBudgetItem({ vendorId: "v1", quoteAmount: 100_000 })],
    });
    const report = analyseChange(snapshot, {
      type: "vendor.quote", vendorId: "v1", amount: 180_000,
    });
    expect(report.material).toBe(true);
  });
});
