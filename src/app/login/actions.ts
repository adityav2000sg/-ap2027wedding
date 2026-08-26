"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticate, createSession, destroySession } from "@/server/auth";
import { db } from "@/server/db";

const credentials = z.object({
  email: z.string().email("That doesn't look like an email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginState = { error?: string } | undefined;

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentials.safeParse({
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

/**
 * Demo convenience: sign in as one of the seeded family members without typing
 * a password. Only exposed when the app is running in development.
 */
export async function signInAsDemoUser(email: string): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo sign-in is disabled in production.");
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) throw new Error("That demo account doesn't exist.");

  await createSession(user.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}
