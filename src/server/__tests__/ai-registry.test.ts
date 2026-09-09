import { describe, expect, it } from "vitest";

import { PERMISSIONS, type Permission } from "@/server/permissions";
import { EXECUTORS } from "@/server/ai/execute";
import {
  CAPABILITIES,
  capabilityCatalogue,
  findCapability,
  permittedActions,
} from "@/server/ai/registry";

/**
 * The catalogue is what the assistant is told it can do, and the executor map
 * is what actually happens when somebody approves. A capability in one and not
 * the other is a suggestion that fails on the button press — the one failure
 * mode worth a test, because it only shows up after a person has said yes.
 */
describe("the AI capability registry", () => {
  it("names every capability exactly once", () => {
    const names = CAPABILITIES.map((c) => c.action);
    expect(new Set(names).size).toBe(names.length);
  });

  it("can carry out everything it offers", () => {
    for (const capability of CAPABILITIES) {
      const runnable = Boolean(capability.planned) || Boolean(EXECUTORS[capability.action]);
      expect(runnable, `${capability.action} has no way to run`).toBe(true);
    }
  });

  it("offers everything it can carry out", () => {
    for (const action of Object.keys(EXECUTORS)) {
      expect(findCapability(action), `${action} executes but isn't offered`).not.toBeNull();
    }
  });

  it("asks for permissions the app actually has", () => {
    for (const capability of CAPABILITIES) {
      expect(PERMISSIONS).toContain(capability.permission);
    }
  });

  it("covers every area of the wedding", () => {
    const areas = new Set(CAPABILITIES.map((c) => c.area));
    for (const area of [
      "guests", "invitations", "events", "tasks", "vendors",
      "budget", "timeline", "logistics", "wardrobe", "wedding",
    ]) {
      expect(areas, `nothing can be changed in ${area}`).toContain(area);
    }
  });
});

describe("proposal arguments", () => {
  it("accepts a well-formed change", () => {
    const task = findCapability("task.create")!;
    expect(
      task.schema.safeParse({ title: "Chase the Bali quote", dueDate: "2026-10-01" }).success,
    ).toBe(true);

    const rsvp = findCapability("guest.rsvp")!;
    expect(
      rsvp.schema.safeParse({ guestId: "g1", eventId: "e1", status: "CONFIRMED" }).success,
    ).toBe(true);
  });

  it("refuses a change that names nothing", () => {
    const update = findCapability("task.update")!;
    expect(update.schema.safeParse({ title: "No id here" }).success).toBe(false);
  });

  it("refuses a date that isn't one", () => {
    const move = findCapability("event.date")!;
    expect(move.schema.safeParse({ eventId: "e1", date: "16th June" }).success).toBe(false);
    expect(move.schema.safeParse({ eventId: "e1", date: "2027-06-16" }).success).toBe(true);
  });

  it("takes a relative shift or absolute times, but not a bare event", () => {
    const time = findCapability("event.time")!;
    expect(time.schema.safeParse({ eventId: "e1", shiftMinutes: 45 }).success).toBe(true);
    expect(
      time.schema.safeParse({ eventId: "e1", startMinute: 1140, endMinute: 1320 }).success,
    ).toBe(true);
    expect(time.schema.safeParse({ eventId: "e1" }).success).toBe(false);
  });

  it("translates a modelled change into one the impact engine understands", () => {
    const move = findCapability("event.date")!;
    const change = move.planned!({ eventId: "e1", date: "2027-06-17" });
    expect(change).toMatchObject({ type: "event.date", eventId: "e1" });
  });
});

describe("what one person is offered", () => {
  const only = (...granted: Permission[]) =>
    (permission: Permission) => granted.includes(permission);

  it("hides everything they couldn't do by hand", () => {
    const actions = permittedActions(only("tasks.edit"));
    expect(actions).toContain("task.create");
    expect(actions).not.toContain("payment.create");
    expect(actions).not.toContain("guest.archive");
  });

  it("describes only what it offers", () => {
    const catalogue = capabilityCatalogue(only("guests.edit"));
    expect(catalogue).toContain("guest.rsvp");
    expect(catalogue).not.toContain("vendor.quote");
  });

  it("gives the couple the run of the place", () => {
    const actions = permittedActions(() => true);
    expect(actions.length).toBe(CAPABILITIES.length);
  });
});
