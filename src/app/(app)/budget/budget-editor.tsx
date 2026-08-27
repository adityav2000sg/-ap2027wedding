"use client";

/**
 * Budget editor.
 *
 * A single side-sheet that adds and edits both budget lines and categories.
 * The forecast engine reads whichever number is firmest — a contracted figure
 * beats a quote beats a per-guest model — so the form is arranged the same way:
 * how the line is costed first, then the firmer numbers as they land.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

import { cn, TONES } from "@/lib/cn";
import { currencySymbol, CURRENCY_CODES, CURRENCIES } from "@/lib/money";
import { Sheet } from "@/components/ui/overlays";
import { Button } from "@/components/ui/primitives";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import {
  createBudgetItem,
  updateBudgetItem,
  archiveBudgetItem,
  createBudgetCategory,
  updateBudgetCategory,
} from "@/server/actions/budget";

export interface EditableItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  eventId: string | null;
  vendorId: string | null;
  costModel: string;
  guestBasis: string;
  currency: string;
  allocatedAmount: number;
  fixedAmount: number | null;
  unitRate: number | null;
  unitQuantity: number | null;
  estimateAmount: number | null;
  quoteAmount: number | null;
  negotiatedAmount: number | null;
  contractedAmount: number | null;
}

export interface EditableCategory {
  id: string;
  name: string;
  tone: string;
  allocatedNative: number;
}

export type EditorIntent =
  | { kind: "add-item"; categoryId?: string }
  | { kind: "edit-item"; item: EditableItem }
  | { kind: "add-category" }
  | { kind: "edit-category"; category: EditableCategory };

interface Option {
  id: string;
  name: string;
}

const COST_MODELS: { value: string; label: string; hint: string }[] = [
  { value: "FIXED", label: "One-off cost", hint: "A single fixed amount." },
  { value: "PER_GUEST", label: "Per guest", hint: "Scales with the guest count." },
  { value: "PER_ROOM", label: "Per room", hint: "Scales with rooms booked." },
  { value: "PER_HOUSEHOLD", label: "Per household", hint: "Scales with households." },
  { value: "PER_UNIT", label: "Per unit", hint: "A rate times a quantity you set." },
];

const GUEST_BASES: { value: string; label: string }[] = [
  { value: "CONFIRMED_PLUS_PENDING", label: "Confirmed + likely" },
  { value: "CONFIRMED", label: "Confirmed only" },
  { value: "INVITED", label: "Everyone invited" },
  { value: "ESTIMATED", label: "Planning estimate" },
];

const TONE_LABEL: Record<string, string> = {
  haldi: "Haldi gold", mehendi: "Mehendi green", sangeet: "Sangeet plum",
  shaadi: "Shaadi rose", reception: "Reception amber", saffron: "Saffron",
  rose: "Rose", olive: "Olive", indigo: "Indigo", plum: "Plum",
  teal: "Teal", sky: "Sky", amber: "Amber", slate: "Slate",
};

export function BudgetEditor({
  intent,
  onClose,
  categories,
  events,
  vendors,
  baseCurrency,
}: {
  intent: EditorIntent | null;
  onClose(): void;
  categories: Option[];
  events: Option[];
  vendors: Option[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const open = intent !== null;
  const isItem = intent?.kind === "add-item" || intent?.kind === "edit-item";
  const editing =
    intent?.kind === "edit-item" ? intent.item
    : intent?.kind === "edit-category" ? intent.category
    : null;

  const title =
    intent?.kind === "add-item" ? "Add a budget line"
    : intent?.kind === "edit-item" ? "Edit budget line"
    : intent?.kind === "add-category" ? "New category"
    : "Edit category";

  const description =
    isItem
      ? "Every line says where its number comes from — the firmest figure wins."
      : "Categories group your lines and can hold an allocation of their own.";

  async function handle(result: { ok: boolean; error?: string }) {
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return false;
    }
    onClose();
    router.refresh();
    return true;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={title}
      description={description}
      width="md"
    >
      {intent ? (
        isItem ? (
          <ItemForm
            key={intent.kind === "edit-item" ? intent.item.id : "new-item"}
            item={intent.kind === "edit-item" ? intent.item : null}
            defaultCategoryId={intent.kind === "add-item" ? intent.categoryId : undefined}
            categories={categories}
            events={events}
            vendors={vendors}
            baseCurrency={baseCurrency}
            pending={pending}
            error={error}
            onCancel={onClose}
            onSubmit={async (payload, remove) => {
              setError(null);
              setPending(true);
              try {
                if (remove && intent.kind === "edit-item") {
                  return await handle(await archiveBudgetItem(intent.item.id));
                }
                const result =
                  intent.kind === "edit-item"
                    ? await updateBudgetItem({ id: intent.item.id, ...payload })
                    : await createBudgetItem(payload);
                return await handle(result);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Something went wrong.");
                return false;
              } finally {
                setPending(false);
              }
            }}
          />
        ) : (
          <CategoryForm
            key={intent.kind === "edit-category" ? intent.category.id : "new-category"}
            category={intent.kind === "edit-category" ? intent.category : null}
            baseCurrency={baseCurrency}
            pending={pending}
            error={error}
            onCancel={onClose}
            onSubmit={async (payload) => {
              setError(null);
              setPending(true);
              try {
                const result =
                  intent.kind === "edit-category"
                    ? await updateBudgetCategory({ id: intent.category.id, ...payload })
                    : await createBudgetCategory(payload);
                return await handle(result);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Something went wrong.");
                return false;
              } finally {
                setPending(false);
              }
            }}
          />
        )
      ) : null}
    </Sheet>
  );
}

// ───────────────────────────────────────────────────────────────── Item form

function ItemForm({
  item, defaultCategoryId, categories, events, vendors, baseCurrency,
  pending, error, onCancel, onSubmit,
}: {
  item: EditableItem | null;
  defaultCategoryId?: string;
  categories: Option[];
  events: Option[];
  vendors: Option[];
  baseCurrency: string;
  pending: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(payload: Record<string, unknown>, remove?: boolean): Promise<boolean>;
}) {
  const reduce = useReducedMotion();
  const [costModel, setCostModel] = React.useState(item?.costModel ?? "FIXED");
  const [currency, setCurrency] = React.useState(item?.currency ?? baseCurrency);
  const [showFirm, setShowFirm] = React.useState(
    Boolean(item?.quoteAmount || item?.negotiatedAmount || item?.contractedAmount),
  );
  const symbol = currencySymbol(currency);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const str = (k: string) => ((form.get(k) as string | null) ?? "").trim();
    const num = (k: string) => {
      const v = str(k);
      return v === "" ? "" : Number(v);
    };
    void onSubmit({
      name: str("name"),
      categoryId: str("categoryId"),
      description: str("description"),
      eventId: str("eventId"),
      vendorId: str("vendorId"),
      currency,
      costModel,
      guestBasis: str("guestBasis") || "CONFIRMED_PLUS_PENDING",
      allocatedAmount: num("allocatedAmount") === "" ? 0 : num("allocatedAmount"),
      fixedAmount: costModel === "FIXED" ? num("fixedAmount") : "",
      unitRate: costModel !== "FIXED" ? num("unitRate") : "",
      unitQuantity: costModel === "PER_UNIT" ? num("unitQuantity") : "",
      quoteAmount: num("quoteAmount"),
      negotiatedAmount: num("negotiatedAmount"),
      contractedAmount: num("contractedAmount"),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="What's this for?" required htmlFor="bi-name">
        <Input id="bi-name" name="name" autoFocus required defaultValue={item?.name ?? ""}
          placeholder="Sangeet stage & lighting" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Category" required htmlFor="bi-category">
          <Select id="bi-category" name="categoryId" required
            defaultValue={item?.categoryId ?? defaultCategoryId ?? ""}>
            <option value="" disabled>Choose one</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Currency" htmlFor="bi-currency">
          <Select id="bi-currency" name="currency" value={currency}
            onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>{code} · {CURRENCIES[code].symbol}</option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField label="How is it costed?" htmlFor="bi-cost">
        <Select id="bi-cost" name="costModel" value={costModel}
          onChange={(e) => setCostModel(e.target.value)}>
          {COST_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </Select>
      </FormField>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={costModel}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-4 sm:grid-cols-2"
        >
          {costModel === "FIXED" ? (
            <FormField label={`Amount (${symbol})`} htmlFor="bi-fixed" className="sm:col-span-2">
              <Input id="bi-fixed" name="fixedAmount" type="number" min="0" step="100"
                defaultValue={item?.fixedAmount ?? ""} placeholder="0" />
            </FormField>
          ) : (
            <FormField
              label={`Rate ${RATE_LABEL[costModel]} (${symbol})`}
              htmlFor="bi-rate"
              className={costModel === "PER_UNIT" ? undefined : "sm:col-span-2"}
            >
              <Input id="bi-rate" name="unitRate" type="number" min="0" step="10"
                defaultValue={item?.unitRate ?? ""} placeholder="0" />
            </FormField>
          )}

          {costModel === "PER_UNIT" ? (
            <FormField label="How many?" htmlFor="bi-qty">
              <Input id="bi-qty" name="unitQuantity" type="number" min="0" step="1"
                defaultValue={item?.unitQuantity ?? ""} placeholder="0" />
            </FormField>
          ) : null}

          {costModel === "PER_GUEST" ? (
            <FormField label="Count which guests?" htmlFor="bi-basis" className="sm:col-span-2">
              <Select id="bi-basis" name="guestBasis"
                defaultValue={item?.guestBasis ?? "CONFIRMED_PLUS_PENDING"}>
                {GUEST_BASES.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </Select>
            </FormField>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <FormField
        label={`Budget set aside (${symbol})`}
        hint="What you've allocated. The forecast is compared against this."
        htmlFor="bi-alloc"
      >
        <Input id="bi-alloc" name="allocatedAmount" type="number" min="0" step="100"
          defaultValue={item?.allocatedAmount ?? ""} placeholder="0" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Which event?" htmlFor="bi-event">
          <Select id="bi-event" name="eventId" defaultValue={item?.eventId ?? ""}>
            <option value="">The whole wedding</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Vendor" htmlFor="bi-vendor">
          <Select id="bi-vendor" name="vendorId" defaultValue={item?.vendorId ?? ""}>
            <option value="">Not linked</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </Select>
        </FormField>
      </div>

      {/* Firm numbers — override the model as they land. */}
      <div className="rounded-xl border border-line bg-surface-soft">
        <button
          type="button"
          onClick={() => setShowFirm((s) => !s)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        >
          <span className="text-[12.5px] font-medium text-ink-soft">
            Firm numbers <span className="text-ink-faint">— quote, negotiated, contracted</span>
          </span>
          <motion.span animate={{ rotate: showFirm ? 180 : 0 }} transition={{ duration: 0.2 }}
            className="text-ink-muted">
            <ChevronIcon />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {showFirm ? (
            <motion.div
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduce ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="grid gap-4 px-3.5 pb-3.5 sm:grid-cols-3">
                <FormField label={`Quote (${symbol})`} htmlFor="bi-quote">
                  <Input id="bi-quote" name="quoteAmount" type="number" min="0" step="100"
                    defaultValue={item?.quoteAmount ?? ""} />
                </FormField>
                <FormField label={`Negotiated (${symbol})`} htmlFor="bi-neg">
                  <Input id="bi-neg" name="negotiatedAmount" type="number" min="0" step="100"
                    defaultValue={item?.negotiatedAmount ?? ""} />
                </FormField>
                <FormField label={`Contracted (${symbol})`} htmlFor="bi-con">
                  <Input id="bi-con" name="contractedAmount" type="number" min="0" step="100"
                    defaultValue={item?.contractedAmount ?? ""} />
                </FormField>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <FormField label="Notes" htmlFor="bi-desc">
        <Textarea id="bi-desc" name="description" defaultValue={item?.description ?? ""}
          placeholder="Anything worth remembering…" />
      </FormField>

      {error ? (
        <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        {item ? (
          <Button type="button" variant="ghost" disabled={pending}
            className="text-critical hover:bg-critical-soft"
            onClick={() => onSubmit({}, true)}>
            Remove line
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : item ? "Save changes" : "Add line"}
          </Button>
        </div>
      </div>
    </form>
  );
}

const RATE_LABEL: Record<string, string> = {
  PER_GUEST: "per guest",
  PER_ROOM: "per room",
  PER_HOUSEHOLD: "per household",
  PER_UNIT: "per unit",
};

// ─────────────────────────────────────────────────────────────── Category form

function CategoryForm({
  category, baseCurrency, pending, error, onCancel, onSubmit,
}: {
  category: EditableCategory | null;
  baseCurrency: string;
  pending: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(payload: Record<string, unknown>): Promise<boolean>;
}) {
  const [tone, setTone] = React.useState(category?.tone ?? "saffron");
  const symbol = currencySymbol(baseCurrency);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const str = (k: string) => ((form.get(k) as string | null) ?? "").trim();
    void onSubmit({
      name: str("name"),
      accentTone: tone,
      allocatedAmount: str("allocatedAmount") === "" ? 0 : Number(str("allocatedAmount")),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Category name" required htmlFor="bc-name">
        <Input id="bc-name" name="name" autoFocus required defaultValue={category?.name ?? ""}
          placeholder="Decor & Florals" />
      </FormField>

      <FormField
        label={`Allocation (${symbol})`}
        hint="Optional. Covers lines you haven't itemised yet — stored in the wedding's base currency."
        htmlFor="bc-alloc"
      >
        <Input id="bc-alloc" name="allocatedAmount" type="number" min="0" step="1000"
          defaultValue={category?.allocatedNative ?? ""} placeholder="0" />
      </FormField>

      <div>
        <span className="mb-2 block text-[12.5px] font-medium text-ink-soft">Colour</span>
        <div className="flex flex-wrap gap-1.5">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              aria-label={TONE_LABEL[t] ?? t}
              aria-pressed={tone === t}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                tone === t ? "border-ink" : "border-transparent",
              )}
              style={{ background: `var(--color-${t})` }}
            />
          ))}
        </div>
        <p className="mt-2 text-[12px] text-ink-muted">{TONE_LABEL[tone] ?? tone}</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : category ? "Save changes" : "Create category"}
        </Button>
      </div>
    </form>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
