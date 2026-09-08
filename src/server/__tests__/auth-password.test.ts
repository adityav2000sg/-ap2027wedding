import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticate } from "../auth";
import { hashPassword } from "../auth-hash";
import { db } from "../db";

const EMAIL = `password-test-${Date.now()}@example.test`;
const PASSWORD = "lantern-saffron-meadow-27";
let userId = "";

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      name: "Password Test User",
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
    },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: userId } });
});

describe("password sign-in", () => {
  it("finds a normalized email and verifies the stored password hash", async () => {
    await expect(authenticate(`  ${EMAIL.toUpperCase()}  `, PASSWORD)).resolves.toEqual({
      ok: true,
      userId,
    });
  });

  it("uses the same failure for a wrong password and an unknown account", async () => {
    const failure = { ok: false, error: "That email and password don't match." };

    await expect(authenticate(EMAIL, "wrong-password")).resolves.toEqual(failure);
    await expect(authenticate("missing@example.test", PASSWORD)).resolves.toEqual(failure);
  });
});
