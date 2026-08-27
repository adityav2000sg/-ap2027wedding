"use client";

import { useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/money";
import { Popover } from "@/components/ui/overlays";
import { setDisplayCurrency } from "@/server/actions/preferences";

export function CurrencyPicker({
  current,
  compact = false,
  className,
}: {
  current: string;
  compact?: boolean;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const reduce = useReducedMotion();
  const meta = CURRENCIES[current as keyof typeof CURRENCIES];

  return (
    <Popover
      align="end"
      className="w-52"
      trigger={
        <motion.button
          type="button"
          aria-label={`Reading in ${current}. Change currency.`}
          whileTap={reduce ? undefined : { scale: 0.94 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className={cn(
            compact
              ? "flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold"
              : "flex h-8 w-10 items-center justify-center rounded-lg text-[12px] font-semibold",
            "text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink",
            pending && "opacity-50",
            className,
          )}
        >
          {meta?.symbol ?? current}
          {compact ? (
            <span className="text-[10px] font-normal text-ink-faint">{current}</span>
          ) : null}
        </motion.button>
      }
    >
      <div className="px-2 py-1.5">
        <p className="text-[12px] font-medium text-ink">Show figures in</p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
          Only changes what you see. Amounts stay stored in the currency they
          were entered in.
        </p>
      </div>
      <div className="my-1 h-px bg-line" />
      {CURRENCY_CODES.map((code) => (
        <motion.button
          key={code}
          type="button"
          disabled={pending}
          whileTap={reduce ? undefined : { scale: 0.98 }}
          onClick={() => start(async () => { await setDisplayCurrency(code); })}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
            code === current
              ? "bg-saffron-soft text-saffron"
              : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
          )}
        >
          <span className="w-5 shrink-0 font-semibold">{CURRENCIES[code].symbol}</span>
          <span className="flex-1">{CURRENCIES[code].name}</span>
          <span className="text-[11px] text-ink-faint">{code}</span>
        </motion.button>
      ))}
    </Popover>
  );
}
