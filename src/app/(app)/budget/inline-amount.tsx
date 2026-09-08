"use client";

/**
 * Editing a budget figure where it sits.
 *
 * A budget is corrected in dozens of small increments — a quote comes back £200
 * lower, a deposit turns out to include VAT — and making each one a trip
 * through a form is why budgets go stale.
 *
 * The subtlety is *which* number you're editing. The forecast shown on a line is
 * the firmest figure available: contracted beats negotiated beats quoted beats
 * estimated. Typing over the total has to write back to whichever of those is
 * actually governing, or the next render would snap back to the old value and
 * look like the edit was lost.
 *
 * Calculated lines (per-guest, per-room) are deliberately not editable here.
 * Their total is derived from a rate and a count, so overwriting the total would
 * be overwriting an output — the rate is what you'd want to change, and that
 * lives in the full editor.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatCompactMoney } from "@/lib/money";
import { updateBudgetItem } from "@/server/actions/budget";

/** Which stored field a forecast source corresponds to. */
const FIELD_FOR_SOURCE: Record<string, string> = {
  contracted: "contractedAmount",
  negotiated: "negotiatedAmount",
  quoted: "quoteAmount",
  estimated: "estimateAmount",
  allocated: "estimateAmount",
};

const SOURCE_NOUN: Record<string, string> = {
  contracted: "contracted figure",
  negotiated: "negotiated figure",
  quoted: "quote",
  estimated: "estimate",
  allocated: "estimate",
};

export interface InlineEditable {
  id: string;
  currency: string;
  fixedAmount: number | null;
  estimateAmount: number | null;
  quoteAmount: number | null;
  negotiatedAmount: number | null;
  contractedAmount: number | null;
}

export function InlineAmount({
  item,
  source,
  isVariable,
  forecast,
  displayCurrency,
  canEdit,
  onChanged,
}: {
  item: InlineEditable | null;
  source: string;
  isVariable: boolean;
  forecast: number;
  displayCurrency: string;
  canEdit: boolean;
  onChanged?(): void;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const field = FIELD_FOR_SOURCE[source];
  // "modelled" has no single stored number behind it, so it stays read-only.
  const editable = canEdit && !isVariable && item !== null && Boolean(field);

  React.useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function begin() {
    if (!editable || !item) return;
    const current =
      (item[field as keyof InlineEditable] as number | null) ??
      item.fixedAmount ??
      null;
    setDraft(current === null ? "" : String(current));
    setError(null);
    setEditing(true);
  }

  async function commit() {
    if (!item) return;
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed.replace(/[, ]/g, ""));

    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("That isn't a number.");
      return;
    }

    const current = (item[field as keyof InlineEditable] as number | null) ?? null;
    if (parsed === current) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await updateBudgetItem({ id: item.id, [field]: parsed ?? "" });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEditing(false);
    onChanged?.();
    router.refresh();
  }

  if (editing && item) {
    return (
      <span className="relative flex shrink-0 items-center gap-1">
        <span className="text-[11px] text-ink-faint">{item.currency}</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setError(null);
            }
          }}
          disabled={saving}
          inputMode="decimal"
          aria-label={`Edit the ${SOURCE_NOUN[source] ?? "amount"}`}
          className={cn(
            "tabular h-7 w-24 rounded-lg border border-saffron/40 bg-surface px-2 text-right text-[13px] text-ink outline-none",
            saving && "opacity-50",
          )}
        />
        {error ? (
          <span className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-lg border border-critical/20 bg-critical-soft px-2 py-1 text-[11px] text-critical">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  const body = (
    <>
      <span className="tabular block text-[13px] text-ink">
        {formatCompactMoney(forecast, displayCurrency)}
      </span>
      {item && item.currency !== displayCurrency ? (
        <span className="tabular block text-[10.5px] text-ink-faint">
          {formatCompactMoney(
            (item[field as keyof InlineEditable] as number | null) ?? forecast,
            item.currency,
          )}
        </span>
      ) : null}
    </>
  );

  if (!editable) {
    return <span className="shrink-0 text-right">{body}</span>;
  }

  return (
    <motion.button
      type="button"
      onClick={begin}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      title={`Tap to change the ${SOURCE_NOUN[source] ?? "amount"}`}
      className="shrink-0 rounded-lg px-1.5 py-0.5 text-right transition-colors hover:bg-surface-sunken"
    >
      {body}
    </motion.button>
  );
}
