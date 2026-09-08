import { describe, expect, it } from "vitest";

import { FAMILY_ACCOUNTS } from "./family-accounts";

describe("family account manifest", () => {
  it("contains nine unique, normalized account identities", () => {
    expect(FAMILY_ACCOUNTS).toHaveLength(9);
    expect(new Set(FAMILY_ACCOUNTS.map((account) => account.name)).size).toBe(9);
    expect(new Set(FAMILY_ACCOUNTS.map((account) => account.email)).size).toBe(9);
    expect(FAMILY_ACCOUNTS.every((account) => account.email === account.email.toLowerCase())).toBe(true);
  });
});
