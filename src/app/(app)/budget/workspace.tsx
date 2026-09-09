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
import { Sheet, Tooltip } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { AnimatedNumber, Sparkline } from "@/components/ui/motion";
import { PlusIcon, PencilIcon } from "@/components/ui/icons";
import { archivePayment, markPaymentPaid, updatePayment } from "@/server/actions/budget";
import { useRouter } from "next/navigation";
import { BudgetEditor, type EditorIntent, type EditableItem } from "./budget-editor";
import { InlineAmount } from "./inline-amount";
import { LogPaymentButton, type PaymentContext } from "@/components/wedding/payment-composer";

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
  vendorId: string | null; vendorName: string | null;
  payerId: string | null; payerName: string | null;
  notes: string | null; isOverdue: boolean;
}

const PAYMENT_STATUSES = ["UPCOMING", "DUE", "PAID", "OVERDUE", "CANCELLED"] as const;

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

  // Everything the payment form needs, wherever it's opened from on this page.
  const paymentContext: PaymentContext = React.useMemo(
    () => ({
      vendors,
      payers: payers
        .filter((p): p is typeof p & { payerId: string } => Boolean(p.payerId))
        .map((p) => ({ id: p.payerId, name: p.name })),
      budgetItems: categories.flatMap((category) =>
        category.items.map((item) => ({
          id: item.edit?.id ?? item.id,
          name: `${category.name} · ${item.name}`,
        })),
      ),
      baseCurrency,
    }),
    [vendors, payers, categories, baseCurrency],
  );
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [paying, setPaying] = React.useState<string | null>(null);
  /** The payment whose details are open for editing. */
  const [editing, setEditing] = React.useState<Payment | null>(null);

  /**
   * Who paid, set from the row itself.
   *
   * Tagging a payment against a payer is the whole point of the payers view,
   * and it was the one thing a logged payment couldn't be given.
   */
  async function assignPayer(payment: Payment, payerId: string) {
    setPaying(payment.id);
    await updatePayment({ id: payment.id, payerId: payerId || null });
    setPaying(null);
    router.refresh();
  }
  const [editor, setEditor] = React.useState<EditorIntent | null>(null);

  const worst = categories
    .filter((c) => c.variance > 0)
    .sort((a, b) => b.variance - a.variance);

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-8 sm:py-8">
      <header className="mb-7">
        <div className="eyebrow mb-2">What this will cost</div>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-script text-[30px] sm:text-[54px] text-ink">Budget</h1>
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
      <div className="stat-row mb-6" style={{ ["--stat-cols" as string]: 5 }}>
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
                    <div className="reveal-on-hover flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity duration-500 group-hover:opacity-100 focus-within:opacity-100">
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

                          <InlineAmount
                            item={item.edit}
                            source={item.source}
                            isVariable={item.isVariable}
                            forecast={item.forecast}
                            displayCurrency={currency}
                            canEdit={canEdit}
                            onChanged={() => router.refresh()}
                          />

                          {canEdit && item.edit ? (
                            <Tooltip content="Edit this line">
                              <button
                                type="button"
                                aria-label={`Edit ${item.name}`}
                                onClick={() => setEditor({ kind: "edit-item", item: item.edit! })}
                                className="reveal-on-hover flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint opacity-0 transition-all duration-300 transition-natural hover:bg-surface-sunken hover:text-saffron group-hover/item:opacity-100 focus:opacity-100"
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
        <>
        {canPay ? (
          <div className="mb-4 flex justify-end">
            <LogPaymentButton context={paymentContext} variant="primary" />
          </div>
        ) : null}
        {payments.length === 0 ? (
          <EmptyState
            title="No payments logged yet"
            description="Log one as soon as money moves — a deposit, a transfer, anything. It'll show against the vendor and the budget line too."
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

                  {canPay ? (
                    <Select
                      value={payment.payerId ?? ""}
                      disabled={paying === payment.id}
                      onChange={(e) => assignPayer(payment, e.target.value)}
                      className="h-8 w-auto min-w-[132px] max-w-full shrink-0 text-[12px]"
                      aria-label={`Who paid for ${payment.label}`}
                    >
                      <option value="">Nobody tagged</option>
                      {paymentContext.payers.map((payer) => (
                        <option key={payer.id} value={payer.id}>
                          {payer.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}

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

                  {canPay ? (
                    <Button variant="ghost" size="xs" onClick={() => setEditing(payment)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        </>
      ) : null}

      {/* ── Who's paying ────────────────────────────────────────────────── */}
      {view === "payers" ? (
        <>
        {canPay ? (
          <div className="mb-4 flex justify-end">
            <LogPaymentButton context={paymentContext} variant="primary" />
          </div>
        ) : null}
        {payers.length === 0 ? (
          <EmptyState
            title="Nothing paid yet"
            description="Log a payment and this starts showing who has contributed what — useful when two families are splitting the cost."
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
        )}
        </>
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

      <PaymentEditor
        payment={editing}
        payers={paymentContext.payers}
        vendors={vendors}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

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

/**
 * A logged payment, after the fact.
 *
 * Money moves before anybody writes it down, and what gets written down is
 * often wrong: the wrong date, the wrong amount, nobody's name against it.
 * Marking one paid was the only thing that could be done to a payment once it
 * existed — everything else meant a trip to the database.
 */
function PaymentEditor({
  payment,
  payers,
  vendors,
  onClose,
  onSaved,
}: {
  payment: Payment | null;
  payers: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  onClose(): void;
  onSaved(): void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  React.useEffect(() => {
    setError(null);
    setConfirmingRemove(false);
  }, [payment?.id]);

  if (!payment) return null;

  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payment) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const result = await updatePayment({
      id: payment.id,
      label: String(form.get("label") ?? ""),
      amount: Number(form.get("amount") ?? 0),
      dueDate: String(form.get("dueDate") ?? ""),
      paidDate: String(form.get("paidDate") ?? ""),
      status: String(form.get("status") ?? payment.status),
      payerId: String(form.get("payerId") ?? "") || null,
      vendorId: String(form.get("vendorId") ?? "") || null,
      notes: String(form.get("notes") ?? ""),
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  async function remove() {
    if (!payment) return;
    setPending(true);
    const result = await archivePayment(payment.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => !next && onClose()}
      title="Edit this payment"
      description={`${payment.nativeCurrency} ${payment.nativeAmount.toLocaleString()}`}
      width="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <FormField label="What it's for" required htmlFor="pe-label">
          <Input id="pe-label" name="label" required defaultValue={payment.label} />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={`Amount (${payment.nativeCurrency})`} required htmlFor="pe-amount">
            <Input
              id="pe-amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={payment.nativeAmount}
            />
          </FormField>
          <FormField label="Status" htmlFor="pe-status">
            <Select id="pe-status" name="status" defaultValue={payment.status}>
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Due" required htmlFor="pe-due">
            <Input id="pe-due" name="dueDate" type="date" required defaultValue={day(payment.dueDate)} />
          </FormField>
          <FormField label="Paid" hint="Leave blank until it has gone out." htmlFor="pe-paid">
            <Input id="pe-paid" name="paidDate" type="date" defaultValue={day(payment.paidDate)} />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Who paid" htmlFor="pe-payer">
            <Select id="pe-payer" name="payerId" defaultValue={payment.payerId ?? ""}>
              <option value="">Nobody tagged</option>
              {payers.map((payer) => (
                <option key={payer.id} value={payer.id}>
                  {payer.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Vendor" htmlFor="pe-vendor">
            <Select id="pe-vendor" name="vendorId" defaultValue={payment.vendorId ?? ""}>
              <option value="">Not tied to one</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label="Notes" htmlFor="pe-notes">
          <Textarea id="pe-notes" name="notes" rows={2} defaultValue={payment.notes ?? ""} />
        </FormField>

        {error ? (
          <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {confirmingRemove ? (
            <>
              <span className="mr-auto text-[12.5px] text-ink-muted">Remove this payment?</span>
              <Button type="button" variant="ghost" onClick={() => setConfirmingRemove(false)} disabled={pending}>
                Keep
              </Button>
              <Button type="button" variant="danger" onClick={remove} disabled={pending}>
                Remove
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              disabled={pending}
              className="mr-auto text-[12.5px] text-ink-muted transition-colors hover:text-critical"
            >
              Remove this payment
            </button>
          )}
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
