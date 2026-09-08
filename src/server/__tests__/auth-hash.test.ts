import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../auth-hash";

describe("password authentication", () => {
  it("accepts the password used to create an account hash", async () => {
    const hash = await hashPassword("lantern-saffron-meadow-27");

    await expect(verifyPassword("lantern-saffron-meadow-27", hash)).resolves.toBe(true);
  });

  it("rejects a different password and malformed stored hashes", async () => {
    const hash = await hashPassword("lantern-saffron-meadow-27");

    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
    await expect(verifyPassword("anything", "not-a-password-hash")).resolves.toBe(false);
  });
});
