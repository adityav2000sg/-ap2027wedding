"use client";

/**
 * Motion primitives.
 *
 * Restrained by design: numbers ease rather than jump, rings sweep once when
 * they enter, and everything respects `prefers-reduced-motion`. Nothing here
 * blocks interaction while it plays.
 */

import * as React from "react";
import { useReducedMotion } from "motion/react";

import { cn, TONE_HEX, toTone } from "@/lib/cn";

/** Ease-out-quint — matches the CSS `transition-natural` curve. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

/**
 * Counts to a value when it changes. Used wherever a figure can move as a
 * consequence of something the user just did — a forecast, a readiness score,
 * a guest count — so the change is felt rather than merely displayed.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 650,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  const frameRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) return;

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplay(from + delta * easeOut(progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, duration, reduce]);

  return (
    <span className={cn("tabular", className)}>
      {format ? format(display) : Math.round(display).toLocaleString("en-IN")}
    </span>
  );
}

/**
 * The readiness ring. Sweeps from zero on mount and eases between values, so
 * completing a milestone visibly moves it.
 */
export function ProgressRing({
  value,
  size = 128,
  thickness = 8,
  tone = "saffron",
  children,
  className,
  label,
}: {
  /** 0–100 */
  value: number;
  size?: number;
  thickness?: number;
  tone?: string | null;
  children?: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = React.useState(reduce ? value : 0);
  const fromRef = React.useRef(reduce ? value : 0);

  React.useEffect(() => {
    if (reduce) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    const start = performance.now();
    const duration = 900;
    let frame: number;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setShown(from + delta * easeOut(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = value;
    };
  }, [value, reduce]);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, shown));
  const offset = circumference * (1 - clamped / 100);
  const colour = TONE_HEX[toTone(tone)];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(value)}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-sunken)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/**
 * Staggered entrance for lists. Applies a small delay per child so a page
 * settles rather than snapping — capped so long lists don't crawl.
 */
export function Stagger({
  children,
  step = 35,
  className,
}: {
  children: React.ReactNode;
  step?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const items = React.Children.toArray(children);

  return (
    <div className={className}>
      {items.map((child, index) => (
        <div
          key={index}
          className={reduce ? undefined : "animate-rise"}
          style={reduce ? undefined : { animationDelay: `${Math.min(index * step, 300)}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/** Expand/collapse that animates height without measuring layout thrash. */
export function Collapsible({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid transition-all duration-250 transition-natural",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

/** A small sparkline for forecast history. Pure SVG, no chart library. */
export function Sparkline({
  points,
  width = 120,
  height = 32,
  tone = "saffron",
  className,
}: {
  points: number[];
  width?: number;
  height?: number;
  tone?: string | null;
  className?: string;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);

  const path = points
    .map((point, i) => {
      const x = i * step;
      const y = height - ((point - min) / range) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const colour = TONE_HEX[toTone(tone)];
  const last = points[points.length - 1];
  const lastX = width;
  const lastY = height - ((last - min) / range) * (height - 4) - 2;

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path
        d={`${path} L${width},${height} L0,${height} Z`}
        fill={colour}
        opacity={0.08}
      />
      <path d={path} fill="none" stroke={colour} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={colour} />
    </svg>
  );
}
