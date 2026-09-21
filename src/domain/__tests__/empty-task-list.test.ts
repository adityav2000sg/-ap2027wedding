import { describe, expect, it } from "vitest";

import { buildBudgetView } from "@/domain/budget";
import { computeEventGuestCounts } from "@/domain/guests";
import { computeEventReadiness, computeWeddingReadiness } from "@/domain/readiness";
import { analyseTasks } from "@/domain/tasks";

import { makeEvent, makeGuest, makeSnapshot, makeVendor } from "./fixtures";

/**
 * The state the family is deliberately putting this wedding into.
 *
 * The 478 seeded tasks are being cleared so they can write their own list, and
 * between clearing them and writing the first one the app runs on no tasks at
 * all. Readiness is a weighted average with a task component in it, so that is
 * exactly the shape that divides by nothing — and it renders on the dashboard
 * and on every event page, where a NaN would be the first thing anybody saw.
 */
describe("a wedding with no tasks at all", () => {
  const snapshot = makeSnapshot({
    events: [makeEvent({ id: "event-1" }), makeEvent({ id: "event-2" })],
    guests: [makeGuest("guest-1"), makeGuest("guest-2")],
    vendors: [makeVendor("vendor-1")],
    tasks: [],
  });

  it("reports a readiness percentage rather than NaN", () => {
    const tasks = analyseTasks(snapshot);
    const budget = buildBudgetView(snapshot, snapshot.wedding.baseCurrency);
    const readiness = computeWeddingReadiness(snapshot, tasks, budget);

    expect(Number.isFinite(readiness.percent)).toBe(true);
    expect(readiness.percent).toBeGreaterThanOrEqual(0);
    expect(readiness.percent).toBeLessThanOrEqual(100);
  });

  it("scores every component and every statistic finitely", () => {
    const tasks = analyseTasks(snapshot);
    const budget = buildBudgetView(snapshot, snapshot.wedding.baseCurrency);
    const readiness = computeWeddingReadiness(snapshot, tasks, budget);

    for (const component of readiness.components) {
      expect(Number.isFinite(component.score)).toBe(true);
    }
    for (const [key, value] of Object.entries(readiness.stats)) {
      expect(Number.isFinite(value), `stats.${key}`).toBe(true);
    }
  });

  it("says plainly that there is no plan yet, rather than claiming readiness", () => {
    const tasks = analyseTasks(snapshot);
    const budget = buildBudgetView(snapshot, snapshot.wedding.baseCurrency);
    const readiness = computeWeddingReadiness(snapshot, tasks, budget);

    // Scored zero, not scored out of nothing. Which blockers make the ranked
    // list is a separate judgement and not this test's business.
    const taskComponent = readiness.components.find((c) => c.key === "tasks");
    expect(taskComponent?.score).toBe(0);
    expect(taskComponent?.summary).toMatch(/no planning tasks/i);
    expect(readiness.stats.tasksTotal).toBe(0);
    expect(readiness.stats.tasksOpen).toBe(0);
  });

  it("holds up on every event page too", () => {
    const tasks = analyseTasks(snapshot);
    const budget = buildBudgetView(snapshot, snapshot.wedding.baseCurrency);

    for (const event of snapshot.events) {
      const readiness = computeEventReadiness(
        snapshot,
        event,
        tasks,
        budget,
        computeEventGuestCounts(snapshot, event.id),
      );
      expect(Number.isFinite(readiness.percent), event.id).toBe(true);
      for (const component of readiness.components) {
        expect(Number.isFinite(component.score), `${event.id}/${component.key}`).toBe(true);
      }
    }
  });
});
