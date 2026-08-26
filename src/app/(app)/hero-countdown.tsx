"use client";

/**
 * The countdown and readiness, typographically rather than as a KPI card.
 *
 * The number is the largest thing on the page after the couple's names, because
 * it is the one figure everyone checks first.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { AnimatedNumber } from "@/components/ui/motion";
import { ReadinessBreakdown } from "@/components/wedding/readiness-dial";
import type { ReadinessResult } from "@/domain/readiness";

export function HeroCountdown({
  daysToGo,
  readinessPercent,
  readiness,
}: {
  daysToGo: number;
  readinessPercent: number;
  readiness: ReadinessResult;
}) {
  const [open, setOpen] = React.useState(false);
  const reduce = useReducedMotion();

  return (
    <>
      <div className="min-w-[210px]">
        {daysToGo >= 0 ? (
          <div className="text-right">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              className="font-display text-[64px] leading-[0.85] text-ink sm:text-[76px]"
            >
              <AnimatedNumber value={daysToGo} duration={1100} />
            </motion.div>
            <div className="eyebrow mt-2">
              {daysToGo === 1 ? "Day to go" : "Days to go"}
            </div>
          </div>
        ) : (
          <div className="text-right">
            <div className="font-display text-[44px] leading-none text-ink">
              Married
            </div>
          </div>
        )}

        <div className="mt-7 text-right">
          <div className="eyebrow mb-2">Wedding readiness</div>

          <div className="flex items-baseline justify-end gap-1.5">
            <span className="tabular font-display text-[26px] leading-none text-ink">
              <AnimatedNumber value={readinessPercent} format={(v) => `${Math.round(v)}`} />
            </span>
            <span className="text-[14px] text-ink-soft">% ready</span>
          </div>

          {/* A thin line, not a chunky bar. */}
          <div className="mt-2.5 h-[2px] w-full overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full bg-saffron"
              initial={{ width: 0 }}
              animate={{ width: `${readinessPercent}%` }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-saffron transition-all hover:gap-2"
          >
            See what's holding us back
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </div>

      <ReadinessBreakdown
        open={open}
        onOpenChange={setOpen}
        readiness={readiness}
        scopeLabel="Wedding readiness"
      />
    </>
  );
}
