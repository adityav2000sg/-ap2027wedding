"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { z } from "zod";

import { authenticate, createSession, destroySession } from "@/server/auth";
import { requestLoginCode, verifyLoginCode } from "@/server/auth-otp";

export interface RequestState {
  sent?: boolean;
  email?: string;
  error?: string;
  /** Development only, when no email provider is configured. */
  devCode?: string;
}

/** Step one: email me a code. */
export async function sendCode(
  _previous: RequestState | undefined,
  formData: FormData,
): Promise<RequestState> {
  const email = String(formData.get("email") ?? "");

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip");

  const result = await requestLoginCode(email, ip);
  if (!result.ok) return { error: result.error, email };

  // Always reports sent, even for an address with no account — otherwise this
  // form becomes a way to find out who is on the wedding list.
  return { sent: true, email, devCode: result.devCode };
}

export interface VerifyState {
  error?: string;
}

/** Step two: here's the code. */
export async function submitCode(
  _previous: VerifyState | undefined,
  formData: FormData,
): Promise<VerifyState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");

  const result = await verifyLoginCode(email, code);
  if (!result.ok || !result.userId) {
    return { error: result.error ?? "That code isn't right." };
  }

  await createSession(result.userId);
  redirect("/");
}

export interface PasswordState {
  error?: string;
}

/**
 * Password sign-in, kept as a fallback.
 *
 * Deliberately not linked prominently: it exists so nobody is locked out while
 * the emailed-code flow is being proven across all nine accounts. Remove it —
 * and the passwordHash column — once everyone has signed in with a code.
 */
export async function signInWithPassword(
  _previous: PasswordState | undefined,
  formData: FormData,
): Promise<PasswordState> {
  const parsed = z
    .object({
      email: z.string().email("That doesn't look like an email address."),
      password: z.string().min(1, "Enter your password."),
    })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result.ok) return { error: result.error };

  await createSession(result.userId);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}
