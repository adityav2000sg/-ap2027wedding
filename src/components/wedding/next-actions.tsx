"use client";

/**
 * Next best actions and Today's agenda.
 *
 * A ranked planner list and a day sheet — deliberately not a task board. The
 * ranking numeral does the work a status pill would have done.
 */

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatDueLabel, formatMinute } from "@/lib/dates";
import { Avatar } from "@/components/ui/primitives";
import type { TaskRowData } from "./task-row-data";

export function NextBestActions({ tasks }: { tasks: TaskRowData[] }) {
  const reduce = useReducedMotion();

  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-ink-muted">
        Nothing outstanding. Enjoy it while it lasts.
      </p>
    );
  }

  return (
    <ol>
      {tasks.map((task, index) => (
        <motion.li
          key={task.id}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
            delay: reduce ? 0 : index * 0.06,
          }}
          className="group border-b border-line last:border-b-0"
        >
          <Link href={`/tasks?task=${task.id}`} className="flex items-start gap-4 py-3.5">
            <span className="tabular w-5 shrink-0 pt-0.5 font-display text-[16px] text-ink-faint transition-colors group-hover:text-saffron">
              {index + 1}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[14px] leading-snug text-ink transition-colors group-hover:text-saffron">
                {task.title}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-muted">
                {task.dueDate ? (
                  <span className={cn(task.isOverdue && "font-medium text-critical")}>
                    {formatDueLabel(new Date(task.dueDate))}
                  </span>
                ) : (
                  <span>No date set</span>
                )}
                <span>
                  Impact:{" "}
                  <span className={cn(task.importance >= 4 ? "text-ink-soft" : "")}>
                    {task.importance >= 5 ? "Essential"
                      : task.importance >= 4 ? "High"
                      : task.importance >= 3 ? "Medium" : "Low"}
                  </span>
                </span>
                {task.downstreamCount > 0 ? (
                  <span>Unblocks {task.downstreamCount}</span>
                ) : null}
              </span>
            </span>

            {task.ownerName ? (
              <Avatar name={task.ownerName} tone={task.ownerTone} size="sm" className="mt-0.5" />
            ) : (
              <span
                title="Nobody is handling this yet"
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-[10px] text-ink-faint"
              >
                ?
              </span>
            )}
          </Link>
        </motion.li>
      ))}
    </ol>
  );
}

export interface AgendaItem {
  id: string;
  title: string;
  startMinute: number;
  endMinute: number;
  people: { name: string; tone: string | null }[];
  href: string;
  context: string | null;
}

export function TodaysAgenda({
  items,
  emptyMessage,
}: {
  items: AgendaItem[];
  emptyMessage: string;
}) {
  const reduce = useReducedMotion();

  if (items.length === 0) {
    return (
      <p className="py-8 text-[13px] leading-relaxed text-ink-muted">{emptyMessage}</p>
    );
  }

  return (
    <ol className="relative">
      {/* The day's spine */}
      <div aria-hidden className="absolute bottom-4 left-[58px] top-3 w-px bg-line" />

      {items.map((item, index) => (
        <motion.li
          key={item.id}
          initial={reduce ? false : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
            delay: reduce ? 0 : index * 0.06,
          }}
          className="group relative"
        >
          <Link href={item.href} className="flex items-start gap-4 py-3">
            <span className="tabular w-[46px] shrink-0 pt-0.5 text-right text-[12px] font-medium text-ink-soft">
              {formatMinute(item.startMinute)}
            </span>

            <span
              aria-hidden
              className="relative z-10 mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full border-2 border-canvas bg-line-strong transition-colors group-hover:bg-saffron"
            />

            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] leading-snug text-ink transition-colors group-hover:text-saffron">
                {item.title}
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-muted">
                <span>{durationLabel(item.endMinute - item.startMinute)}</span>
                {item.context ? (
                  <>
                    <span className="text-ink-faint">·</span>
                    <span className="truncate">{item.context}</span>
                  </>
                ) : null}
              </span>
            </span>

            {item.people.length > 0 ? (
              <span className="mt-0.5 flex shrink-0 items-center -space-x-1.5">
                {item.people.slice(0, 3).map((person, i) => (
                  <Avatar
                    key={`${person.name}-${i}`}
                    name={person.name}
                    tone={person.tone}
                    size="sm"
                    className="ring-2 ring-canvas"
                  />
                ))}
              </span>
            ) : null}
          </Link>
        </motion.li>
      ))}
    </ol>
  );
}

function durationLabel(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
