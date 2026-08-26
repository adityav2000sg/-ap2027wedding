import { describe, expect, it } from "vitest";

import {
  computeEventGuestCounts,
  computeGuestCounts,
  roomsRequired,
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
