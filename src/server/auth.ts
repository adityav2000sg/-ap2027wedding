/**
 * Authentication.
 *
 * A signed JWT in an httpOnly cookie. No third-party auth service: this app has
 * a fixed, small membership (a family and their planner), and the security that
 * actually matters here is that every mutation resolves the viewer server-side
 * and checks permissions — which it does.
 *
 * Passwords are hashed with scrypt from node:crypto, so there's no native
 * dependency to build.
 */

import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";

import { db } from "./db";
import { hashPassword, verifyPassword } from "./auth-hash";
import { resolvePermissions, type Viewer } from "./permissions";

export { hashPassword, verifyPassword };

const COOKIE_NAME = "wos_session";
const SESSION_DAYS = 30;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET must be set to at least 16 characters.");
  }
  return new TextEncoder().encode(value);
}

// ──────────────────────────────────────────────────────────────────── Session

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

async function readUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * The current viewer, or null. Cached per request so the dozen places that ask
 * "who is this and what can they do?" cost one query, not a dozen.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userId = await readUserId();
  if (!userId) return null;

  const membership = await db.weddingMember.findFirst({
    where: { userId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;

  return {
    userId: membership.userId,
    memberId: membership.id,
    weddingId: membership.weddingId,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    relation: membership.relation,
    avatarTone: membership.user.avatarTone,
    displayCurrency: membership.user.displayCurrency,
    permissions: resolvePermissions(membership.role, membership.overrides),
  };
});

/** Use in server actions and pages that must have a signed-in member. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("You need to be signed in to do that.");
  return viewer;
}

export async function authenticate(
  email: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  // Same message either way — don't reveal which accounts exist.
  const failure = { ok: false, error: "That email and password don't match." } as const;
  if (!user) return failure;
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? { ok: true, userId: user.id } : failure;
}
