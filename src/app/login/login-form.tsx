"use client";

import { useActionState, useTransition } from "react";

import { Avatar, Button, Separator } from "@/components/ui/primitives";
import { FormField, Input } from "@/components/ui/form";
import { ROLE_LABEL } from "@/server/permissions";
import type { MemberRole } from "@prisma/client";
import { signIn, signInAsDemoUser, type LoginState } from "./actions";

interface DemoUser {
  email: string;
  name: string;
  relation: string;
  role: MemberRole;
  tone: string;
}

export function LoginForm({ demoUsers }: { demoUsers: DemoUser[] }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    signIn,
    undefined,
  );
  const [switching, startSwitching] = useTransition();

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 lg:hidden">
        <h1 className="font-display text-[32px] leading-tight text-ink">
          Avantika <span className="text-saffron">&</span> Prateek
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">Wedding Operating System</p>
      </div>

      <h2 className="font-display text-[22px] text-ink">Sign in</h2>
      <p className="mt-1 text-[13px] text-ink-muted">
        Welcome back. Pick up where the family left off.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.in"
            required
          />
        </FormField>

        <FormField label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </FormField>

        {state?.error ? (
          <p
            role="alert"
            className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical"
          >
            {state.error}
          </p>
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

      {demoUsers.length > 0 ? (
        <div className="mt-8">
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
              Or continue as
            </span>
            <Separator className="flex-1" />
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
            Everyone has their own account. You all see the whole wedding — the
            difference is what each person can change, and who the work is
            assigned to.
          </p>

          <div className="mt-3 grid gap-1.5">
            {demoUsers.map((user) => (
              <button
                key={user.email}
                type="button"
                disabled={switching}
                onClick={() =>
                  startSwitching(async () => {
                    await signInAsDemoUser(user.email);
                  })
                }
                className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-sunken disabled:opacity-50"
              >
                <Avatar name={user.name} tone={user.tone} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">
                    {user.name}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-muted">
                    {user.relation}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-faint">
                  {ROLE_LABEL[user.role]}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-3 text-center text-[11.5px] text-ink-faint">
            Starter password for everyone is{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 text-ink-muted">
              wedding2027
            </code>
            {" "}— change it once you're in.
          </p>
        </div>
      ) : null}
    </div>
  );
}
