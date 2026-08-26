"use client";

/**
 * The wardrobe, as a lookbook.
 *
 * Person first, then their look for each function, led by the photograph. The
 * operational detail — designer, cost, fittings, delivery — sits underneath the
 * image rather than replacing it with a table.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn, toneClasses } from "@/lib/cn";
import { formatMediumDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Modal, Sheet } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { GemIcon, PlusIcon } from "@/components/ui/icons";
import { Uploader } from "@/components/media/uploader";
import { Lightbox } from "@/components/media/lightbox";
import {
  completeFitting,
  createFitting,
  createOutfit,
  updateOutfit,
} from "@/server/actions/wardrobe";
import { setCoverMedia } from "@/server/actions/media";

interface Image {
  id: string; role: string; thumbUrl: string; largeUrl: string;
  caption: string | null; filename: string;
  width: number | null; height: number | null; createdAt: string;
}
interface Outfit {
  id: string; personId: string; eventId: string | null; outfitType: string;
  designer: string | null; vendorName: string | null;
  cost: number | null; currency: string; status: string;
  orderDate: string | null; deliveryDate: string | null; notes: string | null;
  images: Image[];
  accessories: { id: string; kind: string; name: string; status: string }[];
  fittings: { id: string; kind: string; scheduledAt: string; completedAt: string | null; location: string | null }[];
}
interface Jewel {
  id: string; personId: string | null; eventId: string | null; name: string;
  ownership: string; jeweller: string | null; cost: number | null; currency: string;
  insured: boolean; notes: string | null; storageNote: string | null; images: Image[];
}

const STATUS_LABEL: Record<string, string> = {
  IDEA: "Inspiration", SHORTLISTING: "Shortlisted", ORDERED: "Ordered",
  RECEIVED: "Received", ALTERATIONS: "Alterations", READY: "Ready",
  WORN: "Worn", RETURNED: "Returned",
};

const STATUS_VARIANT: Record<string, "neutral" | "info" | "attention" | "positive"> = {
  IDEA: "neutral", SHORTLISTING: "neutral", ORDERED: "info",
  RECEIVED: "info", ALTERATIONS: "attention", READY: "positive",
  WORN: "positive", RETURNED: "neutral",
};

const OWNERSHIP_LABEL: Record<string, string> = {
  OWNED: "Owned", PURCHASED: "Bought", RENTED: "Rented", BORROWED: "Borrowed",
};

export function WardrobeLookbook({
  people, outfits, jewellery, events, currency, canEdit, initialPersonId, initialOutfitId,
}: {
  people: { id: string; name: string; role: string }[];
  outfits: Outfit[];
  jewellery: Jewel[];
  events: { id: string; name: string; tone: string; dateLabel: string }[];
  currency: string;
  canEdit: boolean;
  initialPersonId: string | null;
  initialOutfitId: string | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [personId, setPersonId] = React.useState(initialPersonId);
  const [openOutfit, setOpenOutfit] = React.useState<string | null>(initialOutfitId);
  const [adding, setAdding] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<{ images: Image[]; index: number } | null>(null);

  const person = people.find((p) => p.id === personId) ?? people[0] ?? null;
  const personOutfits = outfits.filter((o) => o.personId === person?.id);
  const personJewellery = jewellery.filter((j) => j.personId === person?.id);
  const activeOutfit = outfits.find((o) => o.id === openOutfit) ?? null;

  const ready = personOutfits.filter((o) =>
    ["READY", "WORN", "RETURNED"].includes(o.status),
  ).length;

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Looks</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-[34px] leading-tight text-ink">Wardrobe</h1>
          {canEdit ? (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <PlusIcon size={14} /> Add a look
            </Button>
          ) : null}
        </div>
      </header>

      {/* Person switcher */}
      <div className="-mx-5 mb-8 overflow-x-auto px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1.5 border-b border-line pb-0">
          {people.map((p) => {
            const active = p.id === person?.id;
            const count = outfits.filter((o) => o.personId === p.id).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPersonId(p.id)}
                className={cn(
                  "relative px-3 pb-2.5 pt-1 text-left transition-colors",
                  active ? "text-ink" : "text-ink-muted hover:text-ink-soft",
                )}
              >
                <span className="block whitespace-nowrap font-display text-[17px] leading-tight">
                  {p.name}
                </span>
                <span className="block whitespace-nowrap text-[11px]">
                  {p.role}
                  <span className="tabular ml-1.5 text-ink-faint">{count}</span>
                </span>
                {active ? (
                  <motion.span
                    layoutId={reduce ? undefined : "wardrobe-person"}
                    className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-saffron"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {person ? (
        <>
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[26px] text-ink">{person.name}</h2>
            <p className="text-[12.5px] text-ink-muted">
              {personOutfits.length === 0
                ? "No looks planned yet"
                : `${ready} of ${personOutfits.length} looks ready`}
            </p>
          </div>

          {personOutfits.length === 0 ? (
            <EmptyState
              title={`Nothing planned for ${person.name} yet`}
              description="Add a look for each function — start with a photograph or a reference, and fill in the designer and cost as they firm up."
              action={
                canEdit ? (
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    Add a look
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout" initial={false}>
                {personOutfits.map((outfit, index) => {
                  const event = events.find((e) => e.id === outfit.eventId);
                  const cover =
                    outfit.images.find((i) => i.role === "cover") ?? outfit.images[0] ?? null;
                  const nextFitting = outfit.fittings.find((f) => !f.completedAt);

                  return (
                    <motion.article
                      key={outfit.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{
                        duration: 0.4,
                        ease: [0.22, 1, 0.36, 1],
                        delay: reduce ? 0 : index * 0.05,
                      }}
                      className="group"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenOutfit(outfit.id)}
                        className="block w-full text-left"
                      >
                        <div className="relative mb-3 aspect-[3/4] overflow-hidden rounded-xl bg-surface-sunken">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover.thumbUrl}
                              alt={outfit.outfitType}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-faint">
                              <HangerGlyph />
                              <span className="text-[11.5px]">No photo yet</span>
                            </div>
                          )}

                          {event ? (
                            <span
                              className={cn(
                                "absolute left-2.5 top-2.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium backdrop-blur",
                                toneClasses(event.tone).bg,
                                toneClasses(event.tone).text,
                                toneClasses(event.tone).border,
                              )}
                            >
                              {event.name}
                            </span>
                          ) : null}

                          {outfit.images.length > 1 ? (
                            <span className="tabular absolute bottom-2.5 right-2.5 rounded-full bg-ink/55 px-1.5 py-0.5 text-[10px] text-canvas backdrop-blur">
                              {outfit.images.length}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-display text-[17px] leading-tight text-ink transition-colors group-hover:text-saffron">
                              {outfit.outfitType}
                            </h3>
                            <p className="mt-0.5 truncate text-[12px] text-ink-muted">
                              {outfit.designer ?? outfit.vendorName ?? "Designer not chosen"}
                            </p>
                          </div>
                          <Badge variant={STATUS_VARIANT[outfit.status]} size="xs">
                            {STATUS_LABEL[outfit.status]}
                          </Badge>
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-muted">
                          {outfit.cost ? (
                            <span className="tabular">
                              {formatMoney(outfit.cost, outfit.currency)}
                            </span>
                          ) : null}
                          {nextFitting ? (
                            <span>
                              {nextFitting.kind === "FINAL" ? "Final" : "Next"} fitting{" "}
                              {formatMediumDate(new Date(nextFitting.scheduledAt))}
                            </span>
                          ) : outfit.deliveryDate ? (
                            <span>
                              Due {formatMediumDate(new Date(outfit.deliveryDate))}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Jewellery */}
          {personJewellery.length > 0 ? (
            <section className="mt-12">
              <div className="rule-heading mb-4">
                <h3 className="flex items-center gap-2 font-display text-[19px] text-ink">
                  <GemIcon size={15} className="text-ink-faint" /> Jewellery
                </h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {personJewellery.map((item) => {
                  const cover = item.images[0] ?? null;
                  return (
                    <div key={item.id} className="group">
                      <div className="relative mb-2 aspect-square overflow-hidden rounded-xl bg-surface-sunken">
                        {cover ? (
                          <button
                            type="button"
                            onClick={() => setLightbox({ images: item.images, index: 0 })}
                            className="block h-full w-full"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={cover.thumbUrl}
                              alt={item.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                            />
                          </button>
                        ) : canEdit ? (
                          <div className="flex h-full items-center justify-center p-2">
                            <Uploader
                              compact
                              entityType="jewellery"
                              entityId={item.id}
                              label="Add photo"
                              className="w-full"
                              onUploaded={() => router.refresh()}
                            />
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-ink-faint">
                            <GemIcon size={20} />
                          </div>
                        )}
                      </div>
                      <p className="text-[13px] leading-snug text-ink">{item.name}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-muted">
                        {OWNERSHIP_LABEL[item.ownership]}
                        {item.insured ? " · Insured" : ""}
                        {item.cost ? ` · ${formatMoney(item.cost, item.currency)}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="Nobody in the wardrobe yet"
          description="Add the people whose outfits you're tracking — the couple, both sets of parents, siblings."
        />
      )}

      <OutfitSheet
        outfit={activeOutfit}
        events={events}
        people={people}
        currency={currency}
        canEdit={canEdit}
        onClose={() => setOpenOutfit(null)}
        onChanged={() => router.refresh()}
        onOpenImage={(images, index) => setLightbox({ images, index })}
      />

      <AddOutfitModal
        open={adding}
        onOpenChange={setAdding}
        people={people}
        events={events}
        defaultPersonId={person?.id}
        currency={currency}
        onCreated={() => router.refresh()}
      />

      <Lightbox
        images={(lightbox?.images ?? []).map((image) => ({
          id: image.id,
          url: image.thumbUrl,
          largeUrl: image.largeUrl,
          caption: image.caption,
          filename: image.filename,
          width: image.width,
          height: image.height,
          createdAt: image.createdAt,
        }))}
        index={lightbox?.index ?? null}
        onIndexChange={(i) => setLightbox((c) => (c ? { ...c, index: i } : c))}
        onClose={() => setLightbox(null)}
        canEdit={false}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── Detail sheet

function OutfitSheet({
  outfit, events, people, currency, canEdit, onClose, onChanged, onOpenImage,
}: {
  outfit: Outfit | null;
  events: { id: string; name: string; tone: string }[];
  people: { id: string; name: string; role: string }[];
  currency: string;
  canEdit: boolean;
  onClose(): void;
  onChanged(): void;
  onOpenImage(images: Image[], index: number): void;
}) {
  const [booking, setBooking] = React.useState(false);
  if (!outfit) return null;

  const person = people.find((p) => p.id === outfit.personId);
  const event = events.find((e) => e.id === outfit.eventId);

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${person?.name ?? ""} — ${outfit.outfitType}`}
      description={event ? `${event.name}` : "Not tied to a function yet"}
      width="lg"
    >
      {/* Photographs */}
      {outfit.images.length > 0 ? (
        <div className="mb-5 grid grid-cols-3 gap-2">
          {outfit.images.map((image, index) => (
            <div key={image.id} className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-sunken">
              <button
                type="button"
                onClick={() => onOpenImage(outfit.images, index)}
                className="block h-full w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.thumbUrl}
                  alt={image.caption ?? outfit.outfitType}
                  className="h-full w-full object-cover transition-transform duration-400 group-hover:scale-[1.04]"
                />
              </button>
              {image.role === "cover" ? (
                <span className="absolute left-1.5 top-1.5 rounded bg-saffron px-1.5 py-0.5 text-[9.5px] font-medium text-white">
                  Cover
                </span>
              ) : canEdit ? (
                <button
                  type="button"
                  onClick={async () => {
                    await setCoverMedia(image.id, "outfit", outfit.id);
                    onChanged();
                  }}
                  className="absolute left-1.5 top-1.5 rounded bg-ink/55 px-1.5 py-0.5 text-[9.5px] text-canvas opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
                >
                  Make cover
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <Uploader
          className="mb-6"
          entityType="outfit"
          entityId={outfit.id}
          compact={outfit.images.length > 0}
          label={outfit.images.length === 0 ? "Add the outfit photo" : "Add references"}
          hint="The first image becomes the cover. Add fitting shots, fabric, jewellery and hair references too."
          onUploaded={onChanged}
        />
      ) : null}

      {/* Facts */}
      <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-4">
        <Fact label="Status">
          {canEdit ? (
            <Select
              value={outfit.status}
              onChange={async (e) => {
                await updateOutfit({ id: outfit.id, status: e.target.value });
                onChanged();
              }}
              className="h-7 text-[12.5px]"
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          ) : (
            STATUS_LABEL[outfit.status]
          )}
        </Fact>
        <Fact label="Designer">{outfit.designer ?? outfit.vendorName ?? "—"}</Fact>
        <Fact label="Cost">
          {outfit.cost ? formatMoney(outfit.cost, outfit.currency) : "Not set"}
        </Fact>
        <Fact label="Delivery">
          {outfit.deliveryDate ? formatMediumDate(new Date(outfit.deliveryDate)) : "—"}
        </Fact>
      </dl>

      {/* Fittings */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="eyebrow">Fittings</h4>
          {canEdit ? (
            <Button variant="ghost" size="xs" onClick={() => setBooking(true)}>
              <PlusIcon size={12} /> Book one
            </Button>
          ) : null}
        </div>
        {outfit.fittings.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">
            None booked. Booking a fitting also creates a task, so it shows up in
            the normal to-do list.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {outfit.fittings.map((fitting) => (
              <li
                key={fitting.id}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">
                    {fitting.kind === "FINAL" ? "Final" : fitting.kind === "SECOND" ? "Second" : fitting.kind === "TRIAL" ? "Trial" : "First"} fitting
                  </span>
                  <span className="block text-[11.5px] text-ink-muted">
                    {formatMediumDate(new Date(fitting.scheduledAt))}
                    {fitting.location ? ` · ${fitting.location}` : ""}
                  </span>
                </span>
                {fitting.completedAt ? (
                  <Badge variant="positive" size="xs">Done</Badge>
                ) : canEdit ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={async () => { await completeFitting(fitting.id); onChanged(); }}
                  >
                    Mark done
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {outfit.accessories.length > 0 ? (
        <section className="mb-6">
          <h4 className="eyebrow mb-2">Accessories</h4>
          <ul className="space-y-1">
            {outfit.accessories.map((a) => (
              <li key={a.id} className="flex justify-between text-[13px]">
                <span className="text-ink">{a.name}</span>
                <span className="text-ink-muted">{a.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canEdit ? (
        <section>
          <h4 className="eyebrow mb-2">Notes</h4>
          <Textarea
            defaultValue={outfit.notes ?? ""}
            placeholder="Fitting notes, alterations, what still needs deciding…"
            onBlur={async (e) => {
              if (e.target.value === (outfit.notes ?? "")) return;
              await updateOutfit({ id: outfit.id, notes: e.target.value });
              onChanged();
            }}
          />
        </section>
      ) : outfit.notes ? (
        <section>
          <h4 className="eyebrow mb-2">Notes</h4>
          <p className="text-[13px] leading-relaxed text-ink-soft">{outfit.notes}</p>
        </section>
      ) : null}

      <BookFittingModal
        open={booking}
        onOpenChange={setBooking}
        outfitId={outfit.id}
        onBooked={onChanged}
      />
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

function BookFittingModal({
  open, onOpenChange, outfitId, onBooked,
}: {
  open: boolean; onOpenChange(v: boolean): void; outfitId: string; onBooked(): void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Book a fitting"
      description="This also creates a task so it doesn't get lost."
      size="sm"
    >
      <form
        className="space-y-4 pb-1"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true); setError(null);
          const form = new FormData(event.currentTarget);
          const result = await createFitting({
            outfitId,
            kind: form.get("kind"),
            scheduledAt: form.get("scheduledAt"),
            location: form.get("location"),
          });
          setPending(false);
          if (!result.ok) { setError(result.error); return; }
          onOpenChange(false);
          onBooked();
        }}
      >
        <FormField label="Which fitting?" htmlFor="f-kind">
          <Select id="f-kind" name="kind" defaultValue="FIRST">
            <option value="FIRST">First</option>
            <option value="SECOND">Second</option>
            <option value="FINAL">Final</option>
            <option value="TRIAL">Trial</option>
          </Select>
        </FormField>
        <FormField label="When" required htmlFor="f-when">
          <Input id="f-when" name="scheduledAt" type="datetime-local" required />
        </FormField>
        <FormField label="Where" htmlFor="f-where">
          <Input id="f-where" name="location" placeholder="Studio, boutique…" />
        </FormField>
        {error ? (
          <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Booking…" : "Book fitting"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddOutfitModal({
  open, onOpenChange, people, events, defaultPersonId, currency, onCreated,
}: {
  open: boolean; onOpenChange(v: boolean): void;
  people: { id: string; name: string }[];
  events: { id: string; name: string }[];
  defaultPersonId?: string;
  currency: string;
  onCreated(): void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add a look">
      <form
        className="space-y-4 pb-1"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true); setError(null);
          const form = new FormData(event.currentTarget);
          const result = await createOutfit({
            personId: form.get("personId"),
            eventId: form.get("eventId"),
            outfitType: form.get("outfitType"),
            designer: form.get("designer"),
            cost: form.get("cost"),
            currency,
            status: form.get("status"),
          });
          setPending(false);
          if (!result.ok) { setError(result.error); return; }
          onOpenChange(false);
          onCreated();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Who" required htmlFor="o-person">
            <Select id="o-person" name="personId" defaultValue={defaultPersonId} required>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Which function" htmlFor="o-event">
            <Select id="o-event" name="eventId" defaultValue="">
              <option value="">Not tied to one</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="What is it?" required htmlFor="o-type">
          <Input id="o-type" name="outfitType" required autoFocus placeholder="Bridal lehenga" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Designer" className="sm:col-span-2" htmlFor="o-designer">
            <Input id="o-designer" name="designer" />
          </FormField>
          <FormField label={`Cost (${currency})`} htmlFor="o-cost">
            <Input id="o-cost" name="cost" type="number" min="0" />
          </FormField>
        </div>
        <FormField label="Where is it up to?" htmlFor="o-status">
          <Select id="o-status" name="status" defaultValue="IDEA">
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </FormField>
        {error ? (
          <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add look"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function HangerGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M8 6.5V5.8a1.6 1.6 0 111.6-1.6" strokeLinecap="round" />
      <path d="M8 6.5L2 10.4c-.7.5-.4 1.6.5 1.6h11c.9 0 1.2-1.1.5-1.6L8 6.5z" strokeLinejoin="round" />
    </svg>
  );
}
