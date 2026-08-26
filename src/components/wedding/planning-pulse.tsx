"use client";

/**
 * Planning pulse — four figures separated by rules rather than boxed into KPI
 * cards. The numbers carry the section; the labels stay quiet underneath.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
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
    <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4 sm:gap-y-0">
      {metrics.map((metric, index) => {
        const body = (
          <>
            <div
              className={cn(
                "font-display text-[30px] leading-none",
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
            <div className="mt-1.5 text-[11.5px] leading-snug text-ink-muted">
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
              "px-0 sm:px-5",
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
  if (metric.format === "percent") return `${Math.round(value)}%`;
  if (metric.format === "money-compact") {
    const symbol = CURRENCY_SYMBOL[metric.currency ?? "GBP"] ?? "";
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${symbol}${trim(abs / 1_000_000)}M`;
    if (abs >= 1_000) return `${symbol}${trim(abs / 1_000)}K`;
    return `${symbol}${Math.round(abs)}`;
  }
  return Math.round(value).toLocaleString("en-GB");
}

function trim(value: number): string {
  const fixed = value >= 100 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: "£", USD: "$", SGD: "S$", EUR: "€", INR: "₹", THB: "฿",
};
