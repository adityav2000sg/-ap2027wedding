"use client";

/**
 * The impact drawer.
 *
 * This is the point of the whole system: nothing consequential changes without
 * first showing what else it moves. Same component everywhere, so a guest-count
 * change, a vendor requote and an AI proposal all get the same treatment.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { Badge, Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { AnimatedNumber } from "@/components/ui/motion";
import type { Impact, ImpactKind, ImpactReport } from "@/domain/impact";
import type { Severity } from "@/domain/types";

/**
 * The four kinds of consequence, in the order a person reads them: what you
 * changed, what recalculated, what became a problem, what you should do.
 */
const KIND_ORDER: ImpactKind[] = ["direct", "automatic", "risk", "suggestion"];

const KIND_HEADING: Record<ImpactKind, string> = {
  direct: "What you're changing",
  automatic: "Updates automatically",
  risk: "Needs attention",
  suggestion: "Worth doing next",
};

const TYPE_LABEL: Record<string, string> = {
  budget: "Money",
  readiness: "Readiness",
  timeline: "Schedule",
  vendor: "Vendors",
  guest: "Guests",
  logistics: "Logistics",
  task: "Tasks",
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-critical",
  important: "bg-important",
  attention: "bg-attention",
  info: "bg-line-strong",
};

export function ImpactDrawer({
  report,
  open,
  onOpenChange,
  onConfirm,
  confirmLabel = "Apply the change",
  pending,
  error,
  stale,
  currency,
}: {
  report: ImpactReport | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(): void | Promise<void>;
  confirmLabel?: string;
  pending?: boolean;
  error?: string | null;
  /** Set when someone else changed something and this was recalculated. */
  stale?: boolean;
  currency: string;
}) {
  const reduce = useReducedMotion();

  if (!report) {
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title="Working out the impact…"
        width="md"
      >
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      </Sheet>
    );
  }

  // Grouped by kind — "catering went up £4,680" and "the venue is now too
  // small" are not the same sort of statement and shouldn't sit in one list.
  const byKind = new Map<ImpactKind, Impact[]>();
  for (const impact of report.impacts) {
    const list = byKind.get(impact.kind) ?? [];
    list.push(impact);
    byKind.set(impact.kind, list);
  }

  const affectedCount = report.impacts.length + report.timelineMoves.length;
  const financeDelta = report.finance?.delta ?? 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={report.source.label}
      description={report.source.description}
      width="md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink-muted">
            {report.material
              ? "This one's worth a second look."
              : "Small change — safe to apply."}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm} disabled={pending}>
              {pending ? "Applying…" : confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      {stale ? (
        <div className="mb-4 rounded-lg border border-attention/25 bg-attention-soft px-3.5 py-2.5">
          <p className="text-[12.5px] font-medium text-attention">
            Something changed while you were looking
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">
            Someone else edited the wedding, so we've recalculated the
            consequences. Your change hasn't been lost — check the updated list
            and apply again.
          </p>
        </div>
      ) : null}

      {/* Headline */}
      <div className="mb-5">
        <p className="font-display text-[22px] leading-tight text-ink">
          {affectedCount === 0
            ? "Nothing else changes"
            : `This affects ${affectedCount} ${affectedCount === 1 ? "thing" : "things"}`}
        </p>
        {affectedCount === 0 ? (
          <p className="mt-1 text-[13px] text-ink-muted">
            Nothing downstream depends on this. Safe to go ahead.
          </p>
        ) : null}
      </div>

      {/* The two figures people actually check */}
      {(report.finance && Math.abs(financeDelta) >= 1) || report.readiness?.delta ? (
        <div className="mb-6 grid grid-cols-2 gap-4 border-y border-line py-4">
          {report.finance && Math.abs(financeDelta) >= 1 ? (
            <div>
              <div className="eyebrow mb-1.5">Forecast</div>
              <div className="flex items-baseline gap-2">
                <span className="tabular font-display text-[24px] leading-none text-ink">
                  <AnimatedNumber
                    value={report.finance.after}
                    format={(v) => formatMoney(v, currency)}
                  />
                </span>
              </div>
              <div
                className={cn(
                  "tabular mt-1 text-[12.5px] font-medium",
                  financeDelta > 0 ? "text-critical" : "text-positive",
                )}
              >
                {formatMoney(financeDelta, currency, { signed: true })}
              </div>
            </div>
          ) : null}

          {report.readiness && report.readiness.delta !== 0 ? (
            <div>
              <div className="eyebrow mb-1.5">Readiness</div>
              <div className="tabular font-display text-[24px] leading-none text-ink">
                <AnimatedNumber
                  value={report.readiness.after}
                  format={(v) => `${Math.round(v)}%`}
                />
              </div>
              <div
                className={cn(
                  "tabular mt-1 text-[12.5px] font-medium",
                  report.readiness.delta > 0 ? "text-positive" : "text-critical",
                )}
              >
                {report.readiness.delta > 0 ? "+" : ""}
                {report.readiness.delta} points
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Everything it touches, grouped by what sort of thing it is */}
      {byKind.size > 0 ? (
        <div className="space-y-5">
          {KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind, groupIndex) => {
            const impacts = byKind.get(kind)!;
            return (
            <section key={kind}>
              <h4
                className={cn(
                  "eyebrow mb-2",
                  kind === "risk" ? "text-critical" : "",
                  kind === "suggestion" ? "text-saffron" : "",
                )}
              >
                {KIND_HEADING[kind]}
              </h4>
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {impacts.map((impact, index) => (
                    <motion.li
                      key={`${kind}-${index}`}
                      initial={reduce ? false : { opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.32,
                        ease: [0.22, 1, 0.36, 1],
                        delay: reduce ? 0 : (groupIndex * 3 + index) * 0.04,
                      }}
                      className="flex items-start gap-2.5"
                    >
                      <span
                        className={cn(
                          "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
                          SEVERITY_DOT[impact.severity],
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] leading-snug text-ink">
                          {impact.message}
                        </span>
                        <span className="block text-[12px] leading-snug text-ink-muted">
                          {[TYPE_LABEL[impact.type], impact.detail]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {impact.delta !== undefined && Math.abs(impact.delta) >= 1 ? (
                        <span
                          className={cn(
                            "tabular shrink-0 text-[12.5px] font-medium",
                            impact.delta > 0 ? "text-critical" : "text-positive",
                          )}
                        >
                          {formatMoney(impact.delta, currency, { signed: true })}
                        </span>
                      ) : null}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
            );
          })}
        </div>
      ) : null}

      {/* Schedule moves */}
      {report.timelineMoves.length > 0 ? (
        <section className="mt-6">
          <h4 className="eyebrow mb-2">
            {report.timelineMoves.length} run-of-show{" "}
            {report.timelineMoves.length === 1 ? "entry moves" : "entries move"}
          </h4>
          <ul className="space-y-1">
            {report.timelineMoves.map((move) => (
              <li
                key={move.entryId}
                className="flex items-baseline gap-3 rounded-lg border border-line px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{move.title}</span>
                  <span className="block text-[11.5px] text-ink-muted">{move.reason}</span>
                </span>
                <span className="tabular shrink-0 text-[12px] text-ink-soft">
                  {minutes(move.fromStart)} → {minutes(move.toStart)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical"
        >
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

function minutes(value: number): string {
  const normalised = ((value % 1440) + 1440) % 1440;
  const h24 = Math.floor(normalised / 60);
  const m = normalised % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Hook that wires a change through preview → confirm → apply.
 * Pages call `propose(change)` and render `<ImpactDrawer {...drawer} />`.
 */
export function useImpactFlow(
  currency: string,
  onApplied?: () => void,
) {
  const [open, setOpen] = React.useState(false);
  const [report, setReport] = React.useState<ImpactReport | null>(null);
  const [change, setChange] = React.useState<unknown>(null);
  const [fingerprint, setFingerprint] = React.useState<string | undefined>();
  const [idempotencyKey, setIdempotencyKey] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);
  const [stale, setStale] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Preview a change.
   *
   * `silentWhenTrivial` saves immediately with no drawer when nothing
   * downstream is affected — fixing a typo shouldn't need a confirmation.
   */
  const propose = React.useCallback(
    async (next: unknown, options: { silentWhenTrivial?: boolean } = {}) => {
      const { applyChange, previewChange } = await import("@/server/actions/impact");
      setChange(next);
      setReport(null);
      setStale(false);
      setError(null);

      const preview = await previewChange(next);
      if (!preview.ok) {
        setError(preview.error);
        return { shown: false, applied: false };
      }

      const { report: nextReport, fingerprint: fp, idempotencyKey: key } = preview.data;
      setFingerprint(fp);
      setIdempotencyKey(key);

      const trivial =
        nextReport.impacts.filter((i) => i.kind !== "direct").length === 0 &&
        nextReport.timelineMoves.length === 0;

      if (options.silentWhenTrivial && trivial) {
        const applied = await applyChange(next, { fingerprint: fp, idempotencyKey: key });
        if (applied.ok && applied.data.applied) {
          onApplied?.();
          return { shown: false, applied: true };
        }
      }

      setReport(nextReport);
      setOpen(true);
      return { shown: true, applied: false };
    },
    [onApplied],
  );

  const confirm = React.useCallback(async () => {
    if (!change) return;
    setPending(true);
    setError(null);

    const { applyChange } = await import("@/server/actions/impact");
    const result = await applyChange(change, { fingerprint, idempotencyKey });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Somebody else moved something — show the recalculated consequences
    // rather than applying what they approved a moment ago.
    if (result.data.stale && result.data.report) {
      setReport(result.data.report);
      setFingerprint(result.data.fingerprint);
      setStale(true);
      return;
    }

    setOpen(false);
    setStale(false);
    onApplied?.();
  }, [change, fingerprint, idempotencyKey, onApplied]);

  return {
    propose,
    drawer: {
      report,
      open,
      onOpenChange: setOpen,
      onConfirm: confirm,
      pending,
      error,
      stale,
      currency,
    },
  };
}
