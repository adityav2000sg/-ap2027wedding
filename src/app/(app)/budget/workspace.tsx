"use client";

/**
 * Budget.
 *
 * Three views on the same money: by category, by payment, by who's paying.
 * Every line says where its number came from — contract, quote, or a live
 * calculation off the guest count — because an unexplained forecast is one
 * nobody trusts.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn, toneClasses } from "@/lib/cn";
import { formatMediumDate } from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { Badge, Button, EmptyState, SegmentBar } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlays";
import { AnimatedNumber, Sparkline } from "@/components/ui/motion";
import { PlusIcon, PencilIcon } from "@/components/ui/icons";
import { markPaymentPaid } from "@/server/actions/budget";
import { useRouter } from "next/navigation";
import { BudgetEditor, type EditorIntent, type EditableItem } from "./budget-editor";

interface Item {
  id: string; name: string; allocated: number; forecast: number; variance: number;
  source: string; explanation: string; isVariable: boolean; quantity: number | null;
  paid: number; vendorName: string | null; eventName: string | null;
  nativeCurrency: string; nativeForecast: number;
  edit: EditableItem | null;
}
interface Category {
  id: string; name: string; tone: string; allocated: number; allocatedNative: number;
  forecast: number; variance: number; variancePercent: number;
  paid: number; committed: number; items: Item[];
}
interface Payment {
  id: string; label: string; amount: number; nativeAmount: number; nativeCurrency: string;
  status: string; dueDate: string; paidDate: string | null;
  vendorName: string | null; payerName: string | null; isOverdue: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  contracted: "Contracted", negotiated: "Negotiated", quoted: "Quoted",
  modelled: "Calculated", estimated: "Estimated", allocated: "No estimate yet",
};

const PAYMENT_VARIANT: Record<string, "neutral" | "info" | "attention" | "positive" | "critical"> = {
  UPCOMING: "neutral", DUE: "attention", PAID: "positive",
  OVERDUE: "critical", CANCELLED: "neutral",
};

export function BudgetWorkspace({
  finance, categories, payments, payers, history, drivers, currency,
  canEdit, canPay, initialView, events, vendors, baseCurrency,
}: {
  finance: {
    totalBudget: number; forecast: number; variance: number; committed: number;
    paid: number; remainingPayable: number; contingencyRemaining: number;
    isOverBudget: boolean; allocated: number; missingRates: string[];
  };
  categories: Category[];
  payments: Payment[];
  payers: { payerId: string | null; name: string; paid: number; upcoming: number }[];
  history: { forecast: number; reason: string; at: string }[];
  drivers: { guests: number; rooms: number; households: number };
  currency: string;
  canEdit: boolean;
  canPay: boolean;
  initialView: string;
  events: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [view, setView] = React.useState(initialView);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [paying, setPaying] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<EditorIntent | null>(null);

  const worst = categories
    .filter((c) => c.variance > 0)
    .sort((a, b) => b.variance - a.variance);

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
      <header className="mb-7">
        <div className="eyebrow mb-2">What this will cost</div>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-[34px] leading-tight text-ink">Budget</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              Everything shown in {currency}. Amounts stay stored in the currency
              they were entered in.
            </p>
          </div>

          <div className="text-right">
            <div
              className={cn(
                "tabular font-display text-[38px] leading-none",
                finance.isOverBudget ? "text-critical" : "text-ink",
              )}
            >
              <AnimatedNumber
                value={finance.forecast}
                format={(v) => formatCompactMoney(v, currency)}
              />
            </div>
            <div className="mt-1.5 text-[12px] text-ink-muted">
              forecast against {formatCompactMoney(finance.totalBudget, currency)}
              {" · "}
              <span className={finance.isOverBudget ? "text-critical" : "text-positive"}>
                {formatCompactMoney(finance.variance, currency, { signed: true })}
              </span>
            </div>
          </div>
        </div>
      </header>

      {finance.missingRates.length > 0 ? (
        <div className="mb-5 rounded-lg border border-attention/25 bg-attention-soft px-3.5 py-2.5">
          <p className="text-[12.5px] text-attention">
            No exchange rate configured for {finance.missingRates.join(", ")} — those
            amounts are shown unconverted. Add a rate in Settings.
          </p>
        </div>
      ) : null}

      {/* Composition */}
      <SegmentBar
        className="mb-3"
        height={10}
        segments={[
          { value: finance.paid, tone: "olive", label: "Paid" },
          { value: Math.max(0, finance.committed - finance.paid), tone: "saffron", label: "Under contract" },
          { value: Math.max(0, finance.forecast - finance.committed), tone: "slate", label: "Not committed" },
        ]}
      />
      <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-5">
        <Figure label="Paid" value={formatCompactMoney(finance.paid, currency)} tone="olive" />
        <Figure label="Under contract" value={formatCompactMoney(finance.committed, currency)} tone="saffron" />
        <Figure label="Still to pay" value={formatCompactMoney(finance.remainingPayable, currency)} />
        <Figure label="Contingency left" value={formatCompactMoney(finance.contingencyRemaining, currency)} tone={finance.contingencyRemaining === 0 ? "rose" : undefined} />
        <Figure label="Allocated" value={formatCompactMoney(finance.allocated, currency)} />
      </div>

      {/* Forecast history */}
      {history.length > 2 ? (
        <section className="mb-8 border-y border-line py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="eyebrow mb-1">Forecast over time</h2>
              <p className="text-[12.5px] text-ink-muted">
                {history[history.length - 1]?.reason}
              </p>
            </div>
            <Sparkline
              points={history.map((h) => h.forecast)}
              width={280}
              height={44}
              tone={finance.isOverBudget ? "rose" : "olive"}
            />
          </div>
        </section>
      ) : null}

      {/* Views */}
      <div className="mb-5 flex items-center gap-1 border-b border-line">
        {[
          { key: "categories", label: "By category" },
          { key: "payments", label: "Payments" },
          { key: "payers", label: "Who's paying" },
        ].map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={cn(
              "relative px-3 pb-2.5 pt-1 text-[13px] transition-colors",
              view === v.key ? "text-ink" : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {v.label}
            {view === v.key ? (
              <motion.span
                layoutId={reduce ? undefined : "budget-view"}
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-saffron"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </button>
        ))}
      </div>

      {/* ── By category ─────────────────────────────────────────────────── */}
      {view === "categories" ? (
        <>
          <div className="mb-5 flex items-start justify-between gap-4">
            {worst.length > 0 ? (
              <p className="text-[13px] text-ink-soft">
                <span className="font-medium text-ink">{worst[0].name}</span> is{" "}
                <span className="font-medium text-critical">
                  {formatMoney(worst[0].variance, currency)}
                </span>{" "}
                above allocation — the biggest single gap.
              </p>
            ) : <span />}
            {canEdit ? (
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => setEditor({ kind: "add-category" })}
              >
                <PlusIcon size={14} /> Category
              </Button>
            ) : null}
          </div>

          <div className="space-y-1">
            {categories.map((category) => {
              const isOpen = expanded.has(category.id);
              const tone = toneClasses(category.tone);
              return (
                <div key={category.id} className="group border-b border-line">
                  <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(category.id)) next.delete(category.id);
                        else next.add(category.id);
                        return next;
                      })
                    }
                    className="flex min-w-0 flex-1 items-center gap-4 py-3.5 text-left"
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />

                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] text-ink transition-colors group-hover:text-saffron">
                        {category.name}
                      </span>
                      <span className="tabular block text-[11.5px] text-ink-muted">
                        {category.items.length} {category.items.length === 1 ? "line" : "lines"}
                        {category.paid > 0 ? ` · ${formatCompactMoney(category.paid, currency)} paid` : ""}
                      </span>
                    </span>

                    {/* Allocation vs forecast bar */}
                    <span className="hidden w-32 shrink-0 sm:block">
                      <span className="block h-[4px] w-full overflow-hidden rounded-full bg-surface-sunken">
                        <span
                          className={cn(
                            "block h-full rounded-full transition-all duration-500",
                            category.variance > 0 ? "bg-critical" : tone.dot,
                          )}
                          style={{
                            width: `${Math.min(100, (category.forecast / Math.max(category.allocated, category.forecast, 1)) * 100)}%`,
                          }}
                        />
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="tabular block text-[13.5px] text-ink">
                        {formatCompactMoney(category.forecast, currency)}
                      </span>
                      <span
                        className={cn(
                          "tabular block text-[11.5px]",
                          category.variance > 0 ? "text-critical" : "text-ink-muted",
                        )}
                      >
                        {category.variance === 0
                          ? `of ${formatCompactMoney(category.allocated, currency)}`
                          : formatCompactMoney(category.variance, currency, { signed: true })}
                      </span>
                    </span>
                  </button>

                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                      <Tooltip content="Add a line to this category">
                        <button
                          type="button"
                          aria-label={`Add a line to ${category.name}`}
                          onClick={() => setEditor({ kind: "add-item", categoryId: category.id })}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-saffron"
                        >
                          <PlusIcon size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Edit category">
                        <button
                          type="button"
                          aria-label={`Edit ${category.name}`}
                          onClick={() =>
                            setEditor({
                              kind: "edit-category",
                              category: {
                                id: category.id,
                                name: category.name,
                                tone: category.tone,
                                allocatedNative: category.allocatedNative,
                              },
                            })
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-saffron"
                        >
                          <PencilIcon size={13} />
                        </button>
                      </Tooltip>
                    </div>
                  ) : null}
                  </div>

                  {isOpen ? (
                    <motion.ul
                      initial={reduce ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden pb-3 pl-6"
                    >
                      {category.items.map((item) => (
                        <li
                          key={item.id}
                          className="group/item flex items-center gap-4 border-t border-line-soft py-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] text-ink">
                              {item.name}
                            </span>
                            <span className="block text-[11px] text-ink-muted">
                              {item.explanation}
                              {item.vendorName ? ` · ${item.vendorName}` : ""}
                            </span>
                          </span>

                          <Tooltip
                            content={
                              item.isVariable
                                ? "This recalculates when the guest or room count changes"
                                : SOURCE_LABEL[item.source]
                            }
                          >
                            <Badge
                              size="xs"
                              variant={
                                item.source === "contracted" ? "positive"
                                : item.source === "modelled" ? "info"
                                : "neutral"
                              }
                              className="shrink-0"
                            >
                              {item.isVariable ? "Live" : SOURCE_LABEL[item.source]}
                            </Badge>
                          </Tooltip>

                          <span className="shrink-0 text-right">
                            <span className="tabular block text-[13px] text-ink">
                              {formatCompactMoney(item.forecast, currency)}
                            </span>
                            {item.nativeCurrency !== currency ? (
                              <span className="tabular block text-[10.5px] text-ink-faint">
                                {formatCompactMoney(item.nativeForecast, item.nativeCurrency)}
                              </span>
                            ) : null}
                          </span>

                          {canEdit && item.edit ? (
                            <Tooltip content="Edit this line">
                              <button
                                type="button"
                                aria-label={`Edit ${item.name}`}
                                onClick={() => setEditor({ kind: "edit-item", item: item.edit! })}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint opacity-0 transition-all duration-150 hover:bg-surface-sunken hover:text-saffron group-hover/item:opacity-100 focus:opacity-100"
                              >
                                <PencilIcon size={13} />
                              </button>
                            </Tooltip>
                          ) : null}
                        </li>
                      ))}

                      {canEdit ? (
                        <li className="border-t border-line-soft pt-2">
                          <button
                            type="button"
                            onClick={() => setEditor({ kind: "add-item", categoryId: category.id })}
                            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] text-ink-muted transition-colors hover:text-saffron"
                          >
                            <PlusIcon size={13} /> Add a line
                          </button>
                        </li>
                      ) : null}
                    </motion.ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* ── Payments ────────────────────────────────────────────────────── */}
      {view === "payments" ? (
        payments.length === 0 ? (
          <EmptyState
            title="No payments scheduled yet"
            description="Payments appear here as vendors are contracted and deposits fall due. Nothing is contracted yet, so there's nothing to pay."
          />
        ) : (
          <ul>
            {payments.map((payment) => (
              <li key={payment.id} className="border-b border-line">
                <div className="flex items-center gap-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-ink">
                      {payment.vendorName ?? payment.label}
                    </span>
                    <span className="block text-[11.5px] text-ink-muted">
                      {payment.vendorName ? `${payment.label} · ` : ""}
                      {payment.status === "PAID" && payment.paidDate
                        ? `Paid ${formatMediumDate(new Date(payment.paidDate))}`
                        : `Due ${formatMediumDate(new Date(payment.dueDate))}`}
                      {payment.payerName ? ` · ${payment.payerName}` : ""}
                    </span>
                  </span>

                  <Badge
                    size="xs"
                    variant={payment.isOverdue ? "critical" : PAYMENT_VARIANT[payment.status]}
                    className="shrink-0"
                  >
                    {payment.isOverdue ? "Overdue" : payment.status.toLowerCase()}
                  </Badge>

                  <span className="tabular w-24 shrink-0 text-right text-[13.5px] text-ink">
                    {formatCompactMoney(payment.amount, currency)}
                  </span>

                  {canPay && payment.status !== "PAID" && payment.status !== "CANCELLED" ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={paying === payment.id}
                      onClick={async () => {
                        setPaying(payment.id);
                        await markPaymentPaid(payment.id);
                        setPaying(null);
                        router.refresh();
                      }}
                    >
                      {paying === payment.id ? "…" : "Mark paid"}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* ── Who's paying ────────────────────────────────────────────────── */}
      {view === "payers" ? (
        payers.length === 0 ? (
          <EmptyState
            title="Nothing paid yet"
            description="As payments are logged, this shows who has contributed what — useful when two families are splitting the cost."
          />
        ) : (
          <div className="space-y-5">
            {payers.map((payer) => (
              <div key={payer.payerId ?? "none"} className="border-b border-line pb-4">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-[19px] text-ink">{payer.name}</h3>
                  <span className="tabular text-[15px] text-ink">
                    {formatMoney(payer.paid, currency)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  paid so far
                  {payer.upcoming > 0
                    ? ` · ${formatCompactMoney(payer.upcoming, currency)} still scheduled`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )
      ) : null}

      {/* What moves the numbers */}
      <section className="mt-9 border-t border-line pt-6">
        <h2 className="eyebrow mb-3">What these numbers move with</h2>
        <div className="grid grid-cols-3 gap-x-8">
          <Figure label="Guests in the forecast" value={drivers.guests} />
          <Figure label="Rooms needed" value={drivers.rooms} />
          <Figure label="Households" value={drivers.households} />
        </div>
        <p className="mt-3 max-w-lg text-[12.5px] leading-relaxed text-ink-muted">
          Lines marked <span className="font-medium text-ink">Live</span> recalculate
          automatically when these change — so confirming another twenty guests moves
          catering without anyone editing a budget.
        </p>
      </section>

      {canEdit ? (
        <BudgetEditor
          intent={editor}
          onClose={() => setEditor(null)}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          events={events}
          vendors={vendors}
          baseCurrency={baseCurrency}
        />
      ) : null}
    </div>
  );
}

function Figure({
  label, value, tone,
}: {
  label: string; value: React.ReactNode; tone?: string;
}) {
  return (
    <div>
      <div
        className={cn(
          "tabular font-display text-[20px] leading-none",
          tone ? toneClasses(tone).text : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] text-ink-muted">{label}</div>
    </div>
  );
}
