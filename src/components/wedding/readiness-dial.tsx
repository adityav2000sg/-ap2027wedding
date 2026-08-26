"use client";

/**
 * The readiness number, and the honest answer behind it.
 *
 * Clicking opens the breakdown: which component is holding the score down, and
 * exactly how many percentage points each individual problem is costing. A
 * score you can't interrogate is just a decoration.
 */

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { ProgressRing } from "@/components/ui/motion";
import { Sheet } from "@/components/ui/overlays";
import { Badge, Meter, SEVERITY_VARIANT } from "@/components/ui/primitives";
import { ArrowRightIcon } from "@/components/ui/icons";
import type { ReadinessResult } from "@/domain/readiness";

export function ReadinessDial({
  readiness,
  size = 140,
  tone = "saffron",
  scopeLabel = "Wedding readiness",
  caption,
}: {
  readiness: ReadinessResult;
  size?: number;
  tone?: string;
  scopeLabel?: string;
  caption?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const blockerCount = readiness.blockers.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-5 rounded-xl text-left transition-opacity hover:opacity-90"
        aria-label={`${scopeLabel}: ${readiness.percent} percent. See what's holding it back.`}
      >
        <ProgressRing value={readiness.percent} size={size} thickness={9} tone={tone}>
          <span className="tabular font-display text-[30px] leading-none text-ink">
            {readiness.percent}%
          </span>
          <span className="mt-1 text-[11px] text-ink-muted">ready</span>
        </ProgressRing>

        <div className="min-w-0">
          <div className="eyebrow">{scopeLabel}</div>
          {caption ? (
            <div className="mt-1 text-[13px] text-ink-soft">{caption}</div>
          ) : null}
          <div className="mt-2.5 space-y-1.5">
            {readiness.components.map((component) => (
              <div key={component.key} className="flex items-center gap-2">
                <span className="w-[104px] shrink-0 truncate text-[11.5px] text-ink-muted">
                  {component.label}
                </span>
                <Meter
                  value={(component.score ?? 0) * 100}
                  tone={tone}
                  height={4}
                  className="w-20"
                />
                <span className="tabular text-[11px] text-ink-faint">
                  {Math.round((component.score ?? 0) * 100)}%
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-medium text-saffron group-hover:gap-1.5">
            {blockerCount > 0
              ? `What's keeping this from 100%?`
              : "See the breakdown"}
            <ArrowRightIcon size={12} className="transition-transform" />
          </div>
        </div>
      </button>

      <ReadinessBreakdown
        open={open}
        onOpenChange={setOpen}
        readiness={readiness}
        scopeLabel={scopeLabel}
        tone={tone}
      />
    </>
  );
}

export function ReadinessBreakdown({
  open,
  onOpenChange,
  readiness,
  scopeLabel,
  tone = "saffron",
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  readiness: ReadinessResult;
  scopeLabel: string;
  tone?: string;
}) {
  const missing = 100 - readiness.percent;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${readiness.percent}% ready`}
      description={
        missing > 0
          ? `Here's exactly what the remaining ${missing}% is made of.`
          : "Everything's accounted for."
      }
      width="md"
    >
      {/* Where the score comes from */}
      <section className="mb-6">
        <h4 className="eyebrow mb-2.5">How {scopeLabel.toLowerCase()} is scored</h4>
        <div className="space-y-2.5">
          {readiness.components.map((component) => (
            <div key={component.key} className="surface px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] font-medium text-ink">
                  {component.label}
                </span>
                <span className="tabular shrink-0 text-[12px] text-ink-muted">
                  {component.points} of {component.maxPoints} points
                </span>
              </div>
              <Meter
                value={(component.score ?? 0) * 100}
                tone={tone}
                height={5}
                className="mt-2"
              />
              <p className="mt-1.5 text-[12px] text-ink-muted">{component.summary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What it's costing */}
      {readiness.blockers.length > 0 ? (
        <section>
          <h4 className="eyebrow mb-2.5">
            What's holding it back
          </h4>
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-muted">
            Ordered by how much each one is costing you. Fix the top of this list
            and the number moves the most.
          </p>
          <ul className="space-y-1.5">
            {readiness.blockers.map((blocker) => {
              const body = (
                <>
                  <span
                    className={cn(
                      "tabular mt-0.5 w-11 shrink-0 text-right text-[12.5px] font-semibold",
                      blocker.severity === "critical" ? "text-critical" : "text-ink-soft",
                    )}
                  >
                    −{blocker.pointsCost.toFixed(1)}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] text-ink">
                        {blocker.label}
                      </span>
                      {blocker.severity === "critical" ? (
                        <Badge variant={SEVERITY_VARIANT[blocker.severity]} size="xs">
                          Critical
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
                      {blocker.detail}
                    </span>
                  </span>
                </>
              );

              return (
                <li key={blocker.key}>
                  {blocker.href ? (
                    <Link
                      href={blocker.href}
                      onClick={() => onOpenChange(false)}
                      className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-sunken"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Tasks done" value={`${readiness.stats.tasksDone} / ${readiness.stats.tasksTotal}`} />
        <Stat label="Still open" value={readiness.stats.tasksOpen} />
        <Stat label="Overdue" value={readiness.stats.tasksOverdue} alarming={readiness.stats.tasksOverdue > 0} />
        <Stat label="Blocked" value={readiness.stats.tasksBlocked} />
        <Stat label="Critical open" value={readiness.stats.criticalOpen} alarming={readiness.stats.criticalOpen > 0} />
      </section>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  alarming,
}: {
  label: string;
  value: React.ReactNode;
  alarming?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-soft px-3 py-2">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 text-[16px] font-medium",
          alarming ? "text-critical" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}
