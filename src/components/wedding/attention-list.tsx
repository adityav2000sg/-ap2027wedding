"use client";

/**
 * "Needs your attention" — the prioritised problem list.
 *
 * Every row is a real, specific problem with a number attached and somewhere to
 * go. Dismissing writes a persisted dismissal keyed to the alert, so a fixed
 * problem disappears on its own but an ignored one can be silenced.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { AlertIcon, CheckIcon, CloseIcon } from "@/components/ui/icons";
import type { Alert } from "@/domain/risk";
import type { Severity } from "@/domain/types";
import { dismissAlert } from "@/server/actions/alerts";

const ACCENT: Record<Severity, string> = {
  critical: "bg-critical",
  important: "bg-important",
  attention: "bg-attention",
  info: "bg-info",
};

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "Critical",
  important: "Important",
  attention: "Worth a look",
  info: "FYI",
};

export function AttentionList({
  alerts,
  limit,
  showDismiss = true,
}: {
  alerts: Alert[];
  limit?: number;
  showDismiss?: boolean;
}) {
  const router = useRouter();
  const [dismissing, setDismissing] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  const visible = limit && !expanded ? alerts.slice(0, limit) : alerts;
  const hidden = limit ? Math.max(0, alerts.length - limit) : 0;

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
      <EmptyState
        icon={<CheckIcon size={18} />}
        title="Nothing needs your attention"
        description="No overdue payments, no unsigned contracts, no capacity problems. This list fills itself back up when something changes — you don't need to go looking."
      />
    );
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {visible.map((alert) => (
          <li
            key={alert.key}
            className={cn(
              "group relative flex items-start gap-3 py-3 pl-4 pr-2 transition-colors hover:bg-surface-sunken/50",
              dismissing === alert.key && "opacity-40",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[3px] rounded-full",
                ACCENT[alert.severity],
              )}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13.5px] font-medium leading-snug text-ink">
                  {alert.title}
                </span>
                <Badge
                  variant={
                    alert.severity === "critical"
                      ? "critical"
                      : alert.severity === "important"
                        ? "important"
                        : alert.severity === "attention"
                          ? "attention"
                          : "info"
                  }
                  size="xs"
                >
                  {SEVERITY_TEXT[alert.severity]}
                </Badge>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
                {alert.detail}
              </p>
              <Link
                href={alert.href}
                className="mt-1.5 inline-block text-[12px] font-medium text-saffron hover:underline"
              >
                {alert.actionLabel ?? "Take a look"} →
              </Link>
            </div>

            {showDismiss ? (
              <Button
                variant="quiet"
                size="iconSm"
                aria-label={`Dismiss: ${alert.title}`}
                title="Dismiss — it'll come back if the problem gets worse"
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                disabled={dismissing === alert.key}
                onClick={() => dismiss(alert.key)}
              >
                <CloseIcon size={13} />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-full border-t border-line px-4 py-2.5 text-left text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          {expanded
            ? "Show fewer"
            : `Show ${hidden} more ${hidden === 1 ? "item" : "items"}`}
        </button>
      ) : null}
    </div>
  );
}

export { AlertIcon };
