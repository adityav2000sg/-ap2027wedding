"use client";

/**
 * Planning pulse — four figures separated by rules rather than boxed into KPI
 * cards. The numbers carry the section; the labels stay quiet underneath.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatCompactMoney, formatPercent } from "@/lib/money";
import { AnimatedNumber } from "@/components/ui/motion";
import { Tooltip } from "@/components/ui/overlays";

export interface PulseMetric {
  key: string;
  value: number;
  /** Renders the animated value — e.g. money formatting or a % suffix. */
  format?: "money-compact" | "percent" | "plain";
  currency?: string;
  label: string;
  detail?: string;
  href?: string;
  tone?: "default" | "warning" | "critical" | "positive";
}

export function PlanningPulse({ metrics }: { metrics: PulseMetric[] }) {
  const reduce = useReducedMotion();

  return (
    <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:gap-y-0">
      {metrics.map((metric, index) => {
        const body = (
          <>
            <div
              className={cn(
                "tabular font-display text-[30px] leading-none tracking-tight",
                metric.tone === "critical" ? "text-critical"
                : metric.tone === "warning" ? "text-attention"
                : metric.tone === "positive" ? "text-positive"
                : "text-ink",
              )}
            >
              <AnimatedNumber
                value={metric.value}
                format={(value) => formatMetric(value, metric)}
              />
            </div>
            <div className="mt-2.5 text-[11.5px] leading-snug text-ink-muted">
              {metric.label}
            </div>
          </>
        );

        return (
          <motion.div
            key={metric.key}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              ease: [0.22, 1, 0.36, 1],
              delay: reduce ? 0 : index * 0.07,
            }}
            className={cn(
              "min-w-0 px-1 py-2 sm:px-6 sm:py-3",
              // Vertical rules between metrics, not around them.
              index > 0 ? "sm:border-l sm:border-line" : "",
              index === 0 ? "sm:pl-0" : "",
            )}
          >
            {metric.href ? (
              <Link href={metric.href} className="group block">
                {metric.detail ? (
                  <Tooltip content={metric.detail}>
                    <div className="transition-opacity group-hover:opacity-80">{body}</div>
                  </Tooltip>
                ) : (
                  <div className="transition-opacity group-hover:opacity-80">{body}</div>
                )}
              </Link>
            ) : metric.detail ? (
              <Tooltip content={metric.detail}>
                <div>{body}</div>
              </Tooltip>
            ) : (
              <div>{body}</div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function formatMetric(value: number, metric: PulseMetric): string {
  if (metric.format === "percent") return formatPercent(value, 0);
  if (metric.format === "money-compact") {
    return formatCompactMoney(value, metric.currency ?? "GBP");
  }
  return Math.round(value).toLocaleString("en-GB");
}
