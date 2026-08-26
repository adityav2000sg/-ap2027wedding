"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";

/**
 * Two timelines, one page: the months before, and the minutes within.
 * They answer different questions, so they get separate views rather than
 * being crammed together.
 */
export function TimelineTabs({
  planning,
  runOfShow,
  initialView,
}: {
  planning: React.ReactNode;
  runOfShow: React.ReactNode;
  initialView: string;
}) {
  const [view, setView] = React.useState(initialView === "day" ? "day" : "plan");
  const reduce = useReducedMotion();

  return (
    <>
      <div className="mb-6 flex items-center gap-1 border-b border-line">
        {[
          { key: "plan", label: "The months before" },
          { key: "day", label: "The days themselves" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            className={cn(
              "relative px-3 pb-2.5 pt-1 text-[13px] transition-colors",
              view === tab.key ? "text-ink" : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {tab.label}
            {view === tab.key ? (
              <motion.span
                layoutId={reduce ? undefined : "timeline-tab"}
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-saffron"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </button>
        ))}
      </div>

      <motion.div
        key={view}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {view === "plan" ? planning : runOfShow}
      </motion.div>
    </>
  );
}
