import { describe, expect, it } from "vitest";

import { analyseChange, applyChange } from "../impact";
import { computeWeddingReadiness } from "../readiness";
import { detectConflicts, proposeShift } from "../timeline";
import { analyseTasks } from "../tasks";
import { buildBudgetView } from "../budget";
import {
  makeBudgetItem,
  makeSnapshot,
  makeTask,
  makeTimelineEntry,
  makeVendor,
  snapshotWithGuests,
} from "./fixtures";

describe("timeline conflict detection", () => {
  it("flags a dependency whose required gap is violated", () => {
    const entries = [
      makeTimelineEntry("makeup", 780, 945),
      makeTimelineEntry("photo", 900, 1000),
    ];
    const conflicts = detectConflicts(entries, [
      { entryId: "photo", dependsOnId: "makeup", gapMinutes: 0 },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("dependency");
  });

  it("accepts a schedule that satisfies its gaps", () => {
    const entries = [
      makeTimelineEntry("makeup", 780, 945),
      makeTimelineEntry("photo", 945, 1000),
    ];
    const conflicts = detectConflicts(entries, [
      { entryId: "photo", dependsOnId: "makeup", gapMinutes: 0 },
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it("catches a vendor booked in two places at once", () => {
    const entries = [
      makeTimelineEntry("a", 600, 800, { vendorId: "v1" }),
      makeTimelineEntry("b", 700, 900, { vendorId: "v1" }),
    ];
    const conflicts = detectConflicts(entries, [], {
      vendors: [makeVendor("v1")],
    });
    expect(conflicts.some((c) => c.kind === "vendor")).toBe(true);
  });

  it("does not treat a containing block as a room clash", () => {
    // Photography covers the whole day; the ceremony happens inside it.
    const entries = [
      makeTimelineEntry("photo", 600, 1200, { location: "Lawn" }),
      makeTimelineEntry("ceremony", 700, 800, { location: "Lawn" }),
    ];
    const conflicts = detectConflicts(entries, []);
    expect(conflicts.filter((c) => c.kind === "overlap")).toHaveLength(0);
  });

  it("flags an entry running past the venue curfew", () => {
    const snapshot = makeSnapshot();
    const entries = [makeTimelineEntry("late", 1400, 1500)];
    const conflicts = detectConflicts(entries, [], {
      venues: snapshot.venues,
      eventVenue: new Map([["event-shaadi", "venue-1"]]),
    });
    expect(conflicts.some((c) => c.kind === "curfew")).toBe(true);
  });
});

describe("schedule shifting", () => {
  const entries = [
    makeTimelineEntry("makeup", 780, 945),
    makeTimelineEntry("photo", 945, 1020),
    makeTimelineEntry("baraat", 1050, 1100),
  ];
  const edges = [
    { entryId: "photo", dependsOnId: "makeup", gapMinutes: 0 },
    { entryId: "baraat", dependsOnId: "photo", gapMinutes: 30 },
  ];

  it("propagates a delay along the dependency chain", () => {
    const proposal = proposeShift(entries, edges, "makeup", 45);
    expect(proposal.moves).toHaveLength(3);

    const photo = proposal.moves.find((m) => m.entryId === "photo")!;
    expect(photo.toStart).toBe(990);
    expect(photo.reason).toContain("after");
  });

  it("does not move entries that still fit", () => {
    // Baraat starts 30 min after photo ends but only needs a 10-minute gap,
    // so it has 20 minutes of genuine slack and a 10-minute slip stops at photo.
    const slackEdges = [
      { entryId: "photo", dependsOnId: "makeup", gapMinutes: 0 },
      { entryId: "baraat", dependsOnId: "photo", gapMinutes: 10 },
    ];
    const proposal = proposeShift(entries, slackEdges, "makeup", 10);
    expect(proposal.moves.map((m) => m.entryId)).toContain("photo");
    expect(proposal.moves.map((m) => m.entryId)).not.toContain("baraat");
  });

  it("propagates once the slack is used up", () => {
    const slackEdges = [
      { entryId: "photo", dependsOnId: "makeup", gapMinutes: 0 },
      { entryId: "baraat", dependsOnId: "photo", gapMinutes: 10 },
    ];
    const proposal = proposeShift(entries, slackEdges, "makeup", 45);
    expect(proposal.moves.map((m) => m.entryId)).toContain("baraat");
  });

  it("stops at a locked entry and reports it rather than moving it", () => {
    const locked = entries.map((e) =>
      e.id === "baraat" ? { ...e, isLocked: true } : e,
    );
    const proposal = proposeShift(locked, edges, "makeup", 120);
    expect(proposal.blockedByLock).toHaveLength(1);
    expect(proposal.blockedByLock[0].entryId).toBe("baraat");
    expect(proposal.moves.map((m) => m.entryId)).not.toContain("baraat");
  });

  it("returns nothing for a zero-minute move", () => {
    expect(proposeShift(entries, edges, "makeup", 0).moves).toHaveLength(0);
  });
});

describe("change impact engine", () => {
  it("never mutates the snapshot it is given", () => {
    const snapshot = snapshotWithGuests(100);
    const before = snapshot.wedding.estimatedGuests;
    applyChange(snapshot, { type: "wedding.guests", estimatedGuests: 999 });
    expect(snapshot.wedding.estimatedGuests).toBe(before);
  });

  it("reports the financial consequence of a quote change", () => {
    const snapshot = makeSnapshot({
      vendors: [makeVendor("v1", { quoteAmount: 600_000 })],
      budgetItems: [makeBudgetItem({ vendorId: "v1", quoteAmount: 600_000 })],
    });

    const report = analyseChange(snapshot, {
      type: "vendor.quote", vendorId: "v1", amount: 750_000,
    });

    expect(report.finance!.delta).toBe(150_000);
    expect(report.material).toBe(true);
    expect(report.impacts.some((i) => i.type === "budget")).toBe(true);
  });

  it("flags crossing the budget ceiling as critical", () => {
    const snapshot = makeSnapshot({
      wedding: { ...makeSnapshot().wedding, totalBudget: 650_000 },
      vendors: [makeVendor("v1", { quoteAmount: 600_000 })],
      budgetItems: [makeBudgetItem({ vendorId: "v1", quoteAmount: 600_000 })],
    });

    const report = analyseChange(snapshot, {
      type: "vendor.quote", vendorId: "v1", amount: 750_000,
    });
    expect(report.impacts.some((i) => i.severity === "critical")).toBe(true);
  });

  it("identifies every vendor affected by an event time change", () => {
    const snapshot = makeSnapshot({
      vendors: [
        makeVendor("photo", { category: "PHOTOGRAPHY", eventIds: ["event-shaadi"] }),
        makeVendor("makeup", { category: "MAKEUP", eventIds: ["event-shaadi"] }),
        makeVendor("other", { category: "GIFTS", eventIds: [] }),
      ],
      timeline: [makeTimelineEntry("a", 1020, 1100)],
    });

    const report = analyseChange(snapshot, {
      type: "event.time", eventId: "event-shaadi", startMinute: 1065, endMinute: 1545,
    });

    const vendorMessages = report.impacts.filter((i) => i.type === "vendor");
    expect(vendorMessages).toHaveLength(2);
    expect(report.material).toBe(true);
  });

  it("warns when a venue change would exceed capacity", () => {
    const snapshot = snapshotWithGuests(500, "CONFIRMED", {
      venues: [
        {
          id: "small", name: "Small Hall", city: null, address: null, capacity: 100,
          contactName: null, contactPhone: null, curfewMinute: null,
          alcoholAllowed: true, outsideCatering: true, hasRainBackup: true,
          hasPowerBackup: true, hasBridalRoom: false, parkingSpaces: null, notes: null,
        },
      ],
    });

    const report = analyseChange(snapshot, {
      type: "event.venue", eventId: "event-shaadi", venueId: "small",
    });
    expect(report.impacts.some((i) => i.severity === "critical")).toBe(true);
  });

  it("treats a small change as immaterial", () => {
    const snapshot = makeSnapshot({
      vendors: [makeVendor("v1", { quoteAmount: 100_000 })],
      budgetItems: [makeBudgetItem({ vendorId: "v1", quoteAmount: 100_000 })],
    });
    const report = analyseChange(snapshot, {
      type: "vendor.quote", vendorId: "v1", amount: 101_000,
    });
    expect(report.material).toBe(false);
  });
});

describe("readiness", () => {
  it("is not a naive completion ratio — importance is weighted", () => {
    // One critical task open, four trivial ones done.
    const snapshot = makeSnapshot({
      tasks: [
        makeTask("critical", { importance: 5, status: "NOT_STARTED" }),
        ...["a", "b", "c", "d"].map((id) => makeTask(id, { importance: 1, status: "DONE" })),
      ],
    });

    const result = computeWeddingReadiness(
      snapshot, analyseTasks(snapshot), buildBudgetView(snapshot),
    );
    const taskComponent = result.components.find((c) => c.key === "tasks")!;
    // 4 of 5 tasks are done, but the weighted score is far below 80%.
    expect(taskComponent.score).toBeLessThan(0.3);
  });

  it("explains exactly what is costing readiness points", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("venue", { importance: 5, title: "Confirm venue" })],
    });
    const result = computeWeddingReadiness(
      snapshot, analyseTasks(snapshot), buildBudgetView(snapshot),
    );

    expect(result.blockers.length).toBeGreaterThan(0);
    for (const blocker of result.blockers) {
      expect(blocker.pointsCost).toBeGreaterThan(0);
      expect(blocker.detail).toBeTruthy();
    }
  });

  it("penalises an overdue task below an on-time one at the same status", () => {
    const onTime = makeSnapshot({
      tasks: [makeTask("a", { status: "IN_PROGRESS", dueDate: new Date(Date.UTC(2027, 5, 1)) })],
    });
    const late = makeSnapshot({
      tasks: [makeTask("a", { status: "IN_PROGRESS", dueDate: new Date(Date.UTC(2026, 5, 1)) })],
    });

    const scoreOf = (s: typeof onTime) =>
      computeWeddingReadiness(s, analyseTasks(s), buildBudgetView(s))
        .components.find((c) => c.key === "tasks")!.score;

    expect(scoreOf(late)).toBeLessThan(scoreOf(onTime));
  });

  it("never exceeds 100%", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("a", { status: "DONE" })],
      vendors: [makeVendor("v", { status: "CONTRACTED" })],
    });
    const result = computeWeddingReadiness(
      snapshot, analyseTasks(snapshot), buildBudgetView(snapshot),
    );
    expect(result.percent).toBeLessThanOrEqual(100);
    expect(result.percent).toBeGreaterThanOrEqual(0);
  });
});
