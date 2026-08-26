"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";

export function LogisticsTabs({
  rooms, travel, transport, responsibilities, initialView,
}: {
  rooms: React.ReactNode;
  travel: React.ReactNode;
  transport: React.ReactNode;
  responsibilities: React.ReactNode;
  initialView: string;
}) {
  const tabs = [
    { key: "rooms", label: "Rooms", node: rooms },
    { key: "travel", label: "Travel", node: travel },
    { key: "transport", label: "Transport", node: transport },
    { key: "responsibilities", label: "Who's handling what", node: responsibilities },
  ];
  const [view, setView] = React.useState(
    tabs.some((t) => t.key === initialView) ? initialView : "rooms",
  );
  const reduce = useReducedMotion();
  const active = tabs.find((t) => t.key === view) ?? tabs[0];

  return (
    <>
      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            className={cn(
              "relative whitespace-nowrap px-3 pb-2.5 pt-1 text-[13px] transition-colors",
              view === tab.key ? "text-ink" : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {tab.label}
            {view === tab.key ? (
              <motion.span
                layoutId={reduce ? undefined : "logistics-tab"}
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
        {active.node}
      </motion.div>
    </>
  );
}
