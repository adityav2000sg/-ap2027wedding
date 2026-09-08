import { describe, expect, it } from "vitest";

import { FAMILY_ACCOUNTS, firstNamePassword } from "./family-accounts";

describe("family account manifest", () => {
  it("contains nine unique, normalized account identities", () => {
    expect(FAMILY_ACCOUNTS).toHaveLength(9);
    expect(new Set(FAMILY_ACCOUNTS.map((account) => account.name)).size).toBe(9);
    expect(new Set(FAMILY_ACCOUNTS.map((account) => account.email)).size).toBe(9);
    expect(FAMILY_ACCOUNTS.every((account) => account.email === account.email.toLowerCase())).toBe(true);
  });

  it("builds the requested first-name password format", () => {
    expect(FAMILY_ACCOUNTS.map((account) => firstNamePassword(account.name))).toEqual([
      "Avantika2027",
      "Prateek2027",
      "Namrita2027",
      "Dheeraj2027",
      "Preeti2027",
      "Ajay2027",
      "Anousha2027",
      "Trisha2027",
      "Aditya2027",
    ]);
  });
});
