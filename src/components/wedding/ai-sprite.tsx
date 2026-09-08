"use client";

/**
 * The owl.
 *
 * A small, permanently-present way into the planner. It sits bottom-right, above
 * the phone tab bar, blinks occasionally, and tips its head when you hover.
 *
 * Drawn rather than shipped as an image so it inherits the theme, scales
 * without artefacts, and costs nothing to load. Every bit of motion respects
 * `prefers-reduced-motion` — a thing that bobs forever in the corner is exactly
 * what a person with vestibular sensitivity does not need.
 */

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";

export function AiSprite({
  hint,
  className,
}: {
  /** One short line — usually the most pressing thing the planner could explain. */
  hint?: string | null;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = React.useState(false);
  const [blinking, setBlinking] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  // Blink on a loose interval so it reads as alive rather than as a metronome.
  React.useEffect(() => {
    if (reduce) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 140);
        schedule();
      }, 2600 + Math.random() * 4200);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduce]);

  const showHint = Boolean(hint) && !dismissed && hovered;

  return (
    <div
      className={cn(
        // Clear of the phone tab bar and the home indicator.
        "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-40 flex items-end gap-2 lg:bottom-6 lg:right-6",
        className,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showHint ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="mb-2 max-w-[220px] rounded-2xl rounded-br-md border border-line bg-surface px-3 py-2 shadow-float"
        >
          <p className="text-[12.5px] leading-snug text-ink-soft">{hint}</p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-1 text-[11px] text-ink-faint underline-offset-2 hover:underline"
          >
            Don't show this
          </button>
        </motion.div>
      ) : null}

      <Link
        href="/ai"
        aria-label="Ask the AI planner"
        className="group relative block"
      >
        <motion.div
          animate={
            reduce
              ? undefined
              : { y: hovered ? -3 : [0, -4, 0], rotate: hovered ? -6 : 0 }
          }
          transition={
            hovered
              ? { type: "spring", stiffness: 320, damping: 18 }
              : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
          }
          whileTap={reduce ? undefined : { scale: 0.9 }}
          className="drop-shadow-[0_6px_16px_rgba(26,23,20,0.22)]"
        >
          <Owl blinking={blinking} curious={hovered} />
        </motion.div>

        {/* A soft pool of light so it sits on the page rather than floating. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-1 left-1/2 h-2 w-8 -translate-x-1/2 rounded-full bg-ink/15 blur-[3px] transition-all group-hover:w-6 group-hover:opacity-70"
        />
      </Link>
    </div>
  );
}

function Owl({ blinking, curious }: { blinking: boolean; curious: boolean }) {
  return (
    <svg
      width="56"
      height="58"
      viewBox="0 0 56 58"
      fill="none"
      role="img"
      aria-hidden
      className="h-[42px] w-[40px] sm:h-[56px] sm:w-[54px]"
    >
      <defs>
        <linearGradient id="owl-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e89a54" />
          <stop offset="100%" stopColor="#c2703d" />
        </linearGradient>
        <linearGradient id="owl-belly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe3c8" />
          <stop offset="100%" stopColor="#f3c99f" />
        </linearGradient>
      </defs>

      {/* Ear tufts */}
      <path d="M12 16 L8 6 L19 11 Z" fill="url(#owl-body)" />
      <path d="M44 16 L48 6 L37 11 Z" fill="url(#owl-body)" />

      {/* Body */}
      <ellipse cx="28" cy="31" rx="21" ry="22" fill="url(#owl-body)" />

      {/* Belly */}
      <ellipse cx="28" cy="36" rx="14" ry="15" fill="url(#owl-belly)" />

      {/* Brow — the whole personality lives here */}
      <path
        d="M11 22 Q28 13 45 22"
        stroke="#a85c30"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Spectacles, because it is a planner */}
      <circle cx="20" cy="27" r="8.4" fill="#fdf6ec" stroke="#8a5230" strokeWidth="1.7" />
      <circle cx="36" cy="27" r="8.4" fill="#fdf6ec" stroke="#8a5230" strokeWidth="1.7" />
      <path d="M28.4 26.6 h-0.8" stroke="#8a5230" strokeWidth="1.7" strokeLinecap="round" />

      {/* Eyes. They shrink to a line on a blink and widen when curious. */}
      <g>
        <ellipse
          cx="20"
          cy="27"
          rx={blinking ? 4.2 : curious ? 4.4 : 4}
          ry={blinking ? 0.5 : curious ? 4.6 : 4}
          fill="#2b1a10"
          style={{ transition: "all 110ms ease" }}
        />
        <ellipse
          cx="36"
          cy="27"
          rx={blinking ? 4.2 : curious ? 4.4 : 4}
          ry={blinking ? 0.5 : curious ? 4.6 : 4}
          fill="#2b1a10"
          style={{ transition: "all 110ms ease" }}
        />
        {!blinking ? (
          <>
            <circle cx="21.6" cy="25.4" r="1.5" fill="#fff" opacity="0.95" />
            <circle cx="37.6" cy="25.4" r="1.5" fill="#fff" opacity="0.95" />
          </>
        ) : null}
      </g>

      {/* Beak */}
      <path d="M28 31.5 L24.6 36 h6.8 Z" fill="#e8a13f" />

      {/* Wings */}
      <ellipse cx="9.5" cy="33" rx="4.2" ry="10" fill="#b8652f" opacity="0.9" />
      <ellipse cx="46.5" cy="33" rx="4.2" ry="10" fill="#b8652f" opacity="0.9" />

      {/* Feet */}
      <path d="M22 52 v3 M20 55 h4" stroke="#e8a13f" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 52 v3 M32 55 h4" stroke="#e8a13f" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
