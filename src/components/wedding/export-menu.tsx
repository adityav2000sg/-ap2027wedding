"use client";

/**
 * Getting a list out of the app.
 *
 * PDF goes through the browser's own print dialogue rather than a server-side
 * renderer. That sounds like a cop-out and isn't: the reader gets their own
 * paper size, their own margins, searchable text and no embedded-font problems,
 * and a table is exactly the kind of document print stylesheets handle well.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Popover } from "@/components/ui/overlays";
import { DownloadIcon } from "@/components/ui/icons";

export function ExportMenu({
  kind,
  label = "Export",
  className,
}: {
  kind: "guests" | "logistics";
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);

  function download(format: "xlsx" | "csv") {
    setOpen(false);
    // A plain navigation, so the browser handles the save dialogue and the
    // Content-Disposition header decides the filename.
    window.location.href = `/api/export/${kind}?format=${format}`;
  }

  function print() {
    setOpen(false);
    window.open(`/${kind}/print`, "_blank", "noopener");
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-52 p-1"
      trigger={
        <motion.button
          type="button"
          whileTap={reduce ? undefined : { scale: 0.96 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-[12.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink",
            className,
          )}
        >
          <DownloadIcon size={14} />
          {label}
        </motion.button>
      }
    >
      <MenuItem onClick={() => download("xlsx")} hint="Opens in Excel or Numbers">
        Excel spreadsheet
      </MenuItem>
      <MenuItem onClick={print} hint="Print, or save as PDF">
        PDF
      </MenuItem>
      <MenuItem onClick={() => download("csv")} hint="Plain text, opens anywhere">
        CSV
      </MenuItem>
    </Popover>
  );
}

function MenuItem({
  onClick,
  hint,
  children,
}: {
  onClick(): void;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-sunken"
    >
      <span className="text-[13px] text-ink">{children}</span>
      <span className="text-[11.5px] text-ink-faint">{hint}</span>
    </button>
  );
}
