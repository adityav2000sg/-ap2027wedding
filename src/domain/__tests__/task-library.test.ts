import { describe, expect, it } from "vitest";

import { resolveTemplates, TASK_LIBRARY } from "../task-library";
import type { EventKind } from "../types";

const events: { id: string; name: string; kind: EventKind }[] = [
  { id: "haldi", name: "Haldi", kind: "HALDI" },
  { id: "mehendi", name: "Mehendi", kind: "MEHENDI" },
  { id: "sangeet", name: "Sangeet", kind: "SANGEET" },
  { id: "shaadi", name: "Shaadi", kind: "SHAADI" },
  { id: "reception", name: "Reception", kind: "RECEPTION" },
];

describe("destination wedding task plan", () => {
  it("creates one hotel procurement task rather than one per function", () => {
    const resolved = resolveTemplates(events, []);
    const venueKeys = [
      "venue-research",
      "venue-availability",
      "venue-walkthrough",
      "venue-capacity",
      "venue-pricing",
      "venue-book",
      "venue-restrictions",
      "venue-curfew",
    ];

    for (const key of venueKeys) {
      const matches = resolved.filter((task) => task.template.key === key);
      expect(matches).toHaveLength(1);
      expect(matches[0].eventId).toBeNull();
      expect(matches[0].instanceKey).toBe(key);
    }
  });

  it("dates current supplier shortlists at the end of the 9–12 month window", () => {
    const byKey = new Map(TASK_LIBRARY.map((task) => [task.key, task]));

    expect(byKey.get("photo-shortlist")?.offsetDays).toBe(-270);
    expect(byKey.get("catering-shortlist")?.offsetDays).toBe(-270);
    expect(byKey.get("photo-portfolios")?.offsetDays).toBe(-265);
  });

  it("does not create transport work that cannot exist at a single hotel", () => {
    const byKey = new Map(TASK_LIBRARY.map((task) => [task.key, task]));

    expect(byKey.has("haldi-transport")).toBe(false);
    expect(byKey.has("transport-station")).toBe(false);
    expect(byKey.has("transport-shuttles")).toBe(false);
    expect(byKey.get("transport-capacity")?.dependsOn).toEqual(["transport-airport"]);
  });
});

