"use client";

/**
 * Logging a payment, from wherever you happen to be.
 *
 * Payments get recorded in the moment — a transfer goes out while you're
 * looking at the vendor, a deposit is agreed while you're looking at the
 * budget — so this is one component that any screen can open with whatever it
 * already knows filled in. Being on the vendor page means the vendor is
 * prefilled; being on a budget line means that line is.
 *
 * Marking it paid sets the paid date to today unless you say otherwise, because
 * the overwhelmingly common case is logging something that has just happened.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { PlusIcon } from "@/components/ui/icons";
import { CURRENCY_CODES } from "@/lib/money";
import { createPayment } from "@/server/actions/budget";

export interface PaymentContext {
  vendors: { id: string; name: string }[];
  payers: { id: string; name: string }[];
  budgetItems: { id: string; name: string }[];
  baseCurrency: string;
}

const STATUSES: [string, string][] = [
  ["PAID", "Already paid"],
  ["UPCOMING", "Due later"],
  ["DUE", "Due now"],
];

/** Today, as the date input wants it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogPaymentButton({
  context,
  vendorId,
  payerId,
  budgetItemId,
  label = "Log a payment",
  variant = "secondary",
  className,
}: {
  context: PaymentContext;
  /** Prefilled when the screen already knows one of these. */
  vendorId?: string;
  payerId?: string;
  budgetItemId?: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className={cn("h-9 shrink-0 gap-1.5", className)}
        onClick={() => setOpen(true)}
      >
        <PlusIcon size={14} />
        {label}
      </Button>

      <PaymentComposer
        open={open}
        onOpenChange={setOpen}
        context={context}
        vendorId={vendorId}
        payerId={payerId}
        budgetItemId={budgetItemId}
      />
    </>
  );
}

function PaymentComposer({
  open,
  onOpenChange,
  context,
  vendorId,
  payerId,
  budgetItemId,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  context: PaymentContext;
  vendorId?: string;
  payerId?: string;
  budgetItemId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const initial = React.useCallback(
    () => ({
      label: "",
      amount: "",
      currency: context.baseCurrency,
      status: "PAID",
      dueDate: today(),
      paidDate: today(),
      vendorId: vendorId ?? "",
      payerId: payerId ?? "",
      budgetItemId: budgetItemId ?? "",
      method: "",
      reference: "",
      notes: "",
    }),
    [context.baseCurrency, vendorId, payerId, budgetItemId],
  );

  const [form, setForm] = React.useState(initial);

  // Reopening from a different vendor or payer should show that one, not the
  // last one.
  React.useEffect(() => {
    if (open) setForm(initial());
  }, [open, initial]);

  function set<K extends keyof ReturnType<typeof initial>>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.label.trim()) {
      setError("What is this payment for?");
      return;
    }
    if (!form.amount.trim()) {
      setError("How much?");
      return;
    }

    setPending(true);
    setError(null);

    const result = await createPayment({
      label: form.label,
      amount: form.amount,
      currency: form.currency,
      status: form.status,
      dueDate: form.dueDate,
      // Only a payment that has actually gone out carries a paid date.
      paidDate: form.status === "PAID" ? form.paidDate : undefined,
      vendorId: form.vendorId || undefined,
      payerId: form.payerId || undefined,
      budgetItemId: form.budgetItemId || undefined,
      method: form.method || undefined,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  const vendorName = context.vendors.find((v) => v.id === form.vendorId)?.name;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log a payment"
      width="md"
      description={
        vendorName
          ? `Against ${vendorName}. It'll show on the budget and their page.`
          : "It'll show on the budget, and on the vendor's page if you name one."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Log it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label="What was it for?" htmlFor="p-label" required>
          <Input
            id="p-label"
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder="Venue deposit"
            autoFocus
          />
        </FormField>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <FormField label="How much?" htmlFor="p-amount" required>
            <Input
              id="p-amount"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </FormField>
          <FormField label="Currency" htmlFor="p-currency">
            <Select
              id="p-currency"
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
              className="w-28"
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Where is it?" htmlFor="p-status">
            <Select
              id="p-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUSES.map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </Select>
          </FormField>

          <FormField
            label={form.status === "PAID" ? "Paid on" : "Due"}
            htmlFor="p-date"
          >
            <Input
              id="p-date"
              type="date"
              value={form.status === "PAID" ? form.paidDate : form.dueDate}
              onChange={(e) =>
                set(form.status === "PAID" ? "paidDate" : "dueDate", e.target.value)
              }
            />
          </FormField>
        </div>

        <FormField label="Who is it to?" htmlFor="p-vendor">
          <Select
            id="p-vendor"
            value={form.vendorId}
            onChange={(e) => set("vendorId", e.target.value)}
          >
            <option value="">Not a vendor</option>
            {context.vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Who's paying?" htmlFor="p-payer">
          <Select
            id="p-payer"
            value={form.payerId}
            onChange={(e) => set("payerId", e.target.value)}
          >
            <option value="">Not decided</option>
            {context.payers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Which budget line?"
          htmlFor="p-item"
          hint="Linking it keeps the forecast and what's actually been spent in step."
        >
          <Select
            id="p-item"
            value={form.budgetItemId}
            onChange={(e) => set("budgetItemId", e.target.value)}
          >
            <option value="">Not linked</option>
            {context.budgetItems.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="How was it paid?" htmlFor="p-method">
            <Input
              id="p-method"
              value={form.method}
              onChange={(e) => set("method", e.target.value)}
              placeholder="Bank transfer"
            />
          </FormField>
          <FormField label="Reference" htmlFor="p-ref">
            <Input
              id="p-ref"
              value={form.reference}
              onChange={(e) => set("reference", e.target.value)}
              placeholder="Invoice number"
            />
          </FormField>
        </div>

        <FormField label="Notes" htmlFor="p-notes">
          <Textarea
            id="p-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormField>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
