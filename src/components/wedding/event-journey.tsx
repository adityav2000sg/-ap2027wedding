"use client";

/**
 * The wedding journey.
 *
 * Five functions strung along a single hairline, in order, each with its own
 * accent. This replaces the grid of identical event cards — a wedding is a
 * sequence of days, and it should read as one.
 *
 * Horizontally scrollable on mobile with snap points, so it stays a journey
 * rather than collapsing into a stack.
 */

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { cn, TONE_HEX, toneClasses, toTone } from "@/lib/cn";
import { formatCompactMoney } from "@/lib/money";

export interface JourneyEvent {
  id: string;
  slug: string;
  name: string;
  dateLabel: string;
  timeLabel: string;
  tone: string;
  readiness: number;
  expectedGuests: number;
  blockers: number;
  /** The single most costly thing holding this event back. */
  topBlocker: string | null;
  forecast: number | null;
  venueName: string | null;
  currency: string;
}

export function EventJourney({
  events,
  showMoney,
}: {
  events: JourneyEvent[];
  showMoney: boolean;
}) {
  const [active, setActive] = React.useState<string | null>(null);
  const reduce = useReducedMotion();

  return (
    <section aria-label="The wedding journey">
      <div className="rule-heading mb-5">
        <h2 className="font-display text-[20px] text-ink">The wedding week</h2>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ol
          className="relative flex min-w-max gap-0 sm:grid sm:min-w-0 sm:gap-0"
          style={{ gridTemplateColumns: `repeat(${events.length}, minmax(0, 1fr))` }}
        >
          {/* The thread running through every function. */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-[52px] h-px bg-line"
          />

          {events.map((event, index) => {
            const tone = toneClasses(event.tone);
            const hex = TONE_HEX[toTone(event.tone)];
            const isActive = active === event.id;

            return (
              <li
                key={event.id}
                className="relative w-[220px] shrink-0 snap-start sm:w-auto"
                onMouseEnter={() => setActive(event.id)}
                onMouseLeave={() => setActive(null)}
              >
                <Link
                  href={`/events/${event.slug}`}
                  className={cn(
                    "group block rounded-xl px-3 pb-4 pt-0 outline-none transition-colors duration-300",
                    isActive ? tone.bg : "bg-transparent",
                  )}
                >
                  {/* Date */}
                  <div className="mb-3 text-center">
                    <div className="eyebrow">{event.dateLabel}</div>
                  </div>

                  {/* Node on the thread */}
                  <div className="relative mb-3 flex h-[26px] items-center justify-center">
                    <motion.span
                      className={cn(
                        "relative z-10 flex items-center justify-center rounded-full",
                        isActive ? tone.bg : "bg-canvas",
                      )}
                      animate={
                        reduce
                          ? undefined
                          : { scale: isActive ? 1.12 : 1 }
                      }
                      transition={{ type: "spring", stiffness: 400, damping: 26 }}
                      style={{ padding: 4 }}
                    >
                      <ReadinessNode value={event.readiness} colour={hex} />
                    </motion.span>
                  </div>

                  {/* Name */}
                  <h3
                    className={cn(
                      "text-center font-display text-[20px] leading-tight transition-all duration-200",
                      tone.text,
                      isActive ? "scale-[1.03]" : "",
                    )}
                  >
                    {event.name}
                  </h3>

                  <p className="mt-0.5 text-center text-[11.5px] text-ink-muted">
                    {event.timeLabel}
                  </p>

                  {/* Accent underline that grows on hover */}
                  <div className="mx-auto mt-2.5 h-[3px] w-full max-w-[120px] overflow-hidden rounded-full bg-line-soft">
                    <motion.div
                      className={cn("h-full rounded-full", tone.dot)}
                      initial={false}
                      animate={{ width: `${Math.max(4, event.readiness)}%` }}
                      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: index * 0.05 }}
                    />
                  </div>

                  {/* Detail */}
                  <dl className="mt-3 space-y-1 text-center text-[11.5px]">
                    <div>
                      <dt className="sr-only">Readiness</dt>
                      <dd className="tabular text-ink-soft">
                        {event.readiness}% ready
                      </dd>
                    </div>
                    <div>
                      <dt className="sr-only">Expected guests</dt>
                      <dd className="tabular text-ink-muted">
                        {event.expectedGuests} guests
                      </dd>
                    </div>
                    {showMoney && event.forecast ? (
                      <div>
                        <dt className="sr-only">Forecast</dt>
                        <dd className="tabular text-ink-muted">
                          {formatCompactMoney(event.forecast, event.currency)}
                        </dd>
                      </div>
                    ) : null}
                    {event.topBlocker ? (
                      <div>
                        <dt className="sr-only">Biggest blocker</dt>
                        <dd className={cn("font-medium leading-snug", tone.text)}>
                          {event.topBlocker}
                        </dd>
                        {event.blockers > 1 ? (
                          <dd className="text-ink-faint">
                            +{event.blockers - 1} more
                          </dd>
                        ) : null}
                      </div>
                    ) : (
                      <div>
                        <dd className="text-positive">On track</dd>
                      </div>
                    )}
                  </dl>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** A small ring on the journey thread showing that event's readiness. */
function ReadinessNode({ value, colour }: { value: number; colour: string }) {
  const size = 18;
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);

  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className="-rotate-90" aria-hidden>
      <circle cx="9" cy="9" r={radius} fill="none" stroke="var(--color-line-strong)" strokeWidth="2.5" />
      <motion.circle
        cx="9" cy="9" r={radius}
        fill="none"
        stroke={colour}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
