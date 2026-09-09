import { describe, expect, it } from "vitest";

import {
  computeEventGuestCounts,
  computeGuestCounts,
  roomsRequired,
  saveTheDateCounts,
  attendanceForecast,
} from "../guests";
import { analyseTasks, wouldCreateCycle } from "../tasks";
import {
  makeGuest,
  makeInvitation,
  makeSnapshot,
  makeTask,
  snapshotWithGuests,
  TODAY,
} from "./fixtures";

const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000);

describe("per-event RSVP", () => {
  it("tracks a guest's answer separately for each event", () => {
    const snapshot = makeSnapshot({
      events: [
        { ...makeSnapshot().events[0], id: "e-shaadi", slug: "shaadi", name: "Shaadi" },
        { ...makeSnapshot().events[0], id: "e-reception", slug: "reception", name: "Reception" },
      ],
      guests: [makeGuest("rahul")],
      invitations: [
        makeInvitation("rahul", "e-shaadi", "CONFIRMED"),
        makeInvitation("rahul", "e-reception", "DECLINED"),
      ],
    });

    expect(computeEventGuestCounts(snapshot, "e-shaadi").confirmed).toBe(1);
    expect(computeEventGuestCounts(snapshot, "e-reception").confirmed).toBe(0);
    expect(computeEventGuestCounts(snapshot, "e-reception").declined).toBe(1);
  });

  it("counts a guest as confirmed if they said yes to anything", () => {
    const snapshot = makeSnapshot({
      events: [
        { ...makeSnapshot().events[0], id: "e1" },
        { ...makeSnapshot().events[0], id: "e2" },
      ],
      guests: [makeGuest("a")],
      invitations: [
        makeInvitation("a", "e1", "DECLINED"),
        makeInvitation("a", "e2", "CONFIRMED"),
      ],
    });
    expect(computeGuestCounts(snapshot).confirmed).toBe(1);
    expect(computeGuestCounts(snapshot).declined).toBe(0);
  });

  it("counts a guest as declined only when they turn down everything", () => {
    const snapshot = makeSnapshot({
      events: [
        { ...makeSnapshot().events[0], id: "e1" },
        { ...makeSnapshot().events[0], id: "e2" },
      ],
      guests: [makeGuest("a")],
      invitations: [
        makeInvitation("a", "e1", "DECLINED"),
        makeInvitation("a", "e2", "DECLINED"),
      ],
    });
    expect(computeGuestCounts(snapshot).declined).toBe(1);
  });

  it("does not count NOT_INVITED as an invitation", () => {
    const snapshot = makeSnapshot({
      guests: [makeGuest("a")],
      invitations: [makeInvitation("a", "event-shaadi", "NOT_INVITED")],
    });
    const counts = computeGuestCounts(snapshot);
    expect(counts.invited).toBe(0);
    expect(counts.notContacted).toBe(1);
  });

  it("groups guests into households", () => {
    const snapshot = snapshotWithGuests(4);
    // Put everyone in one household.
    snapshot.guests.forEach((g) => { g.householdId = "shared"; });
    expect(computeEventGuestCounts(snapshot, "event-shaadi").households).toBe(1);
  });
});

describe("accommodation", () => {
  it("rounds rooms up from the number of guests needing a bed", () => {
    const snapshot = snapshotWithGuests(10);
    snapshot.guests.slice(0, 5).forEach((g) => { g.needsAccommodation = true; });
    expect(roomsRequired(snapshot)).toBe(3); // 5 guests, 2 per room
  });

  it("respects a configured guests-per-room", () => {
    const snapshot = snapshotWithGuests(10);
    snapshot.guests.forEach((g) => { g.needsAccommodation = true; });
    snapshot.wedding.guestsPerRoom = 3;
    expect(roomsRequired(snapshot)).toBe(4); // ceil(10 / 3)
  });
});

describe("task dependencies", () => {
  it("marks a task blocked when a prerequisite is unfinished", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("a"), makeTask("b")],
      dependencies: [{ taskId: "b", dependsOnId: "a" }],
    });
    const [a, b] = analyseTasks(snapshot);
    expect(b.isBlocked).toBe(true);
    expect(b.blockedBy[0].title).toBe("Task a");
    expect(a.blocking).toHaveLength(1);
  });

  it("unblocks once the prerequisite is done", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("a", { status: "DONE" }), makeTask("b")],
      dependencies: [{ taskId: "b", dependsOnId: "a" }],
    });
    const b = analyseTasks(snapshot).find((t) => t.id === "b")!;
    expect(b.isBlocked).toBe(false);
  });

  it("counts the full downstream chain, not just direct dependents", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("a"), makeTask("b"), makeTask("c"), makeTask("d")],
      dependencies: [
        { taskId: "b", dependsOnId: "a" },
        { taskId: "c", dependsOnId: "b" },
        { taskId: "d", dependsOnId: "c" },
      ],
    });
    const a = analyseTasks(snapshot).find((t) => t.id === "a")!;
    expect(a.downstreamCount).toBe(3);
  });

  it("survives a cyclic dependency graph without hanging", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("a"), makeTask("b")],
      dependencies: [
        { taskId: "b", dependsOnId: "a" },
        { taskId: "a", dependsOnId: "b" },
      ],
    });
    expect(() => analyseTasks(snapshot)).not.toThrow();
  });

  it("refuses a dependency that would create a cycle", () => {
    const edges = [
      { taskId: "b", dependsOnId: "a" },
      { taskId: "c", dependsOnId: "b" },
    ];
    expect(wouldCreateCycle(edges, "a", "c")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
    expect(wouldCreateCycle(edges, "d", "a")).toBe(false);
  });
});

describe("overdue calculation", () => {
  it("marks a past-due open task overdue with the right lateness", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("a", { dueDate: day(-3) })],
    });
    const [task] = analyseTasks(snapshot);
    expect(task.isOverdue).toBe(true);
    expect(task.daysLate).toBe(3);
  });

  it("never marks a completed task overdue", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("a", { dueDate: day(-30), status: "DONE" })],
    });
    expect(analyseTasks(snapshot)[0].isOverdue).toBe(false);
  });

  it("never marks a cancelled task overdue", () => {
    const snapshot = makeSnapshot({
      tasks: [makeTask("a", { dueDate: day(-30), status: "CANCELLED" })],
    });
    expect(analyseTasks(snapshot)[0].isOverdue).toBe(false);
  });

  it("a task due today is not yet late", () => {
    const snapshot = makeSnapshot({ tasks: [makeTask("a", { dueDate: day(0) })] });
    expect(analyseTasks(snapshot)[0].isOverdue).toBe(false);
  });
});

describe("prioritisation", () => {
  it("ranks an overdue critical blocker above a distant low-priority task", () => {
    const snapshot = makeSnapshot({
      tasks: [
        makeTask("urgent", { dueDate: day(-5), priority: "CRITICAL", importance: 5 }),
        makeTask("later", { dueDate: day(90), priority: "LOW", importance: 1 }),
      ],
    });
    const [urgent, later] = analyseTasks(snapshot);
    expect(urgent.leverage).toBeGreaterThan(later.leverage);
  });

  it("pushes blocked tasks down because they cannot be actioned", () => {
    const base = makeSnapshot({
      tasks: [makeTask("a"), makeTask("b", { dueDate: day(1), importance: 5 })],
    });
    const unblocked = analyseTasks(base).find((t) => t.id === "b")!;

    const blockedSnapshot = makeSnapshot({
      tasks: [makeTask("a"), makeTask("b", { dueDate: day(1), importance: 5 })],
      dependencies: [{ taskId: "b", dependsOnId: "a" }],
    });
    const blocked = analyseTasks(blockedSnapshot).find((t) => t.id === "b")!;

    expect(blocked.leverage).toBeLessThan(unblocked.leverage);
  });
});

describe("attendance forecast", () => {
  it("weights by how likely each guest is, rather than counting invitations", () => {
    const snapshot = makeSnapshot({
      guests: [
        makeGuest("g1", { tier: "A", attendanceScore: 5 }), // certain
        makeGuest("g2", { tier: "A", attendanceScore: 3 }), // 0.75
        makeGuest("g3", { tier: "A", attendanceScore: 2 }), // 0.25
      ],
    });

    const forecast = attendanceForecast(snapshot);
    expect(forecast.invited).toBe(3);
    expect(forecast.expected).toBe(2); // 1 + 0.75 + 0.25
  });

  it("leaves tier C out — they were considered and not invited", () => {
    const snapshot = makeSnapshot({
      guests: [
        makeGuest("g1", { tier: "A", attendanceScore: 5 }),
        makeGuest("g2", { tier: "C", attendanceScore: 5 }),
      ],
    });

    const forecast = attendanceForecast(snapshot);
    expect(forecast.invited).toBe(1);
    expect(forecast.expected).toBe(1);
  });

  it("counts tier A separately, for deciding whether to send tier B at all", () => {
    const snapshot = makeSnapshot({
      guests: [
        makeGuest("g1", { tier: "A", attendanceScore: 5 }),
        makeGuest("g2", { tier: "B", attendanceScore: 5 }),
      ],
    });

    const forecast = attendanceForecast(snapshot);
    expect(forecast.tierA).toBe(1);
    expect(forecast.expectedTierA).toBe(1);
    expect(forecast.expected).toBe(2);
  });

  it("lets a real answer override the estimate", () => {
    const base = makeSnapshot({
      guests: [
        makeGuest("g1", { tier: "A", attendanceScore: 2 }), // 0.25 estimated
        makeGuest("g2", { tier: "A", attendanceScore: 5 }), // certain
      ],
    });
    const snapshot = {
      ...base,
      invitations: [
        // The unlikely one has said yes; the certain one has declined.
        { id: "i1", guestId: "g1", eventId: "e1", status: "CONFIRMED" as const, respondedAt: null },
        { id: "i2", guestId: "g2", eventId: "e1", status: "DECLINED" as const, respondedAt: null },
      ],
    };

    const forecast = attendanceForecast(snapshot);
    expect(forecast.expected).toBe(1);
    expect(forecast.confirmed).toBe(1);
    expect(forecast.stillEstimated).toBe(0);
  });

  it("treats an unscored guest as certain, erring high rather than low", () => {
    const snapshot = makeSnapshot({
      guests: [makeGuest("g1", { tier: "A", attendanceScore: null })],
    });
    expect(attendanceForecast(snapshot).expected).toBe(1);
  });
});

/**
 * A save-the-date answer is the only reply that exists a year out. It lives on
 * the guest, apart from the per-event invitations, and it has to be countable
 * on its own — otherwise a page that asks "who has replied?" answers with the
 * invitations, which cannot move until the invitation goes out.
 */
describe("save-the-date replies", () => {
  it("counts the answers of the wave that was asked", () => {
    const snapshot = makeSnapshot({
      guests: [
        makeGuest("yes-1", { stdResponse: "YES" }),
        makeGuest("yes-2", { stdResponse: "YES" }),
        makeGuest("no-1", { stdResponse: "NO" }),
        makeGuest("quiet-1"),
        // Tier B hasn't been asked, so tier B can't have answered.
        makeGuest("held", { tier: "B", stdResponse: "YES" }),
      ],
    });

    expect(saveTheDateCounts(snapshot)).toEqual({
      asked: 4,
      // Nothing has been sent in the fixture; the count is of real sends.
      sent: 0,
      yes: 2,
      no: 1,
      awaiting: 1,
    });
  });

  it("leaves the per-event answers alone", () => {
    const snapshot = makeSnapshot({
      guests: [makeGuest("g1", { stdResponse: "YES" })],
      invitations: [makeInvitation("g1", "event-shaadi", "PENDING")],
    });

    // Hoping to come is not a seat at a table.
    expect(saveTheDateCounts(snapshot).yes).toBe(1);
    expect(computeGuestCounts(snapshot).confirmed).toBe(0);
    expect(computeGuestCounts(snapshot).pending).toBe(1);
  });
});
