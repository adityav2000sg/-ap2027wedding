import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  hasPersonalInvitation,
  PERSONAL_INVITATION_COUPLES,
} from "./personal-invitations";

interface ImportedGuest {
  tier: string;
  firstName: string;
  lastName: string;
  household: string | null;
}

const imported = JSON.parse(
  readFileSync(path.join(process.cwd(), "prisma/data/wedding-import.json"), "utf8"),
) as { guests: ImportedGuest[] };

describe("personal invitation exceptions", () => {
  it("keeps the final save-the-date audience at the verified 231 Tier A guests", () => {
    expect(imported.guests.filter((guest) => guest.tier === "A")).toHaveLength(231);
  });

  it("contains the eight highlighted couples and no extra people", () => {
    expect(PERSONAL_INVITATION_COUPLES).toHaveLength(8);
    expect(PERSONAL_INVITATION_COUPLES.flat()).toHaveLength(16);
  });

  it("matches one Tier A guest for every highlighted name", () => {
    for (const name of PERSONAL_INVITATION_COUPLES.flat()) {
      const matches = imported.guests.filter(
        (guest) =>
          `${guest.firstName} ${guest.lastName}`.trim().replace(/\s+/g, " ") === name,
      );
      expect(matches, name).toHaveLength(1);
      expect(matches[0]?.tier, name).toBe("A");
    }
  });

  it("keeps both partners in the same planning group", () => {
    for (const couple of PERSONAL_INVITATION_COUPLES) {
      const groups = couple.map((name) => {
        const guest = imported.guests.find(
          (candidate) =>
            `${candidate.firstName} ${candidate.lastName}`.trim().replace(/\s+/g, " ") === name,
        );
        return guest?.household;
      });
      expect(groups[0], couple.join(" & ")).toBe(groups[1]);
    }
  });

  it("does not turn ordinary family members into personal-link recipients", () => {
    expect(hasPersonalInvitation("Anil", "Ahuja")).toBe(false);
    expect(hasPersonalInvitation("Dheeraj", "Chowdhry")).toBe(false);
  });
});
