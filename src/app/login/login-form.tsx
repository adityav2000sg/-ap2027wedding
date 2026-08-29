"use client";

import * as React from "react";
import { useActionState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/primitives";
import { FormField, Input } from "@/components/ui/form";
import { MailIcon } from "@/components/ui/icons";
import {
  sendCode,
  submitCode,
  signInWithPassword,
  type RequestState,
  type VerifyState,
  type PasswordState,
} from "./actions";

export function LoginForm() {
  const reduce = useReducedMotion();
  const [request, requestAction, sending] = useActionState<RequestState | undefined, FormData>(
    sendCode,
    undefined,
  );
  const [verify, verifyAction, verifying] = useActionState<VerifyState | undefined, FormData>(
    submitCode,
    undefined,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState<
    PasswordState | undefined,
    FormData
  >(signInWithPassword, undefined);

  const sent = request?.sent === true;
  const codeRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (sent) codeRef.current?.focus();
  }, [sent]);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 lg:hidden">
        <h1 className="font-display text-[32px] leading-tight text-ink">
          Avantika <span className="text-saffron">&</span> Prateek
        </h1>
      </div>

      {!sent ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display text-[24px] text-ink">Sign in</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
            Enter your email and we'll send you a six-digit code.
          </p>

          <form action={requestAction} className="mt-6 space-y-4">
            <FormField label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                required
                defaultValue={request?.email ?? ""}
                placeholder="you@example.com"
              />
            </FormField>

            {request?.error ? (
              <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
                {request.error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={sending}>
              {sending ? "Sending…" : "Email me a code"}
            </Button>
          </form>

          <details className="mt-5 text-[12px] text-ink-muted">
            <summary className="cursor-pointer select-none hover:text-ink">Having trouble receiving a code?</summary>
            <form action={passwordAction} className="mt-4 space-y-3 rounded-xl border border-line p-4">
              <p className="leading-relaxed text-ink-muted">
                Temporary family fallback. Use the same account email and the existing wedding password.
              </p>
              <FormField label="Email" htmlFor="fallback-email">
                <Input id="fallback-email" name="email" type="email" autoComplete="email" required />
              </FormField>
              <FormField label="Password" htmlFor="fallback-password">
                <Input id="fallback-password" name="password" type="password" autoComplete="current-password" required />
              </FormField>
              {passwordState?.error ? (
                <p role="alert" className="text-[12px] text-critical">{passwordState.error}</p>
              ) : null}
              <Button type="submit" variant="secondary" className="w-full" disabled={passwordPending}>
                {passwordPending ? "Signing in…" : "Sign in with password"}
              </Button>
            </form>
          </details>
        </motion.div>
      ) : (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-saffron-soft text-saffron">
            <MailIcon size={17} />
          </span>

          <h2 className="font-display text-[24px] text-ink">Check your email</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
            If <span className="text-ink">{request?.email}</span> has access, a six-digit code is on its way. It expires in ten minutes.
          </p>

          {request?.devCode ? (
            <p className="mt-3 rounded-lg border border-attention/25 bg-attention-soft px-3 py-2 text-[12.5px] text-attention">
              Development code: <span className="tabular font-semibold">{request.devCode}</span>
            </p>
          ) : null}

          <form action={verifyAction} className="mt-6 space-y-4">
            <input type="hidden" name="email" value={request?.email ?? ""} />
            <FormField label="Six-digit code" htmlFor="code">
              <Input
                ref={codeRef}
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                placeholder="000000"
                className="tabular text-center text-[22px] tracking-[0.3em]"
              />
            </FormField>

            {verify?.error ? (
              <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
                {verify.error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={verifying}>
              {verifying ? "Checking…" : "Sign in"}
            </Button>
          </form>

          <form action={requestAction} className="mt-4 text-center">
            <input type="hidden" name="email" value={request?.email ?? ""} />
            <button
              type="submit"
              disabled={sending}
              className="text-[12.5px] text-ink-muted underline-offset-2 transition-colors hover:text-saffron hover:underline disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send another code"}
            </button>
          </form>
        </motion.div>
      )}
    </div>
  );
}
