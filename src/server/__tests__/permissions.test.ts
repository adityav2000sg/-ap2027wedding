import { describe, expect, it } from "vitest";

import { PERMISSIONS, resolvePermissions } from "../permissions";

describe("authenticated member access", () => {
  it("gives every signed-in member every application capability", () => {
    expect([...resolvePermissions()].sort()).toEqual([...PERMISSIONS].sort());
  });

  it("returns a new set so one request cannot affect another", () => {
    const first = resolvePermissions();
    first.delete("budget.edit");

    expect(resolvePermissions().has("budget.edit")).toBe(true);
  });
});
