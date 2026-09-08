/**
 * The sign-in code flow, against the real database.
 *
 * These run against the development Postgres rather than a mock, because the
 * behaviour under test is mostly database behaviour: single use, expiry,
 * attempt counting, rate limiting. A mocked Prisma would only prove the mock.
 *
 * Every test creates and removes its own user, so the suite leaves no trace.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { requestLoginCode, verifyLoginCode } from "@/server/auth-otp";

const EMAIL = `otp-test-${Date.now()}@example.test`;
const STRANGER = `nobody-${Date.now()}@example.test`;

let userId: string;

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "test-secret-at-least-16-chars";
  const user = await db.user.create({
    data: {
      name: "OTP Test User",
      email: EMAIL,
      passwordHash: "not-used-by-these-tests",
    },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.loginCode.deleteMany({ where: { email: { in: [EMAIL, STRANGER] } } });
  await db.user.deleteMany({ where: { id: userId } });
});

afterEach(async () => {
  await db.loginCode.deleteMany({ where: { email: { in: [EMAIL, STRANGER] } } });
});

/** The code is only ever returned in the dev fallback, which is what we're in. */
async function issueCode(email = EMAIL): Promise<string> {
  const result = await requestLoginCode(email);
  expect(result.ok).toBe(true);
  expect(result.devCode).toMatch(/^\d{6}$/);
  return result.devCode!;
}

describe("sign-in codes", () => {
  it("accepts a valid code and returns the account it unlocks", async () => {
    const code = await issueCode();
    const result = await verifyLoginCode(EMAIL, code);

    expect(result.ok).toBe(true);
    expect(result.userId).toBe(userId);
  });

  it("refuses a wrong code and counts the attempt", async () => {
    const code = await issueCode();
    const wrong = code === "000000" ? "111111" : "000000";

    const result = await verifyLoginCode(EMAIL, wrong);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/isn't right/);

    const record = await db.loginCode.findFirst({ where: { email: EMAIL } });
    expect(record?.attempts).toBe(1);
    // A wrong guess must not burn the code — people mistype.
    expect(record?.consumedAt).toBeNull();
  });

  it("refuses an expired code and says so plainly", async () => {
    const code = await issueCode();
    await db.loginCode.updateMany({
      where: { email: EMAIL },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await verifyLoginCode(EMAIL, code);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("refuses a code that has already been used", async () => {
    const code = await issueCode();
    expect((await verifyLoginCode(EMAIL, code)).ok).toBe(true);

    const second = await verifyLoginCode(EMAIL, code);
    expect(second.ok).toBe(false);
    expect(second.userId).toBeUndefined();
  });

  it("burns the code after five wrong guesses", async () => {
    const code = await issueCode();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i += 1) await verifyLoginCode(EMAIL, wrong);

    // Even the right code is dead once the budget is spent.
    const result = await verifyLoginCode(EMAIL, code);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too many/i);
  });

  it("voids the previous code when a new one is requested", async () => {
    const first = await issueCode();
    const second = await issueCode();
    expect(second).not.toBe(first);

    expect((await verifyLoginCode(EMAIL, first)).ok).toBe(false);
    expect((await verifyLoginCode(EMAIL, second)).ok).toBe(true);
  });

  it("rate limits repeated requests for the same address", async () => {
    for (let i = 0; i < 5; i += 1) await requestLoginCode(EMAIL);

    const sixth = await requestLoginCode(EMAIL);
    expect(sixth.ok).toBe(false);
    expect(sixth.error).toMatch(/too many codes/i);
  });

  it("says nothing about whether an unknown address has an account", async () => {
    const result = await requestLoginCode(STRANGER);

    // Reported as success so the form can't be used to enumerate the family…
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    // …but nothing was issued, and no account was created.
    expect(result.devCode).toBeUndefined();
    expect(await db.loginCode.count({ where: { email: STRANGER } })).toBe(0);
    expect(await db.user.count({ where: { email: STRANGER } })).toBe(0);
  });

  it("rejects a malformed address before touching anything", async () => {
    const result = await requestLoginCode("not-an-email");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/email address/i);
  });

  it("normalises case and surrounding whitespace", async () => {
    const code = await issueCode(`  ${EMAIL.toUpperCase()}  `);
    expect((await verifyLoginCode(EMAIL, code)).ok).toBe(true);
  });

  it("ignores spaces and dashes people paste in with the code", async () => {
    const code = await issueCode();
    const spaced = `${code.slice(0, 3)}-${code.slice(3)}`;
    expect((await verifyLoginCode(EMAIL, spaced)).ok).toBe(true);
  });

  it("rejects a code of the wrong length without consuming anything", async () => {
    await issueCode();
    const result = await verifyLoginCode(EMAIL, "123");

    expect(result.ok).toBe(false);
    const record = await db.loginCode.findFirst({ where: { email: EMAIL } });
    expect(record?.attempts).toBe(0);
    expect(record?.consumedAt).toBeNull();
  });

  it("never stores the code in the clear", async () => {
    const code = await issueCode();
    const record = await db.loginCode.findFirst({ where: { email: EMAIL } });

    expect(record?.codeHash).not.toContain(code);
    expect(record?.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
