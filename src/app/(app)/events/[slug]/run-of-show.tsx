"use client";

/**
 * The run of show, as a vertical editorial timeline rather than a table.
 *
 * Times run down the left, a spine connects them, and the operational detail
 * (owner, vendor, location, notes) sits with each entry without turning the
 * whole thing into a spreadsheet.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn, toneClasses } from "@/lib/cn";
import { formatDuration, formatMinute } from "@/lib/dates";
import { Avatar, Badge, EmptyState } from "@/components/ui/primitives";
import { LockIcon } from "@/components/ui/icons";

interface Entry {
  id: string;
  title: string;
  startMinute: number;
  endMinute: number;
  location: string | null;
  status: string;
  isLocked: boolean;
  notes: string | null;
  ownerName: string | null;
  ownerTone: string | null;
  vendorName: string | null;
}

export function EventRunOfShow({
  entries,
  tone,
}: {
  entries: Entry[];
  tone: string;
}) {
  const reduce = useReducedMotion();
  const accent = toneClasses(tone);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No run of show yet"
        description="Build the minute-by-minute schedule once the venue is confirmed — hair and makeup, photography, the ceremony, dinner service. Everything downstream shifts together when one thing moves."
      />
    );
  }

  return (
    <ol className="relative">
      {/* The spine */}
      <div
        aria-hidden
        className="absolute bottom-4 left-[70px] top-4 w-px bg-line"
      />

      {entries.map((entry, index) => (
        <motion.li
          key={entry.id}
          initial={reduce ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
            delay: reduce ? 0 : Math.min(index * 0.04, 0.4),
          }}
          className="group relative flex gap-5 py-3"
        >
          {/* Time */}
          <div className="w-[58px] shrink-0 pt-0.5 text-right">
            <div className="tabular text-[13px] font-medium text-ink">
              {formatMinute(entry.startMinute)}
            </div>
            <div className="tabular text-[10.5px] text-ink-faint">
              {formatDuration(entry.endMinute - entry.startMinute)}
            </div>
          </div>

          {/* Node */}
          <div className="relative flex w-[3px] justify-center pt-[7px]">
            <span
              className={cn(
                "relative z-10 h-[9px] w-[9px] rounded-full border-2 border-canvas transition-colors",
                entry.status === "DONE"
                  ? "bg-positive"
                  : entry.isLocked
                    ? accent.dot
                    : "bg-line-strong group-hover:bg-saffron",
              )}
            />
          </div>

          {/* Entry */}
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="text-[14.5px] leading-snug text-ink">{entry.title}</h3>
              {entry.isLocked ? (
                <span
                  title="Fixed time — this can't be shifted"
                  className={cn("inline-flex items-center gap-1 text-[11px]", accent.text)}
                >
                  <LockIcon size={10} /> Fixed
                </span>
              ) : null}
              {entry.status === "DONE" ? (
                <Badge variant="positive" size="xs">Done</Badge>
              ) : entry.status === "CONFIRMED" ? (
                <Badge variant="info" size="xs">Confirmed</Badge>
              ) : null}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-ink-muted">
              {entry.location ? <span>{entry.location}</span> : null}
              {entry.vendorName ? (
                <>
                  {entry.location ? <span className="text-ink-faint">·</span> : null}
                  <span>{entry.vendorName}</span>
                </>
              ) : null}
            </div>

            {entry.notes ? (
              <p className="mt-1 max-w-lg text-[12px] leading-snug text-ink-muted">
                {entry.notes}
              </p>
            ) : null}
          </div>

          {entry.ownerName ? (
            <Avatar
              name={entry.ownerName}
              tone={entry.ownerTone}
              size="sm"
              className="mt-0.5 shrink-0"
            />
          ) : null}
        </motion.li>
      ))}
    </ol>
  );
}
