"use client";

/**
 * Sign in with an email address and a password.
 *
 * The emailed-code flow is still in the codebase, tested and working — it's
 * switched off here because Resend can only send from a verified domain and
 * there isn't one for this wedding yet. Turning it back on is a matter of
 * restoring the two-step form; nothing was deleted. See `src/server/auth-otp.ts`.
 */

import * as React from "react";
import { useActionState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/primitives";
import { FormField, Input } from "@/components/ui/form";
import { signInWithPassword, type PasswordState } from "./actions";

export function LoginForm() {
  const reduce = useReducedMotion();
  const [state, action, pending] = useActionState<PasswordState | undefined, FormData>(
    signInWithPassword,
    undefined,
  );

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 lg:hidden">
        <h1 className="font-script text-[52px] text-ink">
          Avantika <span className="text-saffron">&</span> Prateek
        </h1>
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="font-display text-[24px] text-ink">Sign in</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          Use the email address and password you were given.
        </p>

        <form action={action} className="mt-6 space-y-4">
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              required
              placeholder="you@example.com"
            />
          </FormField>

          <FormField label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </FormField>

          {state?.error ? (
            <motion.p
              role="alert"
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={
                reduce ? { opacity: 1 } : { opacity: 1, x: [-6, 5, -3, 2, 0] }
              }
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical"
            >
              {state.error}
            </motion.p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending}
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-7 text-[12px] leading-relaxed text-ink-faint">
          Only the nine people on this wedding have accounts. There's no sign-up —
          if your email isn't recognised, ask Avantika or Prateek.
        </p>
      </motion.div>
    </div>
  );
}
