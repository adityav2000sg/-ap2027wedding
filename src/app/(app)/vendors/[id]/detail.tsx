"use client";

/**
 * Vendor detail.
 *
 * The centrepiece is the negotiation history: every quote, every conversation
 * and every document on one timeline, with the movement between quotes shown
 * explicitly. Uploading a revised quote offers to update the vendor's price —
 * it never silently overwrites it.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatMediumDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { ConfirmModal, Modal } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { DownloadIcon, FileIcon, PlusIcon } from "@/components/ui/icons";
import { Uploader, type UploadedMedia } from "@/components/media/uploader";
import { Lightbox } from "@/components/media/lightbox";
import {
  logVendorInteraction,
  selectVendor,
  updateVendor,
  upsertContract,
} from "@/server/actions/vendors";
import { ImpactDrawer, useImpactFlow } from "@/components/wedding/impact-drawer";

interface Quote {
  id: string; label: string; amount: number; currency: string;
  receivedAt: string; isCurrent: boolean; notes: string | null;
  documentName: string | null; documentUrl: string | null;
}
interface Interaction {
  id: string; kind: string; occurredAt: string; summary: string; authorName: string | null;
}
interface Doc {
  id: string; name: string; kind: string; url: string; createdAt: string; isImage: boolean;
}

const KIND_LABEL: Record<string, string> = {
  NOTE: "Note", CALL: "Call", MEETING: "Meeting",
  EMAIL: "Email", SITE_VISIT: "Site visit",
};

export function VendorDetail({
  vendor, contract, quotes, interactions, documents, payments, tasks,
  currency, canEdit, canSeeMoney,
}: {
  vendor: {
    id: string; businessName: string; category: string; status: string;
    contactName: string | null; phone: string | null; email: string | null;
    website: string | null; city: string | null; rating: number | null;
    pros: string[]; cons: string[]; notes: string | null;
    packageInfo: string | null; deliverables: string[];
    decisionReason: string | null; isFavourite: boolean;
    nativeCurrency: string;
    quoteAmount: number | null; negotiatedAmount: number | null; contractedAmount: number | null;
    attributes: Record<string, string>;
  };
  contract: {
    id: string; title: string; amount: number; currency: string;
    status: string; signedDate: string | null; expiryDate: string | null;
  } | null;
  quotes: Quote[];
  interactions: Interaction[];
  documents: Doc[];
  payments: { id: string; label: string; amount: number; status: string; dueDate: string }[];
  tasks: { id: string; title: string; dueDate: string | null }[];
  currency: string;
  canEdit: boolean;
  canSeeMoney: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [logging, setLogging] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [pendingQuote, setPendingQuote] = React.useState<UploadedMedia | null>(null);
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  // A requote moves the category forecast and can tip the whole wedding over
  // budget, so it goes through the same preview everything else does.
  const impact = useImpactFlow(currency, () => {
    setPendingQuote(null);
    router.refresh();
  });

  const images = documents.filter((d) => d.isImage);
  const files = documents.filter((d) => !d.isImage);

  // Build the negotiation timeline: quotes and conversations interleaved.
  const timeline = [
    ...quotes.map((q) => ({ at: q.receivedAt, type: "quote" as const, quote: q })),
    ...interactions.map((i) => ({ at: i.occurredAt, type: "note" as const, note: i })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const firstQuote = quotes[0]?.amount ?? null;
  const settled =
    vendor.contractedAmount ?? vendor.negotiatedAmount ?? vendor.quoteAmount ?? null;
  const saved = firstQuote !== null && settled !== null ? firstQuote - settled : 0;

  return (
    <div className="grid gap-9 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-9">
        {/* ── Negotiation ─────────────────────────────────────────────────── */}
        <section>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[22px] text-ink">Negotiation</h2>
            {canEdit ? (
              <Button variant="ghost" size="xs" onClick={() => setLogging(true)}>
                <PlusIcon size={12} /> Log a conversation
              </Button>
            ) : null}
          </div>
          {canSeeMoney && saved > 0 ? (
            <p className="mb-4 text-[13px] text-ink-muted">
              Down{" "}
              <span className="font-medium text-positive">
                {formatMoney(saved, vendor.nativeCurrency)}
              </span>{" "}
              from the first quote.
            </p>
          ) : (
            <p className="mb-4 text-[13px] text-ink-muted">
              Every quote, call and document in one place.
            </p>
          )}

          {timeline.length === 0 ? (
            <EmptyState
              title="Nothing logged yet"
              description="Record the first conversation or upload their quote, and the history builds itself from there."
            />
          ) : (
            <ol className="relative">
              <div aria-hidden className="absolute bottom-3 left-[5px] top-3 w-px bg-line" />
              {timeline.map((entry, index) => {
                const previousQuote = quotes
                  .slice(0, quotes.findIndex((q) => q.id === (entry.type === "quote" ? entry.quote.id : "")))
                  .at(-1);
                const delta =
                  entry.type === "quote" && previousQuote
                    ? entry.quote.amount - previousQuote.amount
                    : 0;

                return (
                  <motion.li
                    key={entry.type === "quote" ? entry.quote.id : entry.note.id}
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.35,
                      ease: [0.22, 1, 0.36, 1],
                      delay: reduce ? 0 : index * 0.05,
                    }}
                    className="relative pb-5 pl-6 last:pb-0"
                  >
                    <span
                      className={cn(
                        "absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-canvas",
                        entry.type === "quote" ? "bg-saffron" : "bg-line-strong",
                      )}
                    />

                    <div className="text-[11.5px] text-ink-muted">
                      {formatMediumDate(new Date(entry.at))}
                    </div>

                    {entry.type === "quote" ? (
                      <div className="mt-0.5">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-[14px] text-ink">{entry.quote.label}</span>
                          {canSeeMoney ? (
                            <span className="tabular font-display text-[17px] text-ink">
                              {formatMoney(entry.quote.amount, entry.quote.currency)}
                            </span>
                          ) : null}
                          {canSeeMoney && delta !== 0 ? (
                            <span
                              className={cn(
                                "tabular text-[12.5px] font-medium",
                                delta < 0 ? "text-positive" : "text-critical",
                              )}
                            >
                              {delta < 0 ? "−" : "+"}
                              {formatMoney(Math.abs(delta), entry.quote.currency)}
                            </span>
                          ) : null}
                          {entry.quote.isCurrent ? (
                            <Badge variant="info" size="xs">Current</Badge>
                          ) : null}
                        </div>
                        {entry.quote.notes ? (
                          <p className="mt-0.5 text-[12.5px] text-ink-muted">
                            {entry.quote.notes}
                          </p>
                        ) : null}
                        {entry.quote.documentUrl ? (
                          <a
                            href={entry.quote.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-saffron hover:underline"
                          >
                            <FileIcon size={11} /> {entry.quote.documentName}
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-0.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[12px] font-medium text-ink-soft">
                            {KIND_LABEL[entry.note.kind] ?? entry.note.kind}
                          </span>
                          {entry.note.authorName ? (
                            <span className="text-[11.5px] text-ink-muted">
                              {entry.note.authorName}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">
                          {entry.note.summary}
                        </p>
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </ol>
          )}
        </section>

        {/* ── Documents ───────────────────────────────────────────────────── */}
        <section>
          <div className="rule-heading mb-3">
            <h2 className="font-display text-[19px] text-ink">Documents</h2>
          </div>

          {canEdit ? (
            <Uploader
              className="mb-4"
              entityType="vendor"
              entityId={vendor.id}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              compact={documents.length > 0}
              label={documents.length === 0 ? "Add quotes, contracts, invoices" : "Add more"}
              hint="Quotes, proposals, contracts, invoices, menus, floor plans."
              onUploaded={(uploaded) => {
                // A newly uploaded PDF is very often a revised quote — offer to
                // update the price rather than assuming either way.
                const doc = uploaded.find((u) => !u.mimeType.startsWith("image/"));
                if (doc && canSeeMoney) setPendingQuote(doc);
                router.refresh();
              }}
            />
          ) : null}

          {images.length > 0 ? (
            <div className="mb-4 grid grid-cols-4 gap-2">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  className="group aspect-square overflow-hidden rounded-lg bg-surface-sunken"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-400 group-hover:scale-[1.05]"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {files.length > 0 ? (
            <ul>
              {files.map((file) => (
                <li key={file.id} className="border-b border-line last:border-b-0">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
                      <FileIcon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink transition-colors group-hover:text-saffron">
                        {file.name}
                      </span>
                      <span className="block text-[11.5px] text-ink-muted">
                        {file.kind.toLowerCase()} · {formatMediumDate(new Date(file.createdAt))}
                      </span>
                    </span>
                    <DownloadIcon size={14} className="shrink-0 text-ink-faint transition-colors group-hover:text-saffron" />
                  </a>
                </li>
              ))}
            </ul>
          ) : images.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Nothing uploaded yet.</p>
          ) : null}
        </section>
      </div>

      {/* ── Side column ──────────────────────────────────────────────────── */}
      <div className="space-y-7">
        {canEdit && vendor.status !== "CONTRACTED" && vendor.status !== "REJECTED" ? (
          <div className="rounded-xl border border-line bg-surface-soft p-4">
            <h3 className="font-display text-[16px] text-ink">
              {vendor.status === "SELECTED" ? "Get it signed" : "Ready to commit?"}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
              {vendor.status === "SELECTED"
                ? "Selected but not contracted — the date isn't held until a contract is signed."
                : "Selecting closes out the other options in this category and creates the contract task."}
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setSelecting(true)}
            >
              {vendor.status === "SELECTED" ? "Mark contract signed" : "Select this vendor"}
            </Button>
          </div>
        ) : null}

        {/* Contact */}
        <section>
          <h3 className="eyebrow mb-2.5">Contact</h3>
          <dl className="space-y-2 text-[13px]">
            {vendor.contactName ? <Row label="Who">{vendor.contactName}</Row> : null}
            {vendor.phone ? (
              <Row label="Phone">
                <a href={`tel:${vendor.phone}`} className="text-saffron hover:underline">
                  {vendor.phone}
                </a>
              </Row>
            ) : null}
            {vendor.email ? (
              <Row label="Email">
                <a href={`mailto:${vendor.email}`} className="break-all text-saffron hover:underline">
                  {vendor.email}
                </a>
              </Row>
            ) : null}
            {vendor.website ? (
              <Row label="Website">
                <a href={vendor.website} target="_blank" rel="noreferrer" className="break-all text-saffron hover:underline">
                  Visit
                </a>
              </Row>
            ) : null}
            {!vendor.contactName && !vendor.phone && !vendor.email ? (
              <p className="text-[12.5px] text-ink-muted">No contact details yet.</p>
            ) : null}
          </dl>
        </section>

        {/* What they offer */}
        {Object.keys(vendor.attributes).length > 0 ? (
          <section>
            <h3 className="eyebrow mb-2.5">What they offer</h3>
            <dl className="space-y-2 text-[13px]">
              {Object.entries(vendor.attributes).map(([key, value]) => (
                <Row key={key} label={key}>{value}</Row>
              ))}
            </dl>
          </section>
        ) : null}

        {vendor.pros.length > 0 || vendor.cons.length > 0 ? (
          <section>
            <h3 className="eyebrow mb-2.5">The case</h3>
            {vendor.pros.length > 0 ? (
              <ul className="mb-2.5 space-y-1">
                {vendor.pros.map((pro, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-ink-soft">
                    <span className="text-positive">+</span> {pro}
                  </li>
                ))}
              </ul>
            ) : null}
            {vendor.cons.length > 0 ? (
              <ul className="space-y-1">
                {vendor.cons.map((con, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-ink-soft">
                    <span className="text-critical">−</span> {con}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {canSeeMoney && payments.length > 0 ? (
          <section>
            <h3 className="eyebrow mb-2.5">Payments</h3>
            <ul className="space-y-1.5">
              {payments.map((payment) => (
                <li key={payment.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{payment.label}</span>
                    <span className="block text-[11.5px] text-ink-muted">
                      {payment.status === "PAID" ? "Paid" : `Due ${payment.dueDate}`}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-ink">
                    {formatMoney(payment.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tasks.length > 0 ? (
          <section>
            <h3 className="eyebrow mb-2.5">Open tasks</h3>
            <ul className="space-y-1.5">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/tasks?task=${task.id}`}
                    className="block text-[13px] text-ink-soft transition-colors hover:text-saffron"
                  >
                    {task.title}
                    {task.dueDate ? (
                      <span className="block text-[11.5px] text-ink-muted">{task.dueDate}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {canEdit ? (
          <section>
            <h3 className="eyebrow mb-2.5">Notes</h3>
            <Textarea
              defaultValue={vendor.notes ?? ""}
              placeholder="Anything worth remembering…"
              onBlur={async (e) => {
                if (e.target.value === (vendor.notes ?? "")) return;
                await updateVendor({ id: vendor.id, notes: e.target.value });
                router.refresh();
              }}
            />
          </section>
        ) : vendor.notes ? (
          <section>
            <h3 className="eyebrow mb-2.5">Notes</h3>
            <p className="text-[13px] leading-relaxed text-ink-soft">{vendor.notes}</p>
          </section>
        ) : null}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <LogInteractionModal
        open={logging}
        onOpenChange={setLogging}
        vendorId={vendor.id}
        onLogged={() => router.refresh()}
      />

      <RevisedQuoteModal
        media={pendingQuote}
        currency={vendor.nativeCurrency}
        currentQuote={vendor.quoteAmount}
        onClose={() => setPendingQuote(null)}
        onSubmit={(amount) =>
          impact.propose({ type: "vendor.quote", vendorId: vendor.id, amount })
        }
      />

      <ImpactDrawer {...impact.drawer} confirmLabel="Update the quote" />

      <ConfirmModal
        open={selecting}
        onOpenChange={setSelecting}
        title={vendor.status === "SELECTED" ? "Mark the contract signed?" : `Select ${vendor.businessName}?`}
        description={
          vendor.status === "SELECTED"
            ? "This locks the contracted amount into the forecast and closes the signing task."
            : "Other options in this category will be closed out, and a task to get the contract signed will be created."
        }
        confirmLabel={vendor.status === "SELECTED" ? "Mark signed" : "Select vendor"}
        onConfirm={async () => {
          if (vendor.status === "SELECTED" && contract) {
            await upsertContract({
              vendorId: vendor.id,
              title: contract.title,
              amount: contract.amount,
              currency: contract.currency,
              status: "SIGNED",
              signedDate: new Date().toISOString().slice(0, 10),
            });
          } else {
            await selectVendor(vendor.id);
          }
          setSelecting(false);
          router.refresh();
        }}
      />

      <Lightbox
        images={images.map((image) => ({
          id: image.id,
          url: image.url,
          caption: null,
          filename: image.name,
          width: null,
          height: null,
          createdAt: image.createdAt,
        }))}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        canEdit={false}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  );
}

function LogInteractionModal({
  open, onOpenChange, vendorId, onLogged,
}: {
  open: boolean; onOpenChange(v: boolean): void; vendorId: string; onLogged(): void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Log a conversation" size="sm">
      <form
        className="space-y-4 pb-1"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true); setError(null);
          const form = new FormData(event.currentTarget);
          const result = await logVendorInteraction({
            vendorId,
            kind: form.get("kind"),
            summary: form.get("summary"),
          });
          setPending(false);
          if (!result.ok) { setError(result.error); return; }
          onOpenChange(false);
          onLogged();
        }}
      >
        <FormField label="What was it?" htmlFor="i-kind">
          <Select id="i-kind" name="kind" defaultValue="CALL">
            <option value="CALL">Call</option>
            <option value="MEETING">Meeting</option>
            <option value="EMAIL">Email</option>
            <option value="SITE_VISIT">Site visit</option>
            <option value="NOTE">Note</option>
          </Select>
        </FormField>
        <FormField label="What happened?" required htmlFor="i-summary">
          <Textarea
            id="i-summary"
            name="summary"
            required
            autoFocus
            placeholder="Asked them to drop the second album and give another 5%."
          />
        </FormField>
        {error ? (
          <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Log it"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Offered after a document upload. The brief is explicit that a revised quote
 * must never silently overwrite the current price — so this asks.
 */
function RevisedQuoteModal({
  media, currency, currentQuote, onClose, onSubmit,
}: {
  media: UploadedMedia | null;
  currency: string;
  currentQuote: number | null;
  onClose(): void;
  onSubmit(amount: number): Promise<unknown>;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Modal
      open={media !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Is this a revised quote?"
      description={
        media
          ? `${media.filename} has been saved against this vendor. If it contains a new price, enter it and the forecast will follow.`
          : ""
      }
      size="sm"
    >
      <form
        className="space-y-4 pb-1"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const amount = Number(form.get("amount"));
          if (!Number.isFinite(amount) || amount < 0) {
            setError("Enter a valid amount.");
            return;
          }
          setPending(true); setError(null);
          await onSubmit(amount);
          setPending(false);
        }}
      >
        <FormField
          label={`New quote (${currency})`}
          hint={currentQuote ? `Currently ${formatMoney(currentQuote, currency)}.` : undefined}
          htmlFor="q-amount"
        >
          <Input id="q-amount" name="amount" type="number" min="0" autoFocus />
        </FormField>
        {error ? (
          <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            No, just the file
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Working it out…" : "See what this changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
