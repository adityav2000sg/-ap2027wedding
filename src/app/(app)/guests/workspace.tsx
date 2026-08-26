"use client";

/**
 * Guests.
 *
 * The RSVP grid is the heart of it — one row per guest, one column per
 * function, clickable to change. Everything else about a guest lives behind
 * their name in a side sheet.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn, toneClasses } from "@/lib/cn";
import { Avatar, Badge, Button, EmptyState, SegmentBar } from "@/components/ui/primitives";
import { Sheet, Tooltip } from "@/components/ui/overlays";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/form";
import { SearchIcon } from "@/components/ui/icons";
import { updateGuest } from "@/server/actions/guests";
import { ImpactDrawer, useImpactFlow } from "@/components/wedding/impact-drawer";

interface Guest {
  id: string; firstName: string; lastName: string; side: string;
  relationship: string | null; householdId: string | null; householdName: string | null;
  city: string | null; country: string; phone: string | null; email: string | null;
  isVIP: boolean; isChild: boolean; isSenior: boolean;
  dietary: string; allergies: string | null; accessibilityNeeds: string | null;
  needsAccommodation: boolean; needsTransport: boolean;
  notes: string | null; tags: string[];
  rsvp: Record<string, string>;
}

const RSVP_CYCLE = ["NOT_INVITED", "PENDING", "CONFIRMED", "TENTATIVE", "DECLINED"] as const;

const RSVP_GLYPH: Record<string, { mark: string; className: string; label: string }> = {
  NOT_INVITED: { mark: "·", className: "text-ink-faint", label: "Not invited" },
  PENDING: { mark: "?", className: "text-attention", label: "Awaiting a reply" },
  CONFIRMED: { mark: "✓", className: "text-positive", label: "Coming" },
  TENTATIVE: { mark: "~", className: "text-info", label: "Maybe" },
  DECLINED: { mark: "✕", className: "text-ink-faint", label: "Not coming" },
};

const DIET_LABEL: Record<string, string> = {
  VEGETARIAN: "Vegetarian", NON_VEGETARIAN: "Non-vegetarian",
  JAIN: "Jain", VEGAN: "Vegan", NOT_SPECIFIED: "Not specified",
};

export function GuestsWorkspace({
  guests, households, events, stats, canEdit, currency, rsvpEnabled,
  initialFilter, initialEvent, initialGuest, initialSide,
}: {
  guests: Guest[];
  households: { id: string; name: string; invitationStatus: string; rsvpToken: string; side: string }[];
  events: { id: string; name: string; tone: string; counts: { invited: number; confirmed: number } }[];
  stats: Record<string, number>;
  canEdit: boolean;
  currency: string;
  rsvpEnabled: boolean;
  initialFilter: string | null;
  initialEvent: string | null;
  initialGuest: string | null;
  initialSide: string | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState(initialFilter ?? "all");
  const [side, setSide] = React.useState(initialSide ?? "");
  const [openGuest, setOpenGuest] = React.useState<string | null>(initialGuest);
  const [savingCell, setSavingCell] = React.useState<string | null>(null);
  const [cellMenu, setCellMenu] = React.useState<{ guestId: string; eventId: string } | null>(null);

  // Every RSVP goes through the propagation engine. Most are trivial and save
  // straight away; the ones that move catering, rooms or capacity stop and
  // explain themselves first.
  const impact = useImpactFlow(currency, () => {
    setCellMenu(null);
    router.refresh();
  });

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    return guests
      .filter((guest) => {
        const answered = Object.values(guest.rsvp);
        switch (filter) {
          case "confirmed": return answered.includes("CONFIRMED");
          case "pending":
            return answered.some((s) => s === "PENDING");
          case "declined":
            return answered.length > 0 && answered.every((s) => s === "DECLINED" || s === "NOT_INVITED")
              && answered.includes("DECLINED");
          case "not-contacted":
            return answered.every((s) => s === "NOT_INVITED");
          case "accommodation": return guest.needsAccommodation;
          case "vip": return guest.isVIP;
          default: return true;
        }
      })
      .filter((guest) => !side || guest.side === side)
      .filter((guest) =>
        !q ||
        `${guest.firstName} ${guest.lastName}`.toLowerCase().includes(q) ||
        (guest.householdName ?? "").toLowerCase().includes(q),
      );
  }, [guests, filter, side, query]);

  // Group by household — a wedding list is families, not individuals.
  const grouped = React.useMemo(() => {
    const map = new Map<string, Guest[]>();
    for (const guest of filtered) {
      const key = guest.householdName ?? "No household";
      const list = map.get(key) ?? [];
      list.push(guest);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const active = guests.find((g) => g.id === openGuest) ?? null;

  async function setCell(guestId: string, eventId: string, status: string) {
    if (!canEdit) return;
    const cellKey = `${guestId}:${eventId}`;
    setSavingCell(cellKey);
    setCellMenu(null);
    await impact.propose(
      { type: "guest.rsvp", guestId, eventId, status },
      // One person's RSVP rarely moves anything. When it does — crossing a
      // capacity line, tipping a catering threshold — the drawer opens.
      { silentWhenTrivial: true },
    );
    setSavingCell(null);
  }

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Who's coming</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] leading-tight text-ink">Guests</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              {stats.total} people across {stats.households} households
            </p>
          </div>
          <div className="relative">
            <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names or households…"
              className="h-8 w-64 pl-8 text-[12.5px]"
            />
          </div>
        </div>
      </header>

      {/* Overview */}
      <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-line py-5 sm:grid-cols-5">
        <Figure value={stats.invited} label="On the list" />
        <Figure value={stats.confirmed} label="Coming" tone="positive" />
        <Figure value={stats.pending} label="Awaiting a reply" tone="attention" />
        <Figure value={stats.declined} label="Not coming" />
        <Figure value={`${stats.needAccommodation} · ${stats.rooms} rooms`} label="Need a bed" />
      </div>

      <SegmentBar
        className="mb-6"
        segments={[
          { value: stats.confirmed, tone: "olive", label: "Coming" },
          { value: stats.pending, tone: "amber", label: "Awaiting" },
          { value: stats.declined, tone: "slate", label: "Not coming" },
          { value: stats.notContacted, tone: "sky", label: "Not invited yet" },
        ]}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {[
          { key: "all", label: "Everyone" },
          { key: "confirmed", label: "Coming" },
          { key: "pending", label: "Awaiting" },
          { key: "declined", label: "Not coming" },
          { key: "not-contacted", label: "Not invited yet" },
          { key: "accommodation", label: "Need a room" },
          { key: "vip", label: "VIP" },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors",
              filter === f.key
                ? "border-saffron/30 bg-saffron-soft text-saffron"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
        <Select
          value={side}
          onChange={(e) => setSide(e.target.value)}
          className="h-7 w-auto text-[12.5px]"
        >
          <option value="">Both sides</option>
          <option value="BRIDE">Bride's side</option>
          <option value="GROOM">Groom's side</option>
        </Select>
        <span className="tabular ml-auto text-[12px] text-ink-muted">
          {filtered.length} shown
        </span>
      </div>

      {/* RSVP grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Nobody matches"
          description="Try a different filter, or clear the search."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-canvas py-2 pr-3 text-left text-[11.5px] font-medium text-ink-muted">
                  Guest
                </th>
                {events.map((event) => (
                  <th key={event.id} className="px-2 py-2 text-center">
                    <span className={cn("block text-[11.5px] font-medium", toneClasses(event.tone).text)}>
                      {event.name}
                    </span>
                    <span className="tabular block text-[10.5px] font-normal text-ink-faint">
                      {event.counts.confirmed}/{event.counts.invited}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 text-right text-[11.5px] font-medium text-ink-muted">
                  Needs
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([householdName, householdGuests]) => (
                <React.Fragment key={householdName}>
                  <tr>
                    <td
                      colSpan={events.length + 2}
                      className="sticky left-0 bg-canvas pb-1 pt-4 text-[12px] font-medium text-ink-soft"
                    >
                      {householdName}
                      <span className="tabular ml-2 font-normal text-ink-faint">
                        {householdGuests.length}
                      </span>
                    </td>
                  </tr>
                  {householdGuests.map((guest) => (
                    <tr key={guest.id} className="group border-b border-line-soft">
                      <td className="sticky left-0 z-10 bg-canvas py-1.5 pr-3 group-hover:bg-surface-sunken">
                        <button
                          type="button"
                          onClick={() => setOpenGuest(guest.id)}
                          className="flex items-center gap-2 text-left"
                        >
                          <Avatar
                            name={`${guest.firstName} ${guest.lastName}`}
                            tone={guest.side === "BRIDE" ? "rose" : "indigo"}
                            size="xs"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] text-ink transition-colors group-hover:text-saffron">
                              {guest.firstName} {guest.lastName}
                              {guest.isVIP ? <span className="ml-1 text-saffron">★</span> : null}
                            </span>
                            <span className="block truncate text-[10.5px] text-ink-muted">
                              {guest.relationship ?? guest.city ?? ""}
                              {guest.isChild ? " · Child" : ""}
                            </span>
                          </span>
                        </button>
                      </td>

                      {events.map((event) => {
                        const status = guest.rsvp[event.id] ?? "NOT_INVITED";
                        const glyph = RSVP_GLYPH[status];
                        const cellKey = `${guest.id}:${event.id}`;
                        return (
                          <td key={event.id} className="px-2 py-1.5 text-center">
                            <div className="relative">
                              <Tooltip content={`${event.name}: ${glyph.label}`}>
                                <button
                                  type="button"
                                  disabled={!canEdit || savingCell === cellKey}
                                  onClick={() =>
                                    setCellMenu((c) =>
                                      c?.guestId === guest.id && c?.eventId === event.id
                                        ? null
                                        : { guestId: guest.id, eventId: event.id },
                                    )
                                  }
                                  className={cn(
                                    "mx-auto flex h-6 w-6 items-center justify-center rounded-md transition-all",
                                    canEdit && "hover:bg-surface-sunken active:scale-90",
                                    savingCell === cellKey && "opacity-40",
                                  )}
                                  aria-label={`${guest.firstName} — ${event.name}: ${glyph.label}`}
                                >
                                  <RsvpDot status={status} />
                                </button>
                              </Tooltip>

                              {cellMenu?.guestId === guest.id &&
                              cellMenu?.eventId === event.id ? (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={() => setCellMenu(null)}
                                  />
                                  <div className="absolute left-1/2 top-7 z-40 w-36 -translate-x-1/2 rounded-lg border border-line bg-surface p-1 shadow-float">
                                    {RSVP_CHOICES.map((choice) => (
                                      <button
                                        key={choice.value}
                                        type="button"
                                        onClick={() => setCell(guest.id, event.id, choice.value)}
                                        className={cn(
                                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors",
                                          status === choice.value
                                            ? "bg-surface-sunken text-ink"
                                            : "text-ink-soft hover:bg-surface-sunken",
                                        )}
                                      >
                                        <RsvpDot status={choice.value} />
                                        {choice.label}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}

                      <td className="px-2 py-1.5 text-right">
                        <span className="inline-flex gap-1">
                          {guest.needsAccommodation ? (
                            <Tooltip content="Needs a room"><span className="text-[11px] text-ink-muted">🛏</span></Tooltip>
                          ) : null}
                          {guest.needsTransport ? (
                            <Tooltip content="Needs transport"><span className="text-[11px] text-ink-muted">🚐</span></Tooltip>
                          ) : null}
                          {guest.dietary === "JAIN" || guest.dietary === "VEGAN" ? (
                            <Tooltip content={DIET_LABEL[guest.dietary]}>
                              <span className="text-[10px] font-medium text-olive">
                                {guest.dietary === "JAIN" ? "J" : "V"}
                              </span>
                            </Tooltip>
                          ) : null}
                          {guest.allergies ? (
                            <Tooltip content={`Allergy: ${guest.allergies}`}>
                              <span className="text-[11px] text-critical">!</span>
                            </Tooltip>
                          ) : null}
                          {guest.accessibilityNeeds ? (
                            <Tooltip content={guest.accessibilityNeeds}>
                              <span className="text-[11px] text-info">♿</span>
                            </Tooltip>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GuestSheet
        guest={active}
        events={events}
        canEdit={canEdit}
        onSetRsvp={setCell}
        household={households.find((h) => h.id === active?.householdId) ?? null}
        rsvpEnabled={rsvpEnabled}
        onClose={() => setOpenGuest(null)}
        onChanged={() => router.refresh()}
      />

      <ImpactDrawer {...impact.drawer} />
    </div>
  );
}

/** RSVP states, as quiet dots rather than a wall of punctuation. */
const RSVP_CHOICES = [
  { value: "CONFIRMED", label: "Coming" },
  { value: "DECLINED", label: "Not coming" },
  { value: "TENTATIVE", label: "Maybe" },
  { value: "PENDING", label: "Awaiting reply" },
  { value: "NOT_INVITED", label: "Not invited" },
];

function RsvpDot({ status }: { status: string }) {
  if (status === "NOT_INVITED") {
    return <span className="block h-px w-2.5 rounded bg-line-strong" aria-hidden />;
  }
  if (status === "CONFIRMED") {
    return <span className="block h-2.5 w-2.5 rounded-full bg-positive" aria-hidden />;
  }
  if (status === "DECLINED") {
    return (
      <span
        className="block h-2.5 w-2.5 rounded-full border border-line-strong bg-transparent"
        aria-hidden
      />
    );
  }
  if (status === "TENTATIVE") {
    return (
      <span
        className="block h-2.5 w-2.5 rounded-full border-[1.5px] border-info bg-info/25"
        aria-hidden
      />
    );
  }
  // Awaiting a reply — outlined amber.
  return (
    <span
      className="block h-2.5 w-2.5 rounded-full border-[1.5px] border-attention bg-transparent"
      aria-hidden
    />
  );
}

function Figure({
  value, label, tone,
}: {
  value: React.ReactNode; label: string; tone?: "positive" | "attention";
}) {
  return (
    <div>
      <div
        className={cn(
          "tabular font-display text-[24px] leading-none",
          tone === "positive" ? "text-positive" : tone === "attention" ? "text-attention" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] text-ink-muted">{label}</div>
    </div>
  );
}

function GuestSheet({
  guest, events, canEdit, household, rsvpEnabled, onClose, onChanged, onSetRsvp,
}: {
  guest: Guest | null;
  events: { id: string; name: string; tone: string }[];
  canEdit: boolean;
  onSetRsvp(guestId: string, eventId: string, status: string): void;
  household: { id: string; name: string; rsvpToken: string } | null;
  rsvpEnabled: boolean;
  onClose(): void;
  onChanged(): void;
}) {
  if (!guest) return null;

  async function patch(data: Record<string, unknown>) {
    if (!guest) return;
    await updateGuest({ id: guest.id, ...data });
    onChanged();
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${guest.firstName} ${guest.lastName}`}
      description={[guest.relationship, guest.householdName, guest.city].filter(Boolean).join(" · ")}
      width="md"
    >
      <section className="mb-5">
        <h4 className="eyebrow mb-2">Coming to</h4>
        <div className="space-y-1">
          {events.map((event) => {
            const status = guest.rsvp[event.id] ?? "NOT_INVITED";
            return (
              <div key={event.id} className="flex items-center gap-3">
                <span className={cn("h-1.5 w-1.5 rounded-full", toneClasses(event.tone).dot)} />
                <span className="min-w-0 flex-1 text-[13.5px] text-ink">{event.name}</span>
                <Select
                  value={status}
                  disabled={!canEdit}
                  className="h-7 w-auto min-w-[130px] text-[12.5px]"
                  onChange={(e) => onSetRsvp(guest.id, event.id, e.target.value)}
                >
                  <option value="NOT_INVITED">Not invited</option>
                  <option value="PENDING">Awaiting a reply</option>
                  <option value="CONFIRMED">Coming</option>
                  <option value="TENTATIVE">Maybe</option>
                  <option value="DECLINED">Not coming</option>
                </Select>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-5 space-y-2.5 border-y border-line py-4">
        <Checkbox
          checked={guest.needsAccommodation}
          disabled={!canEdit}
          onCheckedChange={(v) => patch({ needsAccommodation: v })}
          label="Needs a hotel room"
          description="Feeds the room forecast and the accommodation alerts."
        />
        <Checkbox
          checked={guest.needsTransport}
          disabled={!canEdit}
          onCheckedChange={(v) => patch({ needsTransport: v })}
          label="Needs transport"
        />
        <Checkbox
          checked={guest.isVIP}
          disabled={!canEdit}
          onCheckedChange={(v) => patch({ isVIP: v })}
          label="VIP"
        />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Dietary" htmlFor="g-diet">
          <Select
            id="g-diet"
            value={guest.dietary}
            disabled={!canEdit}
            onChange={(e) => patch({ dietary: e.target.value })}
          >
            {Object.entries(DIET_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Phone" htmlFor="g-phone">
          <Input
            id="g-phone"
            defaultValue={guest.phone ?? ""}
            disabled={!canEdit}
            onBlur={(e) => e.target.value !== (guest.phone ?? "") && patch({ phone: e.target.value })}
          />
        </FormField>
        <FormField label="Email" className="sm:col-span-2" htmlFor="g-email">
          <Input
            id="g-email"
            type="email"
            defaultValue={guest.email ?? ""}
            disabled={!canEdit}
            onBlur={(e) => e.target.value !== (guest.email ?? "") && patch({ email: e.target.value })}
          />
        </FormField>
        <FormField label="Allergies" className="sm:col-span-2" htmlFor="g-allergies">
          <Input
            id="g-allergies"
            defaultValue={guest.allergies ?? ""}
            disabled={!canEdit}
            placeholder="Anything the caterer must know"
            onBlur={(e) => e.target.value !== (guest.allergies ?? "") && patch({ allergies: e.target.value })}
          />
        </FormField>
        <FormField label="Access needs" className="sm:col-span-2" htmlFor="g-access">
          <Input
            id="g-access"
            defaultValue={guest.accessibilityNeeds ?? ""}
            disabled={!canEdit}
            placeholder="Ground-floor room, step-free access…"
            onBlur={(e) =>
              e.target.value !== (guest.accessibilityNeeds ?? "") &&
              patch({ accessibilityNeeds: e.target.value })
            }
          />
        </FormField>
      </div>

      <div className="mt-4">
        <FormField label="Notes" htmlFor="g-notes">
          <Textarea
            id="g-notes"
            defaultValue={guest.notes ?? ""}
            disabled={!canEdit}
            onBlur={(e) => e.target.value !== (guest.notes ?? "") && patch({ notes: e.target.value })}
          />
        </FormField>
      </div>

      {guest.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {guest.tags.map((tag) => (
            <Badge key={tag} size="xs">{tag.replace(":", " ")}</Badge>
          ))}
        </div>
      ) : null}

      {rsvpEnabled && household ? (
        <div className="mt-5 rounded-lg border border-line bg-surface-soft px-3 py-2.5">
          <p className="text-[12px] font-medium text-ink">Household RSVP link</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">
            Share this with {household.name} so they can answer for everyone.
          </p>
          <code className="mt-1.5 block truncate rounded bg-surface px-2 py-1 text-[11px] text-ink-soft">
            /rsvp/{household.rsvpToken.slice(0, 16)}…
          </code>
        </div>
      ) : null}
    </Sheet>
  );
}
