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
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn, toneClasses } from "@/lib/cn";
import { Avatar, Badge, Button, EmptyState, SegmentBar } from "@/components/ui/primitives";
import { Sheet, Tooltip } from "@/components/ui/overlays";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/form";
import { CheckIcon, ChevronRightIcon, SearchIcon } from "@/components/ui/icons";
import {
  archiveGuest,
  setGuestAttendance,
  setGuestStdResponse,
  setGuestTier,
  updateGuest,
} from "@/server/actions/guests";
import { ImpactDrawer, useImpactFlow } from "@/components/wedding/impact-drawer";
import { ExportMenu } from "@/components/wedding/export-menu";
import { AddGuestButton } from "./guest-composer";
import {
  Invitations,
  type InvitationRow,
  type InvitationStats,
  type Tier,
  type TierStat,
} from "./invitations";

interface Guest {
  id: string; firstName: string; lastName: string; side: string;
  relationship: string | null; householdId: string | null; householdName: string | null;
  city: string | null; country: string; phone: string | null; email: string | null;
  isVIP: boolean; isChild: boolean; isSenior: boolean;
  dietary: string; allergies: string | null; accessibilityNeeds: string | null;
  needsAccommodation: boolean; needsTransport: boolean;
  notes: string | null; tags: string[];
  tier: string;
  /** Their answer to the save-the-date, which is the only reply that exists yet. */
  stdResponse: "YES" | "NO" | null;
  rsvp: Record<string, string>;
}

const RSVP_CYCLE = ["NOT_INVITED", "PENDING", "CONFIRMED", "TENTATIVE", "DECLINED"] as const;

/**
 * Whose list somebody is on.
 *
 * Stored as BRIDE / GROOM, shown as the surnames, because that's how the two
 * families actually talk about it — "is she on the Chowdhry list or the Mehan
 * one" — and because with 267 names the side is the first thing you want to
 * know when a name is unfamiliar.
 */
function SideTag({ side }: { side: string }) {
  if (side === "BOTH") {
    return (
      <span className="shrink-0 rounded-md bg-surface-sunken px-1.5 py-px text-[10px] font-medium text-ink-muted">
        Both
      </span>
    );
  }
  const bride = side === "BRIDE";
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-px text-[10px] font-medium",
        bride ? "bg-rose-soft text-rose" : "bg-indigo-soft text-indigo",
      )}
      title={bride ? "On the Chowdhry (bride's) list" : "On the Mehan (groom's) list"}
    >
      {bride ? "Chowdhry" : "Mehan"}
    </span>
  );
}

/**
 * A guest's single answer, read off their per-event invitations.
 *
 * They should all agree when the wedding is set to one answer per guest, but
 * historic data and the odd hand-edit mean they might not — so the firmest
 * answer present wins rather than picking the first one and hiding the rest.
 */
function overallStatus(guest: Guest): string {
  const values = Object.values(guest.rsvp);
  if (values.length === 0) return "NOT_INVITED";
  for (const status of ["CONFIRMED", "TENTATIVE", "DECLINED", "PENDING"]) {
    if (values.includes(status)) return status;
  }
  return "NOT_INVITED";
}

/**
 * The save-the-date has two answers and a silence, and nothing else.
 *
 * Plainly yes and no. The column already says what was asked, so dressing the
 * answers up as "hoping to come" only made you read twice to find out whether
 * somebody had said yes.
 */
const STD_CHOICES: { value: string; label: string }[] = [
  { value: "", label: "Not yet" },
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];

const ATTENDANCE_CHOICES: { value: string; label: string }[] = [
  { value: "CONFIRMED", label: "Coming" },
  { value: "TENTATIVE", label: "Maybe" },
  { value: "DECLINED", label: "Not coming" },
  { value: "PENDING", label: "Awaiting a reply" },
  { value: "NOT_INVITED", label: "Not invited" },
];

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
  guests, households, events, statsByTier, canEdit, currency, rsvpEnabled, singleRsvp,
  invitationStage, saveTheDate,
  invitations, invitationStats, invitationTiers,
  initialFilter, initialEvent, initialGuest, initialSide,
}: {
  guests: Guest[];
  households: { id: string; name: string; invitationStatus: string; rsvpToken: string; side: string }[];
  events: { id: string; name: string; tone: string; counts: { invited: number; confirmed: number } }[];
  /** Every figure on this page belongs to one wave, so they arrive per wave. */
  statsByTier: Record<Tier, Record<string, number>>;
  canEdit: boolean;
  currency: string;
  rsvpEnabled: boolean;
  singleRsvp: boolean;
  /** Which mailing is out — it decides which answer this page is about. */
  invitationStage: "SAVE_THE_DATE" | "INVITATION";
  saveTheDate: { asked: number; yes: number; no: number; awaiting: number };
  invitations: InvitationRow[];
  invitationStats: InvitationStats;
  invitationTiers: TierStat[];
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
  const [view, setView] = React.useState<"list" | "held" | "invitations">("list");
  // Which held-back wave the second tab is showing. B is the one anybody
  // actually works from; C is the reserve, and would otherwise have nowhere to
  // live now that the main list is tier A alone.
  const [heldTier, setHeldTier] = React.useState<Exclude<Tier, "A">>("B");

  // The list is read one wave at a time: tier A is the wedding as it stands,
  // and the counts above it have to mean the same thing.
  const activeTier: Tier = view === "held" ? heldTier : "A";
  const stats = statsByTier[activeTier];
  // Only tier A has been asked anything yet, so only tier A has answers.
  const showSaveTheDate = invitationStage === "SAVE_THE_DATE" && activeTier === "A";

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
        if (showSaveTheDate) {
          switch (filter) {
            case "confirmed": return guest.stdResponse === "YES";
            case "pending": return guest.stdResponse === null;
            case "declined": return guest.stdResponse === "NO";
            case "accommodation": return guest.needsAccommodation;
            case "vip": return guest.isVIP;
            case "not-contacted": return answered.every((s) => s === "NOT_INVITED");
            default: return true;
          }
        }
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
      .filter((guest) => guest.tier === activeTier)
      .filter((guest) => !side || guest.side === side)
      .filter((guest) =>
        !q ||
        `${guest.firstName} ${guest.lastName}`.toLowerCase().includes(q) ||
        (guest.householdName ?? "").toLowerCase().includes(q),
      );
  }, [guests, filter, side, query, activeTier, showSaveTheDate]);

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

  async function setTier(guestId: string, tier: string) {
    if (!canEdit) return;
    setSavingCell(`${guestId}:tier`);
    await setGuestTier(guestId, tier as "A");
    setSavingCell(null);
    router.refresh();
  }

  async function setStdResponse(guestId: string, response: string) {
    if (!canEdit) return;
    setSavingCell(guestId);
    await setGuestStdResponse(guestId, (response || null) as "YES" | null);
    setSavingCell(null);
    router.refresh();
  }

  async function setAttendance(guestId: string, status: string) {
    if (!canEdit) return;
    setSavingCell(guestId);
    setCellMenu(null);
    await setGuestAttendance(guestId, status as "CONFIRMED");
    setSavingCell(null);
    router.refresh();
  }

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
    <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-8 sm:py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Who's coming</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-script text-[30px] sm:text-[54px] text-ink">Guests</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              {stats.total} people across {stats.households} households
              {activeTier === "A" ? (
                <span className="text-ink-faint"> · the invited list</span>
              ) : (
                <span className="text-ink-faint"> · held back, tier {activeTier}</span>
              )}
            </p>
          </div>
          {/* Three controls don't fit one line on a phone without squeezing the
              search box to nothing, so it takes the full width and the buttons
              sit under it. */}
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <div className="relative min-w-0 basis-full sm:basis-auto">
              <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search names or households…"
                className="h-9 w-full pl-8 text-[12.5px] sm:w-64"
              />
            </div>
            <ExportMenu kind="guests" className="flex-1 justify-center sm:flex-none" />
            {canEdit ? (
              <AddGuestButton
                households={households}
                className="flex-1 justify-center sm:flex-none"
              />
            ) : null}
          </div>
        </div>
      </header>

      {/* Two views of the same list: who's coming, and who has been asked. */}
      <div className="mb-6 flex items-center gap-1 border-b border-line">
        {([
          { key: "list", label: "Guest list", count: statsByTier.A.total },
          { key: "held", label: "Tier B", count: statsByTier.B.total },
          { key: "invitations", label: "Invitations & RSVPs", count: null },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            className={cn(
              "relative px-3 py-2 text-[13px] transition-colors",
              view === tab.key ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== null ? (
              <span className="tabular ml-1.5 text-[11.5px] text-ink-faint">{tab.count}</span>
            ) : null}
            {view === tab.key ? (
              <motion.span
                layoutId="guests-view-underline"
                className="absolute inset-x-0 -bottom-px h-px bg-saffron"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </button>
        ))}
      </div>

      {/* Crossfade rather than swap: the two views are the same list seen two
          ways, and snapping between them reads as a page change. */}
      <AnimatePresence mode="wait" initial={false}>
      {view === "invitations" ? (
        <motion.div
          key="invitations"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <Invitations
            rows={invitations}
            stats={invitationStats}
            tiers={invitationTiers}
            stage={invitationStage}
            canEdit={canEdit}
          />
        </motion.div>
      ) : (
      <motion.div
        key={`list-${activeTier}`}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -4 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
      {view === "held" ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-soft px-3.5 py-3">
          <p className="text-[12.5px] leading-snug text-ink-muted">
            {heldTier === "B"
              ? "Held back — not on the save-the-date send. Move somebody to tier A and they join the invited list."
              : "The reserve — considered, and not invited."}
          </p>
          <span className="inline-flex items-center gap-0.5 rounded-lg border border-line p-0.5">
            {(["B", "C"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setHeldTier(option)}
                aria-pressed={heldTier === option}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] transition-colors",
                  heldTier === option
                    ? "bg-ink text-canvas"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                )}
              >
                Tier {option}
                <span className="tabular ml-1.5 opacity-70">{statsByTier[option].total}</span>
              </button>
            ))}
          </span>
        </div>
      ) : null}

      {/* Overview.
          A year out, the only answer anybody has given is to the save-the-date;
          the per-event RSVPs cannot move until the invitation goes out. Showing
          those instead meant this row read 0 coming, 231 awaiting, no matter
          how many people had replied. */}
      <div className="stat-row mb-6 border-y border-line py-5" style={{ ["--stat-cols" as string]: 5 }}>
        {showSaveTheDate ? (
          <>
            <Figure value={saveTheDate.asked} label="On the list" />
            <Figure value={saveTheDate.yes} label="Said yes" tone="positive" />
            <Figure value={saveTheDate.awaiting} label="Not yet answered" tone="attention" />
            <Figure value={saveTheDate.no} label="Said no" />
          </>
        ) : (
          <>
            <Figure value={stats.invited} label="On the list" />
            <Figure value={stats.confirmed} label="Coming" tone="positive" />
            <Figure value={stats.pending} label="Awaiting a reply" tone="attention" />
            <Figure value={stats.declined} label="Not coming" />
          </>
        )}
        <Figure value={`${stats.needAccommodation} · ${stats.rooms} rooms`} label="Need a bed" />
      </div>

      <SegmentBar
        className="mb-6"
        segments={
          showSaveTheDate
            ? [
                { value: saveTheDate.yes, tone: "olive", label: "Said yes" },
                { value: saveTheDate.awaiting, tone: "amber", label: "Not yet" },
                { value: saveTheDate.no, tone: "slate", label: "Said no" },
              ]
            : [
                { value: stats.confirmed, tone: "olive", label: "Coming" },
                { value: stats.pending, tone: "amber", label: "Awaiting" },
                { value: stats.declined, tone: "slate", label: "Not coming" },
                { value: stats.notContacted, tone: "sky", label: "Not invited yet" },
              ]
        }
      />

      {/* Filters */}
      <div className="pill-row mb-4 items-center">
        {[
          { key: "all", label: "Everyone" },
          { key: "confirmed", label: showSaveTheDate ? "Said yes" : "Coming" },
          { key: "pending", label: showSaveTheDate ? "Not yet" : "Awaiting" },
          { key: "declined", label: showSaveTheDate ? "Said no" : "Not coming" },
          ...(showSaveTheDate ? [] : [{ key: "not-contacted", label: "Not invited yet" }]),
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
                : "border-line-strong text-ink-soft hover:border-ink-faint hover:text-ink",
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
        <>
        {/* Phones get cards. The grid is five event columns wide and a sticky
            name column, which on a 375px screen leaves each guest legible only
            by scrolling sideways one function at a time. */}
        <div className="sm:hidden">
          {grouped.map(([householdName, householdGuests]) => (
            <div key={householdName} className="mb-4">
              <p className="mb-1.5 text-[12px] font-medium text-ink-soft">
                {householdName}
                <span className="tabular ml-1.5 text-ink-faint">
                  {householdGuests.length}
                </span>
              </p>
              <div className="overflow-hidden rounded-xl border border-line">
                {householdGuests.map((guest, index) => (
                  <div
                    key={guest.id}
                    className={cn(
                      "px-3 py-2.5",
                      index > 0 && "border-t border-line/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenGuest(guest.id)}
                      className="flex w-full items-center gap-2 text-left active:opacity-70"
                    >
                      <Avatar
                        name={`${guest.firstName} ${guest.lastName}`}
                        tone={guest.isVIP ? "saffron" : "slate"}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink underline decoration-line decoration-dotted underline-offset-[3px]">
                          {guest.firstName} {guest.lastName}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <SideTag side={guest.side} />
                          {guest.relationship ? (
                            <span className="truncate text-[11.5px] text-ink-faint">
                              {guest.relationship}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {guest.needsAccommodation ? (
                          <span className="text-[11px] text-ink-muted">🛏</span>
                        ) : null}
                        {guest.needsTransport ? (
                          <span className="text-[11px] text-ink-muted">🚐</span>
                        ) : null}
                        <ChevronRightIcon size={13} className="ml-0.5 text-ink-faint" />
                      </span>
                    </button>

                    {singleRsvp ? (
                      <div className="mt-2">
                        <Select
                          value={
                            showSaveTheDate ? guest.stdResponse ?? "" : overallStatus(guest)
                          }
                          disabled={!canEdit || savingCell === guest.id}
                          onChange={(e) =>
                            showSaveTheDate
                              ? setStdResponse(guest.id, e.target.value)
                              : setAttendance(guest.id, e.target.value)
                          }
                          className="h-9 w-full text-[12.5px]"
                        >
                          {(showSaveTheDate ? STD_CHOICES : ATTENDANCE_CHOICES).map(
                            (choice) => (
                              <option key={choice.value} value={choice.value}>
                                {choice.label}
                              </option>
                            ),
                          )}
                        </Select>
                      </div>
                    ) : (
                    <div className="mt-2 flex gap-1.5">
                      {events.map((event) => {
                        const status = guest.rsvp[event.id] ?? "NOT_INVITED";
                        const cellKey = `${guest.id}:${event.id}`;
                        return (
                          <button
                            key={event.id}
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
                              "flex min-h-[34px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border transition-colors",
                              cellMenu?.guestId === guest.id && cellMenu?.eventId === event.id
                                ? "border-saffron/40 bg-saffron-soft"
                                : "border-line",
                              savingCell === cellKey && "opacity-40",
                            )}
                          >
                            <span className="text-[9px] uppercase tracking-[0.06em] text-ink-faint">
                              {event.name.slice(0, 4)}
                            </span>
                            <RsvpDot status={status} />
                          </button>
                        );
                      })}
                    </div>
                    )}

                    {!singleRsvp && cellMenu?.guestId === guest.id ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {RSVP_CHOICES.map((choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            onClick={() =>
                              setCell(guest.id, cellMenu.eventId, choice.value)
                            }
                            className="flex min-h-[30px] items-center gap-1.5 rounded-lg border border-line px-2 text-[12px] text-ink-soft"
                          >
                            <RsvpDot status={choice.value} />
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {/* The name column absorbs the spare width. Without this the
                    table handed it all to whatever came last, which left the
                    answer sitting in the middle of an empty acre and the needs
                    column out at the window. */}
                <th className="sticky left-0 z-10 w-full bg-canvas py-2 pr-3 text-left text-[11.5px] font-medium text-ink-muted">
                  Guest
                </th>
                {singleRsvp ? (
                  // Tier lives in the guest's own panel now. Every row on this
                  // list is already the wave named at the top of the page, so a
                  // three-way toggle against 231 identical answers was noise.
                  <th className="w-px whitespace-nowrap px-2 py-2 text-left text-[11.5px] font-medium text-ink-muted">
                    {showSaveTheDate ? "Save-the-date" : "Coming?"}
                  </th>
                ) : (
                  events.map((event) => (
                    <th key={event.id} className="px-2 py-2 text-center">
                      <span className={cn("block text-[11.5px] font-medium", toneClasses(event.tone).text)}>
                        {event.name}
                      </span>
                      <span className="tabular block text-[10.5px] font-normal text-ink-faint">
                        {event.counts.confirmed}/{event.counts.invited}
                      </span>
                    </th>
                  ))
                )}
                <th className="w-px whitespace-nowrap px-2 py-2 text-right text-[11.5px] font-medium text-ink-muted">
                  Needs
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([householdName, householdGuests]) => (
                <React.Fragment key={householdName}>
                  <tr>
                    <td
                      colSpan={(singleRsvp ? 1 : events.length) + 2}
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
                            <span className="flex items-center gap-1 truncate text-[13px] text-ink transition-colors group-hover:text-saffron">
                              <span className="truncate underline decoration-line decoration-dotted underline-offset-[3px] group-hover:decoration-saffron">
                                {guest.firstName} {guest.lastName}
                              </span>
                              {guest.isVIP ? <span className="text-saffron">★</span> : null}
                              <SideTag side={guest.side} />
                              <ChevronRightIcon
                                size={12}
                                className="shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
                              />
                            </span>
                            <span className="block truncate text-[10.5px] text-ink-muted">
                              {guest.relationship ?? guest.city ?? ""}
                              {guest.isChild ? " · Child" : ""}
                            </span>
                          </span>
                        </button>
                      </td>

                      {singleRsvp ? (
                        <td className="w-px whitespace-nowrap px-2 py-1.5">
                          <Select
                            value={
                              showSaveTheDate
                                ? guest.stdResponse ?? ""
                                : overallStatus(guest)
                            }
                            disabled={!canEdit || savingCell === guest.id}
                            onChange={(e) =>
                              showSaveTheDate
                                ? setStdResponse(guest.id, e.target.value)
                                : setAttendance(guest.id, e.target.value)
                            }
                            className={cn(
                              // Wide enough for "Awaiting a reply" to clear the
                              // chevron rather than run under it.
                              "h-7 w-auto min-w-[156px] text-[12.5px]",
                              savingCell === guest.id && "opacity-40",
                            )}
                          >
                            {(showSaveTheDate ? STD_CHOICES : ATTENDANCE_CHOICES).map(
                              (choice) => (
                                <option key={choice.value} value={choice.value}>
                                  {choice.label}
                                </option>
                              ),
                            )}
                          </Select>
                        </td>
                      ) : (
                      events.map((event) => {
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
                      })
                      )}

                      <td className="w-px whitespace-nowrap px-2 py-1.5 text-right">
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
        </>
      )}
      </motion.div>
      )}
      </AnimatePresence>

      <GuestSheet
        guest={active}
        events={events}
        canEdit={canEdit}
        onSetRsvp={setCell}
        onSetAttendance={setAttendance}
        onSetStdResponse={setStdResponse}
        showSaveTheDate={showSaveTheDate}
        onSetTier={setTier}
        savingTier={savingCell === `${active?.id}:tier`}
        household={households.find((h) => h.id === active?.householdId) ?? null}
        rsvpEnabled={rsvpEnabled}
        singleRsvp={singleRsvp}
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
  guest, events, canEdit, household, rsvpEnabled, singleRsvp, onClose, onChanged, onSetRsvp,
  onSetAttendance, onSetStdResponse, showSaveTheDate, onSetTier, savingTier,
}: {
  guest: Guest | null;
  events: { id: string; name: string; tone: string }[];
  canEdit: boolean;
  onSetRsvp(guestId: string, eventId: string, status: string): void;
  onSetAttendance(guestId: string, status: string): void;
  onSetStdResponse(guestId: string, response: string): void;
  /** A year out, the answer on the panel is the save-the-date's. */
  showSaveTheDate: boolean;
  onSetTier(guestId: string, tier: string): void;
  savingTier: boolean;
  household: { id: string; name: string; rsvpToken: string } | null;
  rsvpEnabled: boolean;
  singleRsvp: boolean;
  onClose(): void;
  onChanged(): void;
}) {
  // Declared before the early return — hooks can't sit behind a condition.
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  // Edits save as you leave a field. Without saying so, and without saying when
  // it's done, that reads as nothing having happened at all.
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!guest) setConfirmingRemove(false);
  }, [guest]);

  if (!guest) return null;

  async function patch(data: Record<string, unknown>) {
    if (!guest) return;
    setSaveState("saving");
    setSaveError(null);

    const result = await updateGuest({ id: guest.id, ...data });
    if (!result.ok) {
      setSaveState("error");
      setSaveError(result.error);
      return;
    }

    setSaveState("saved");
    onChanged();
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${guest.firstName} ${guest.lastName}`}
      description={[guest.relationship, guest.householdName, guest.city].filter(Boolean).join(" · ")}
      width="md"
      footer={
        canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SaveStatus state={saveState} error={saveError} />
            {confirmingRemove ? (
              <>
                <span className="text-[12.5px] text-ink-muted">
                  Take {guest.firstName} off the list?
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingRemove(false)}>
                    Keep
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={removing}
                    onClick={async () => {
                      setRemoving(true);
                      const result = await archiveGuest(guest.id);
                      setRemoving(false);
                      if (result.ok) {
                        onClose();
                        onChanged();
                      }
                    }}
                  >
                    {removing ? "Removing…" : "Remove"}
                  </Button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="text-[12.5px] text-ink-faint transition-colors hover:text-critical"
              >
                Remove from the guest list
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      <section className="mb-5">
        <h4 className="eyebrow mb-2">
          {showSaveTheDate ? "Save-the-date" : singleRsvp ? "Coming?" : "Coming to"}
        </h4>
        {singleRsvp ? (
          <div>
            <Select
              value={showSaveTheDate ? guest.stdResponse ?? "" : overallStatus(guest)}
              disabled={!canEdit}
              onChange={(e) =>
                showSaveTheDate
                  ? onSetStdResponse(guest.id, e.target.value)
                  : onSetAttendance(guest.id, e.target.value)
              }
              className="h-8 w-full text-[13px]"
            >
              {(showSaveTheDate ? STD_CHOICES : ATTENDANCE_CHOICES).map((choice) => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </Select>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-faint">
              {showSaveTheDate
                ? "What they said to the save-the-date. The invitation proper asks again later."
                : "One answer for the whole week — everyone who comes is there for all of it."}
            </p>
          </div>
        ) : (
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
        )}
      </section>

      <section className="mb-5 border-t border-line pt-4">
        <h4 className="eyebrow mb-2">Which wave</h4>
        <div className="flex items-center gap-2">
          <TierCell
            tier={guest.tier}
            canEdit={canEdit}
            busy={savingTier}
            onChange={(next) => onSetTier(guest.id, next)}
          />
          <p className="text-[11.5px] leading-snug text-ink-muted">
            {guest.tier === "A"
              ? "On the invited list."
              : `Held back on tier ${guest.tier} — not on the save-the-date send.`}
          </p>
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

/**
 * Whether the sheet has saved.
 *
 * Fields commit when you leave them, which is right — nothing is ever lost by
 * closing the panel — but silent saving is indistinguishable from broken
 * saving. This says which it is, and stays put rather than flashing away, so
 * you can look up a second later and still see it.
 */
function SaveStatus({
  state,
  error,
}: {
  state: "idle" | "saving" | "saved" | "error";
  error: string | null;
}) {
  const reduce = useReducedMotion();

  if (state === "error") {
    return (
      <span role="alert" className="text-[12px] text-critical">
        {error ?? "That didn't save."}
      </span>
    );
  }

  if (state === "idle") {
    return (
      <span className="text-[11.5px] text-ink-faint">
        Changes save as you go
      </span>
    );
  }

  return (
    <motion.span
      key={state}
      initial={reduce ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex items-center gap-1.5 text-[12px]",
        state === "saved" ? "text-positive" : "text-ink-muted",
      )}
    >
      {state === "saved" ? <CheckIcon size={13} /> : null}
      {state === "saved" ? "Saved" : "Saving…"}
    </motion.span>
  );
}

/**
 * Which list somebody is on.
 *
 * Three buttons rather than a dropdown: there are only ever three answers, and
 * deciding tiers is done in a sweep down the list where a menu per row would be
 * two clicks instead of one.
 */
function TierCell({
  tier,
  canEdit,
  busy,
  onChange,
}: {
  tier: string;
  canEdit: boolean;
  busy: boolean;
  onChange(tier: string): void;
}) {
  if (!canEdit) {
    return (
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-medium",
          tier === "A" ? "bg-saffron-soft text-saffron" : "bg-surface-sunken text-ink-faint",
        )}
      >
        {tier}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line p-0.5",
        busy && "opacity-50",
      )}
    >
      {(["A", "B", "C"] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={busy}
          onClick={() => onChange(option)}
          aria-pressed={tier === option}
          title={
            option === "A"
              ? "First wave — invited from the outset"
              : option === "B"
                ? "Held back until tier A leaves room"
                : "Considered, not invited"
          }
          className={cn(
            "h-5 w-5 rounded-md text-[10.5px] font-medium transition-colors",
            tier === option
              ? "bg-ink text-canvas"
              : "text-ink-faint hover:bg-surface-sunken hover:text-ink-muted",
          )}
        >
          {option}
        </button>
      ))}
    </span>
  );
}
