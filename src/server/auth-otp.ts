import "server-only";

/**
 * Sign-in by emailed code.
 *
 * The threat model for a nine-person family app is modest, but a code that
 * grants access to everyone's contact details and the family finances still
 * deserves care:
 *
 *   - the code is hashed, never stored in the clear
 *   - it expires in 10 minutes and is single-use
 *   - 5 wrong guesses burn it (a 6-digit code is only 10^6 wide)
 *   - requests are rate-limited per address
 *   - comparison is constant-time
 *   - the response never reveals whether an address is on the list
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { db } from "./db";
import { loginCodeEmail, sendEmail } from "./email";

const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
/** Codes requested per address within the window before we start refusing. */
const MAX_REQUESTS_PER_WINDOW = 5;
const REQUEST_WINDOW_MINUTES = 15;

function hashCode(email: string, code: string): string {
  // Salted with the address so a rainbow table over 10^6 codes is useless, and
  // a hash captured for one person can't be replayed for another.
  const secret = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
}

function generateCode(): string {
  // randomInt is CSPRNG-backed; Math.random is not.
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export interface RequestOutcome {
  /** Always true unless something genuinely broke — see the note below. */
  ok: boolean;
  error?: string;
  /** Dev only, with no email configured: lets you sign in from the console. */
  devCode?: string;
}

/**
 * Send a sign-in code.
 *
 * Deliberately returns the same shape whether or not the address belongs to a
 * member — otherwise this endpoint becomes a way to enumerate who is on the
 * guest list.
 */
export async function requestLoginCode(
  rawEmail: string,
  ip?: string | null,
): Promise<RequestOutcome> {
  const email = normaliseEmail(rawEmail);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  // Rate limit before touching the user table, so the timing doesn't leak
  // whether the address exists.
  const since = new Date(Date.now() - REQUEST_WINDOW_MINUTES * 60_000);
  const recent = await db.loginCode.count({
    where: { email, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_WINDOW) {
    return {
      ok: false,
      error: `Too many codes requested. Wait ${REQUEST_WINDOW_MINUTES} minutes and try again.`,
    };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });

  // No account: stop here, but report success. Nothing is sent.
  if (!user) return { ok: true };

  const code = generateCode();
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);

  await db.$transaction(async (tx) => {
    // Any older code for this address is void the moment a new one is issued.
    await tx.loginCode.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.loginCode.create({
      data: {
        email,
        codeHash: hashCode(email, code),
        expiresAt,
        requestedIp: ip ?? null,
      },
    });
  });

  const message = loginCodeEmail(code, user.name.split(" ")[0], EXPIRY_MINUTES);
  try {
    await sendEmail({ to: email, ...message });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't send the code. Try again.",
    };
  }

  // With no email provider wired up, surface the code so development isn't
  // blocked. Never in production.
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    console.info(`\n[auth] Sign-in code for ${email}: ${code}\n`);
    return { ok: true, devCode: code };
  }

  return { ok: true };
}

export interface VerifyOutcome {
  ok: boolean;
  userId?: string;
  error?: string;
}

/** Check a submitted code and, if it's right, say whose account it unlocks. */
export async function verifyLoginCode(
  rawEmail: string,
  rawCode: string,
): Promise<VerifyOutcome> {
  const email = normaliseEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");

  if (code.length !== CODE_LENGTH) {
    return { ok: false, error: `Enter the ${CODE_LENGTH}-digit code from your email.` };
  }

  const record = await db.loginCode.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const generic = { ok: false, error: "That code isn't right, or it's expired." };
  if (!record) return generic;

  if (record.expiresAt < new Date()) {
    await db.loginCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, error: "That code has expired. Ask for a new one." };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await db.loginCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, error: "Too many wrong attempts. Ask for a new code." };
  }

  const expected = Buffer.from(record.codeHash, "hex");
  const actual = Buffer.from(hashCode(email, code), "hex");
  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await db.loginCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - (record.attempts + 1);
    return {
      ok: false,
      error:
        left > 0
          ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
          : "Too many wrong attempts. Ask for a new code.",
    };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return generic;

  // Single use.
  await db.loginCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true, userId: user.id };
}

/** Housekeeping: drop codes that are long dead. Safe to call any time. */
export async function pruneExpiredCodes(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const result = await db.loginCode.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
