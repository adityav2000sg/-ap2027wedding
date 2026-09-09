import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  hasPersonalInvitation,
  PERSONAL_INVITATION_COUPLES,
} from "./personal-invitations";

const groupings = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "prisma/data/save-the-date-groupings.json"),
    "utf8",
  ),
) as string[][];

describe("personal invitation exceptions", () => {
  it("keeps the workbook source at 123 groups and 233 Tier A guests", () => {
    expect(groupings).toHaveLength(123);
    expect(groupings.flat()).toHaveLength(233);
  });

  it("contains the eight highlighted couples and no extra people", () => {
    expect(PERSONAL_INVITATION_COUPLES).toHaveLength(8);
    expect(PERSONAL_INVITATION_COUPLES.flat()).toHaveLength(16);
  });

  it("matches one workbook guest for every highlighted name", () => {
    for (const name of PERSONAL_INVITATION_COUPLES.flat()) {
      const matches = groupings.flat().filter((guest) => guest === name);
      expect(matches, name).toHaveLength(1);
    }
  });

  it("keeps separate personal links even when a couple shares a workbook row", () => {
    expect(groupings).toContainEqual(["John Nicolaou", "Marilena Nicolaou"]);
    expect(hasPersonalInvitation("John", "Nicolaou")).toBe(true);
    expect(hasPersonalInvitation("Marilena", "Nicolaou")).toBe(true);
  });

  it("includes the four children added by the workbook", () => {
    expect(groupings.flat()).toEqual(
      expect.arrayContaining([
        "Inaaya Takiar",
        "Amara Takiar",
        "Shaan Batura",
        "Maya Batura",
      ]),
    );
  });

  it("does not turn ordinary family members into personal-link recipients", () => {
    expect(hasPersonalInvitation("Anil", "Ahuja")).toBe(false);
    expect(hasPersonalInvitation("Dheeraj", "Chowdhry")).toBe(false);
  });
});
