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
import { FileIcon } from "@/components/ui/icons";
import { Uploader } from "@/components/media/uploader";
import { unlinkMedia } from "@/server/actions/media";
import {
  createBudgetItem,
  updateBudgetItem,
  archiveBudgetItem,
  createBudgetCategory,
  updateBudgetCategory,
  archiveBudgetCategory,
} from "@/server/actions/budget";

export interface EditableItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  eventId: string | null;
  vendorId: string | null;
  payerId: string | null;
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
  /** Quotes, invoices and receipts already filed against this line. */
  attachments: BudgetAttachment[];
}

/** One file filed against a budget line. */
export interface BudgetAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  previewUrl: string | null;
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
  payers,
  baseCurrency,
}: {
  intent: EditorIntent | null;
  onClose(): void;
  categories: Option[];
  events: Option[];
  vendors: Option[];
  /** Who can be on the hook for a line — the parents footing the bills. */
  payers: Option[];
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
            payers={payers}
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
            onRemove={
              intent.kind === "edit-category"
                ? async () => {
                    setError(null);
                    setPending(true);
                    try {
                      await handle(await archiveBudgetCategory(intent.category.id));
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : "Something went wrong.");
                    } finally {
                      setPending(false);
                    }
                  }
                : undefined
            }
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
  item, defaultCategoryId, categories, events, vendors, payers, baseCurrency,
  pending, error, onCancel, onSubmit,
}: {
  item: EditableItem | null;
  defaultCategoryId?: string;
  categories: Option[];
  events: Option[];
  vendors: Option[];
  payers: Option[];
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
      payerId: str("payerId"),
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
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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

      {/* Who is bearing it. Left deliberately blank by default — "not yet
          decided" is the honest answer for most lines for most of a year, and
          a dropdown that quietly defaults to somebody puts words in a
          parent's mouth. */}
      <FormField
        label="Who's paying for this?"
        htmlFor="bi-payer"
        hint="Leave blank until it's been agreed — unclaimed lines are listed together on the budget."
      >
        <Select id="bi-payer" name="payerId" defaultValue={item?.payerId ?? ""}>
          <option value="">Not yet decided</option>
          {payers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </FormField>

      {/* Paperwork.
          Only on a line that already exists — a file has to be attached to
          something, and a line being typed has no id yet. Saving first and
          attaching second is one extra click; inventing an id up front to avoid
          it would leave orphaned uploads whenever somebody changed their mind. */}
      {item ? (
        <Attachments itemId={item.id} initial={item.attachments} />
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface-soft px-3.5 py-2.5 text-[12px] text-ink-muted">
          Save this line and you can attach the quote, invoice or receipt to it.
        </p>
      )}

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
          <motion.span animate={{ rotate: showFirm ? 180 : 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
  category, baseCurrency, pending, error, onCancel, onSubmit, onRemove,
}: {
  category: EditableCategory | null;
  baseCurrency: string;
  pending: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(payload: Record<string, unknown>): Promise<boolean>;
  /** Absent when creating: there is nothing to remove yet. */
  onRemove?(): void;
}) {
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
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

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {category && onRemove ? (
          confirmingRemove ? (
            <>
              <span className="mr-auto text-[12.5px] text-ink-muted">
                Remove “{category.name}”?
              </span>
              <Button type="button" variant="ghost" onClick={() => setConfirmingRemove(false)} disabled={pending}>
                Keep
              </Button>
              <Button type="button" variant="danger" onClick={onRemove} disabled={pending}>
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
              Remove this category
            </button>
          )
        ) : null}
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : category ? "Save changes" : "Create category"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The paperwork for one budget line.
 *
 * Quotes, invoices and receipts, filed against the cost they belong to rather
 * than into a general documents pile where finding the caterer's third revised
 * quote means remembering what it was called.
 *
 * Files land in the same library as everything else — this only adds the link —
 * so anything attached here still shows up under Documents, and removing it
 * here detaches it without deleting the file.
 */
function Attachments({
  itemId,
  initial,
}: {
  itemId: string;
  initial: BudgetAttachment[];
}) {
  const [files, setFiles] = React.useState<BudgetAttachment[]>(initial);
  const [removing, setRemoving] = React.useState<string | null>(null);

  async function detach(mediaId: string) {
    setRemoving(mediaId);
    try {
      await unlinkMedia(mediaId, "budgetItem", itemId);
      setFiles((current) => current.filter((file) => file.id !== mediaId));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface-soft p-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="eyebrow">Quotes &amp; receipts</span>
        {files.length > 0 ? (
          <span className="text-[11.5px] text-ink-muted">
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
        ) : null}
      </div>

      {files.length > 0 ? (
        <ul className="mb-3 space-y-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              {file.previewUrl ? (
                // A thumbnail of the actual page beats a generic file glyph
                // when you are looking for one quote among four.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.previewUrl}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-sunken text-ink-muted">
                  <FileIcon size={13} />
                </span>
              )}

              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              >
                {file.filename}
              </a>

              <button
                type="button"
                onClick={() => void detach(file.id)}
                disabled={removing === file.id}
                aria-label={`Remove ${file.filename} from this line`}
                className="shrink-0 rounded-lg px-1.5 py-1 text-[11.5px] text-ink-faint transition-colors hover:text-critical disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Uploader
        entityType="budgetItem"
        entityId={itemId}
        role="reference"
        accept="image/*,application/pdf"
        label={files.length > 0 ? "Add another" : "Attach a quote or receipt"}
        hint="PDFs and photos. Also filed under Documents."
        compact
        onUploaded={(uploaded) =>
          setFiles((current) => [
            ...current,
            ...uploaded.map((media) => ({
              id: media.id,
              filename: media.filename,
              mimeType: media.mimeType,
              sizeBytes: media.sizeBytes,
              url: media.url,
              previewUrl: media.mimeType.startsWith("image/") ? media.thumbUrl : null,
            })),
          ])
        }
      />
    </div>
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
