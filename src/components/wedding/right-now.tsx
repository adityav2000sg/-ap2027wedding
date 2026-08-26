"use client";

/**
 * "Right now" — the prioritised problem list, as an editorial list rather than
 * a wall of tiles. Label, statement, severity, arrow, hairline. Nothing else.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { CloseIcon } from "@/components/ui/icons";
import type { Alert } from "@/domain/risk";
import type { Severity } from "@/domain/types";
import { dismissAlert } from "@/server/actions/alerts";

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "High",
  important: "High",
  attention: "Medium",
  info: "Low",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-critical/25 bg-critical-soft text-critical",
  important: "border-important/25 bg-important-soft text-important",
  attention: "border-attention/25 bg-attention-soft text-attention",
  info: "border-line text-ink-muted",
};

/** Short label for the left column — the *area* the problem belongs to. */
const GROUP_LABEL: Record<Alert["group"], string> = {
  money: "Budget",
  vendors: "Vendors",
  guests: "Guests",
  tasks: "Tasks",
  logistics: "Logistics",
  timeline: "Schedule",
  documents: "Documents",
};

export function RightNow({ alerts, limit = 6 }: { alerts: Alert[]; limit?: number }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [dismissing, setDismissing] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  const visible = expanded ? alerts : alerts.slice(0, limit);
  const hidden = Math.max(0, alerts.length - limit);

  async function dismiss(key: string) {
    setDismissing(key);
    try {
      await dismissAlert(key);
      router.refresh();
    } finally {
      setDismissing(null);
    }
  }

  if (alerts.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="font-display text-[18px] text-ink">Nothing needs you right now</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
          No overdue payments, no unsigned contracts, no capacity problems. This
          list refills itself the moment something slips — you don't have to go
          looking.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ul>
        <AnimatePresence initial={false}>
          {visible.map((alert, index) => (
            <motion.li
              key={alert.key}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: dismissing === alert.key ? 0.35 : 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12, height: 0 }}
              transition={{
                duration: 0.34,
                ease: [0.22, 1, 0.36, 1],
                delay: reduce ? 0 : Math.min(index * 0.045, 0.25),
              }}
              className="group border-b border-line last:border-b-0"
            >
              <div className="flex items-start gap-4 py-3.5">
                {/* Area */}
                <div className="w-[84px] shrink-0 pt-0.5">
                  <span className="text-[11.5px] font-medium text-ink-muted">
                    {GROUP_LABEL[alert.group]}
                  </span>
                </div>

                {/* The problem */}
                <Link href={alert.href} className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug text-ink transition-colors group-hover:text-saffron">
                    {alert.title}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
                    {alert.detail}
                  </p>
                </Link>

                {/* Severity */}
                <span
                  className={cn(
                    "mt-0.5 hidden shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium sm:inline-block",
                    SEVERITY_STYLE[alert.severity],
                  )}
                >
                  {SEVERITY_LABEL[alert.severity]}
                </span>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                  <button
                    type="button"
                    aria-label={`Dismiss: ${alert.title}`}
                    title="Dismiss — it comes back if this gets worse"
                    disabled={dismissing === alert.key}
                    onClick={() => dismiss(alert.key)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint opacity-0 transition-all hover:bg-surface-sunken hover:text-ink-soft group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <CloseIcon size={12} />
                  </button>
                  <Link
                    href={alert.href}
                    aria-label={`Open: ${alert.title}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-all group-hover:translate-x-0.5 group-hover:text-saffron"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-saffron"
        >
          {expanded ? "Show fewer" : `${hidden} more ${hidden === 1 ? "item" : "items"} →`}
        </button>
      ) : null}
    </div>
  );
}
