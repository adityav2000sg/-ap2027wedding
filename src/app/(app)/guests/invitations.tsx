"use client";

/**
 * Save-the-dates, invitations and RSVPs.
 *
 * Two levels, because the job has two levels. A household is what gets invited
 * and what answers; a person is who you actually message. Expanding a row shows
 * the family, their numbers, and a tick each — so "the Anands are done" and
 * "everyone in the Anands has been messaged" stay distinguishable.
 *
 * Tiers run across the top: the first save-the-dates go to A, B is held back
 * until A's acceptances are known, C is the reserve.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { CANONICAL_SITE_ORIGIN } from "@/config/site";
import { cn } from "@/lib/cn";
import { Badge, Button, EmptyState, SegmentBar } from "@/components/ui/primitives";
import { Input } from "@/components/ui/form";
import { CheckIcon, ChevronRightIcon, SearchIcon } from "@/components/ui/icons";
import {
  setGuestContact,
  setGuestSend,
  setHouseholdReply,
  setHouseholdSend,
} from "@/server/actions/guests";

export type Tier = "A" | "B" | "C";

export interface InvitationPerson {
  guestId: string;
  rsvpToken: string | null;
  /** Their own wave — a household can span two. */
  tier: Tier;
  name: string;
  phone: string | null;
  email: string | null;
  saveTheDateSent: boolean;
  invitationSent: boolean;
  /** What they said to the save-the-date, if they've said anything. */
  stdResponse: "YES" | "NO" | null;
  /** The note they left with it, when they replied on their own link. */
  message: string | null;
}

export type StdReply = "YES" | "MIXED" | "NO" | "PARTIAL" | "AWAITING";

export interface InvitationRow {
  householdId: string;
  rsvpToken: string;
  name: string;
  side: string;
  tier: Tier;
  headcount: number;
  people: InvitationPerson[];
  peopleSaveTheDateSent: number;
  peopleInvitationSent: number;
  saveTheDateSent: boolean;
  invitationSent: boolean;
  reply: "AWAITING" | "YES" | "NO";
  /** The save-the-date answer, rolled up from the people in the household. */
  stdReply: StdReply;
  stdYes: number;
  stdNo: number;
  stdAwaiting: number;
  /** The note left with the household's reply. */
  message: string | null;
}

export interface InvitationStats {
  households: number;
  stdSent: number;
  rsvpSent: number;
  yes: number;
  no: number;
  awaiting: number;
  peopleYes: number;
  peopleNo: number;
  peopleAwaiting: number;
  peopleStdSent: number;
  peopleInviteSent: number;
  responseRate: number;
  stdYes: number;
  stdNo: number;
  stdAwaiting: number;
  stdHouseholdsReplied: number;
}

export interface TierStat {
  tier: Tier;
  households: number;
  people: number;
  stdSent: number;
  stdYes: number;
  stdNo: number;
  rsvpSent: number;
  yes: number;
  no: number;
  awaiting: number;
}

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "std-not-sent", label: "No save-the-date" },
  { key: "not-invited", label: "No invitation" },
  { key: "partial", label: "Partly messaged" },
  { key: "awaiting", label: "Awaiting reply" },
  { key: "yes", label: "All coming" },
  { key: "split", label: "Some coming" },
  { key: "no", label: "Nobody coming" },
] as const;

export function Invitations({
  rows,
  stats,
  tiers,
  stage,
  canEdit,
}: {
  rows: InvitationRow[];
  stats: InvitationStats;
  tiers: TierStat[];
  /** Which mailing is out. The two are answered in different columns. */
  stage: "SAVE_THE_DATE" | "INVITATION";
  canEdit: boolean;
}) {
  // A year out, "have they replied?" means the save-the-date. The household's
  // own YES/NO belongs to the invitation proper and stays untouched until it
  // goes out, so filtering and counting on it here showed every reply as
  // awaiting — which is exactly what a guest who had just answered saw.
  const savingTheDate = stage === "SAVE_THE_DATE";
  const router = useRouter();
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<string>("all");
  const [tierFilter, setTierFilter] = React.useState<Tier | "">("A");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows
      .filter((row) => !tierFilter || row.tier === tierFilter)
      .filter((row) => {
        switch (filter) {
          case "std-not-sent": return !row.saveTheDateSent;
          case "not-invited": return !row.invitationSent;
          case "partial":
            // Somebody in the house has been messaged and somebody hasn't —
            // the households most likely to be quietly forgotten.
            return (
              row.headcount > 1 &&
              row.peopleSaveTheDateSent > 0 &&
              row.peopleSaveTheDateSent < row.headcount
            );
          case "awaiting":
            return savingTheDate
              ? row.stdReply === "AWAITING" || row.stdReply === "PARTIAL"
              : row.reply === "AWAITING";
          case "yes":
            // Everybody who was asked said yes — not "somebody did".
            return savingTheDate ? row.stdReply === "YES" : row.reply === "YES";
          case "split":
            return savingTheDate ? row.stdReply === "MIXED" : false;
          case "no":
            return savingTheDate ? row.stdReply === "NO" : row.reply === "NO";
          default: return true;
        }
      })
      .filter(
        (row) =>
          !q ||
          row.name.toLowerCase().includes(q) ||
          row.people.some((p) => p.name.toLowerCase().includes(q)),
      );
  }, [rows, filter, tierFilter, query, savingTheDate]);

  const displayStats = React.useMemo<InvitationStats>(() => {
    if (!tierFilter) return stats;
    const scoped = rows.filter((row) => row.tier === tierFilter);
    const yes = scoped.filter((row) => row.reply === "YES");
    const no = scoped.filter((row) => row.reply === "NO");
    const awaiting = scoped.filter((row) => row.reply === "AWAITING");
    const rsvpSent = scoped.filter((row) => row.invitationSent).length;

    // Head counts follow the person's own wave. A household on tier A can hold
    // a cousin on tier B who is not part of this send, and counting them here
    // is what made this screen disagree with the guest list.
    const heads = (list: InvitationRow[]) =>
      list.reduce(
        (sum, row) => sum + row.people.filter((p) => p.tier === tierFilter).length,
        0,
      );

    return {
      households: scoped.length,
      stdSent: scoped.filter((row) => row.saveTheDateSent).length,
      rsvpSent,
      yes: yes.length,
      no: no.length,
      awaiting: awaiting.length,
      peopleYes: heads(yes),
      peopleNo: heads(no),
      peopleAwaiting: heads(awaiting),
      peopleStdSent: scoped.reduce(
        (sum, row) =>
          sum + row.people.filter((p) => p.tier === tierFilter && p.saveTheDateSent).length,
        0,
      ),
      peopleInviteSent: scoped.reduce(
        (sum, row) =>
          sum + row.people.filter((p) => p.tier === tierFilter && p.invitationSent).length,
        0,
      ),
      responseRate:
        rsvpSent === 0 ? 0 : Math.round(((yes.length + no.length) / rsvpSent) * 100),
      stdYes: scoped.reduce(
        (sum, row) =>
          sum +
          row.people.filter((p) => p.tier === tierFilter && p.stdResponse === "YES").length,
        0,
      ),
      stdNo: scoped.reduce(
        (sum, row) =>
          sum +
          row.people.filter((p) => p.tier === tierFilter && p.stdResponse === "NO").length,
        0,
      ),
      stdAwaiting: scoped.reduce(
        (sum, row) =>
          sum +
          row.people.filter(
            (p) => p.tier === tierFilter && p.stdResponse !== "YES" && p.stdResponse !== "NO",
          ).length,
        0,
      ),
      stdHouseholdsReplied: scoped.filter((row) => row.stdAwaiting === 0).length,
    };
  }, [rows, stats, tierFilter]);

  const activeTier = tierFilter ? tiers.find((t) => t.tier === tierFilter) ?? null : null;

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(key: string, work: () => Promise<unknown>) {
    if (!canEdit) return;
    setBusy(key);
    await work();
    setBusy(null);
    router.refresh();
  }

  return (
    <div>
      {/* Which wave this is.
          Three cards and a toggle on every row was a lot of furniture for a
          question with one answer: the save-the-date goes to tier A. It's a
          sentence now, with the other waves a quiet click away for the day
          they matter. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[13px] text-ink-soft">
          <span className="font-medium text-ink">
            {tierFilter ? `Tier ${tierFilter}` : "Every wave"}
          </span>
          {activeTier ? (
            <>
              {" — "}
              {activeTier.people} people in {activeTier.households} households ·{" "}
              {activeTier.stdSent}/{activeTier.households} save-the-dates sent
            </>
          ) : null}
        </p>

        {tiers.length > 1 ? (
          <div className="flex items-center gap-1">
            {tiers.map((tier) => (
              <button
                key={tier.tier}
                type="button"
                onClick={() => setTierFilter(tier.tier)}
                aria-pressed={tierFilter === tier.tier}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
                  tierFilter === tier.tier
                    ? "border-ink bg-ink text-canvas"
                    : "border-line-strong text-ink-soft hover:border-ink-faint hover:text-ink",
                )}
              >
                Tier {tier.tier}
                <span className="tabular ml-1.5 opacity-70">{tier.people}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Overview */}
      <div className="stat-row mb-6 border-y border-line py-5" style={{ ["--stat-cols" as string]: 5 }}>
        <Figure value={`${displayStats.stdSent}/${displayStats.households}`} label="Save-the-dates sent" />
        {savingTheDate ? (
          <>
            <Figure value={displayStats.stdYes} label="Said yes" tone="positive" />
            <Figure value={displayStats.stdNo} label="Said no" />
            <Figure value={displayStats.stdAwaiting} label="Not yet answered" tone="attention" />
            <Figure
              value={`${displayStats.stdHouseholdsReplied}/${displayStats.households}`}
              label="Households answered"
            />
          </>
        ) : (
          <>
            <Figure value={`${displayStats.rsvpSent}/${displayStats.households}`} label="Invitations sent" />
            <Figure value={displayStats.yes} label="Said yes" tone="positive" />
            <Figure value={displayStats.no} label="Said no" />
            <Figure value={`${displayStats.responseRate}%`} label="Replied" tone="attention" />
          </>
        )}
      </div>

      <SegmentBar
        className="mb-2"
        segments={
          savingTheDate
            ? [
                { value: displayStats.stdYes, tone: "olive", label: "Said yes" },
                { value: displayStats.stdNo, tone: "slate", label: "Said no" },
                { value: displayStats.stdAwaiting, tone: "amber", label: "Not yet" },
              ]
            : [
                { value: displayStats.yes, tone: "olive", label: "Yes" },
                { value: displayStats.no, tone: "slate", label: "No" },
                { value: displayStats.awaiting, tone: "amber", label: "Awaiting" },
              ]
        }
      />
      <p className="mb-6 text-[12px] text-ink-muted">
        {savingTheDate ? (
          <>
            {displayStats.stdYes} said yes · {displayStats.stdAwaiting} still to answer ·{" "}
            {displayStats.stdNo} said no
          </>
        ) : (
          <>
            {displayStats.peopleYes} confirmed · {displayStats.peopleAwaiting} still to
            answer · {displayStats.peopleNo} not coming
          </>
        )}
        <span className="mx-2 text-ink-faint">·</span>
        {displayStats.peopleStdSent} people personally messaged
      </p>

      {/* Filters */}
      <div className="pill-row mb-4 items-center">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "min-h-[32px] rounded-lg border px-2.5 text-[12.5px] transition-colors",
              filter === f.key
                ? "border-saffron/30 bg-saffron-soft text-saffron"
                : "border-line-strong text-ink-soft hover:border-ink-faint hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="relative w-full sm:ml-auto sm:w-56">
          <SearchIcon
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search households or people…"
            className="h-8 w-full pl-8 text-[12.5px]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No households match"
          description="Try a different filter, or clear the search."
        />
      ) : (
        <div className="border-t border-line">
          {filtered.map((row, index) => {
            const open = expanded.has(row.householdId);
            const personalLinks = row.people.filter((person) => person.rsvpToken).length;
            const hasGroupRecipients = row.people.some((person) => !person.rsvpToken);
            return (
              <motion.div
                key={row.householdId}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.26,
                  ease: [0.22, 1, 0.36, 1],
                  delay: reduce ? 0 : Math.min(index * 0.01, 0.2),
                }}
                className="border-b border-line/60"
              >
                {/* Household */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(row.householdId)}
                    aria-expanded={open}
                    className="flex min-h-[36px] min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <motion.span
                      animate={{ rotate: open ? 90 : 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="text-ink-faint"
                    >
                      <ChevronRightIcon size={14} />
                    </motion.span>
                    <span className="min-w-0">
                      <span className="text-[13.5px] text-ink">{row.name}</span>
                      <span className="tabular ml-2 text-[11.5px] text-ink-faint">
                        {row.headcount}
                      </span>
                    </span>
                    {row.peopleSaveTheDateSent > 0 &&
                    row.peopleSaveTheDateSent < row.headcount ? (
                      <Badge variant="attention" size="xs">
                        {row.peopleSaveTheDateSent}/{row.headcount} messaged
                      </Badge>
                    ) : null}
                  </button>

                  {/* A household can be both: partners who each answer for
                      themselves, and relatives who share the family link. Show
                      whichever of the two exists, rather than only the first. */}
                  <span className="flex shrink-0 items-center gap-1.5">
                    {hasGroupRecipients ? (
                      <CopyLink
                        token={row.rsvpToken}
                        name={row.name}
                        label={personalLinks > 0 ? "Group link" : "Copy link"}
                      />
                    ) : null}
                    {personalLinks > 0 ? (
                      <Badge variant="important" size="xs">
                        {personalLinks} personal {personalLinks === 1 ? "link" : "links"}
                      </Badge>
                    ) : null}
                  </span>

                  <div className="flex items-center gap-4">
                    <Labelled label="Save the date">
                      <SentToggle
                        sent={row.saveTheDateSent}
                        busy={busy === `${row.householdId}:saveTheDate`}
                        disabled={!canEdit}
                        onClick={() =>
                          run(`${row.householdId}:saveTheDate`, () =>
                            setHouseholdSend(
                              row.householdId,
                              "saveTheDate",
                              !row.saveTheDateSent,
                            ),
                          )
                        }
                      />
                    </Labelled>
                    <Labelled label="Invitation">
                      <SentToggle
                        sent={row.invitationSent}
                        busy={busy === `${row.householdId}:invitation`}
                        disabled={!canEdit}
                        onClick={() =>
                          run(`${row.householdId}:invitation`, () =>
                            setHouseholdSend(
                              row.householdId,
                              "invitation",
                              !row.invitationSent,
                            ),
                          )
                        }
                      />
                    </Labelled>
                    {savingTheDate ? (
                      <Labelled label="Replied">
                        <StdReplyBadge
                          reply={row.stdReply}
                          yes={row.stdYes}
                          headcount={row.headcount}
                        />
                      </Labelled>
                    ) : null}

                    {/* The household's own yes/no belongs to the invitation
                        proper. Showing it beside the save-the-date reply put
                        two "coming?" controls on one row that meant different
                        things; a reply taken by phone is recorded against the
                        person, on the guest list, where the answer lives. */}
                    <Labelled label="Coming?" hidden={savingTheDate}>
                      <div className="flex items-center gap-1">
                        <ReplyButton
                          active={row.reply === "YES"}
                          tone="yes"
                          disabled={!canEdit}
                          onClick={() =>
                            run(`${row.householdId}:reply`, () =>
                              setHouseholdReply(
                                row.householdId,
                                row.reply === "YES" ? "AWAITING" : "YES",
                              ),
                            )
                          }
                        >
                          Yes
                        </ReplyButton>
                        <ReplyButton
                          active={row.reply === "NO"}
                          tone="no"
                          disabled={!canEdit}
                          onClick={() =>
                            run(`${row.householdId}:reply`, () =>
                              setHouseholdReply(
                                row.householdId,
                                row.reply === "NO" ? "AWAITING" : "NO",
                              ),
                            )
                          }
                        >
                          No
                        </ReplyButton>
                      </div>
                    </Labelled>
                  </div>
                </div>

                {/* The family */}
                {open ? (
                  <motion.div
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="mb-2 ml-6 border-l border-line pl-4">
                      {/* The note they wrote when they replied. The form calls
                          it "very much read", which was not true of anywhere
                          in this app until it appeared here. */}
                      {row.message ? (
                        <p className="mb-2 rounded-lg border border-line bg-surface-soft px-3 py-2 text-[12.5px] italic leading-snug text-ink-soft">
                          “{row.message}”
                        </p>
                      ) : null}
                      {row.people.length === 0 ? (
                        <p className="py-2 text-[12.5px] text-ink-faint">
                          Nobody is listed in this household yet.
                        </p>
                      ) : (
                        row.people.map((person) => (
                          <PersonRow
                            key={person.guestId}
                            person={person}
                            canEdit={canEdit}
                            busy={busy}
                            onSend={(which, sent) =>
                              run(`${person.guestId}:${which}`, () =>
                                setGuestSend(person.guestId, which, sent),
                              )
                            }
                            onPhone={(value) =>
                              run(`${person.guestId}:phone`, () =>
                                setGuestContact(person.guestId, "phone", value),
                              )
                            }
                          />
                        ))
                      )}
                    </div>
                  </motion.div>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PersonRow({
  person,
  canEdit,
  busy,
  onSend,
  onPhone,
}: {
  person: InvitationPerson;
  canEdit: boolean;
  busy: string | null;
  onSend(which: "saveTheDate" | "invitation", sent: boolean): void;
  onPhone(value: string): void;
}) {
  const [phone, setPhone] = React.useState(person.phone ?? "");
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => setPhone(person.phone ?? ""), [person.phone]);

  function commit() {
    setEditing(false);
    if (phone.trim() !== (person.phone ?? "")) onPhone(phone);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line/40 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
        {person.name}
      </span>

      {/* Their answer to the save-the-date, on their own row. Whoever opened
          the link answered for themselves, so this is where it belongs. */}
      {person.stdResponse ? (
        <Badge
          size="xs"
          variant={person.stdResponse === "YES" ? "positive" : "neutral"}
          className="shrink-0"
        >
          {person.stdResponse === "YES" ? "Said yes" : "Said no"}
        </Badge>
      ) : null}

      {/* The eight couples who answer separately. Each of them replies only
          for themselves, so their link is the one that gets sent — the family
          link deliberately doesn't speak for them. */}
      {person.rsvpToken ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <Badge variant="important" size="xs">Personal invite</Badge>
          <CopyLink
            token={person.rsvpToken}
            name={person.name}
            label="Copy their link"
            tone="personal"
          />
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-ink-faint">on the group link</span>
      )}

      {person.message ? (
        <p className="w-full rounded-lg border border-line bg-surface-soft px-3 py-1.5 text-[12px] italic leading-snug text-ink-soft">
          “{person.message}”
        </p>
      ) : null}

      {editing || phone ? (
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setPhone(person.phone ?? "");
              setEditing(false);
            }
          }}
          disabled={!canEdit}
          inputMode="tel"
          placeholder="Phone"
          className="h-7 w-36 text-[12px]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={!canEdit}
          className="h-7 rounded-lg border border-dashed border-line-strong px-2 text-[11.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
        >
          + Number
        </button>
      )}

      <div className="flex items-center gap-4">
        <Labelled label="STD">
          <SentToggle
            sent={person.saveTheDateSent}
            busy={busy === `${person.guestId}:saveTheDate`}
            disabled={!canEdit}
            onClick={() => onSend("saveTheDate", !person.saveTheDateSent)}
          />
        </Labelled>
        <Labelled label="Invite">
          <SentToggle
            sent={person.invitationSent}
            busy={busy === `${person.guestId}:invitation`}
            disabled={!canEdit}
            onClick={() => onSend("invitation", !person.invitationSent)}
          />
        </Labelled>
      </div>
    </div>
  );
}

/** A tiny caption above a control, so the ticks aren't a guessing game. */
function Labelled({
  label,
  hidden,
  children,
}: {
  label: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  if (hidden) return null;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9.5px] uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      {children}
    </div>
  );
}

function SentToggle({
  sent,
  busy,
  disabled,
  onClick,
}: {
  sent: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-pressed={sent}
      aria-label={sent ? "Sent — tap to unmark" : "Not sent — tap to mark as sent"}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border transition-all",
        sent
          ? "border-positive/30 bg-positive-soft text-positive"
          : "border-line text-transparent hover:border-line-strong hover:text-ink-faint",
        disabled ? "cursor-default" : "cursor-pointer",
        busy && "opacity-50",
      )}
    >
      <motion.span
        initial={false}
        animate={reduce ? undefined : { scale: sent ? 1 : 0.8 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        className="flex"
      >
        <CheckIcon size={13} />
      </motion.span>
    </button>
  );
}

function ReplyButton({
  active,
  tone,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  tone: "yes" | "no";
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "min-h-[26px] rounded-lg border px-2.5 text-[12px] transition-colors",
        active && tone === "yes" && "border-positive/30 bg-positive-soft text-positive",
        active && tone === "no" && "border-line-strong bg-ink/[0.04] text-ink",
        !active && "border-line text-ink-faint hover:border-line-strong hover:text-ink-muted",
        disabled && "cursor-default",
      )}
    >
      {children}
    </button>
  );
}

function Figure({
  value,
  label,
  tone,
}: {
  value: React.ReactNode;
  label: string;
  tone?: "positive" | "attention";
}) {
  return (
    <div>
      <div
        className={cn(
          "tabular font-display text-[24px] leading-none sm:text-[26px]",
          tone === "positive" && "text-positive",
          tone === "attention" && "text-attention",
          !tone && "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-ink-muted">{label}</div>
    </div>
  );
}

/**
 * The link you send this household.
 *
 * Copying is the whole interaction — these go out over WhatsApp one family at a
 * time — so it's one button that puts the address on the clipboard and says so.
 * The link is per household and unguessable; it opens their reply and nobody
 * else's.
 */
/**
 * A household's save-the-date answer.
 *
 * Partial is its own state and says how far through it is: a family where two
 * of four have replied is a chase, not a silence.
 */
function StdReplyBadge({
  reply,
  yes,
  headcount,
}: {
  reply: StdReply;
  yes: number;
  headcount: number;
}) {
  if (reply === "AWAITING") {
    return (
      <span className="text-[11.5px] text-ink-muted">Not yet</span>
    );
  }
  if (reply === "PARTIAL") {
    return (
      <Badge size="xs" variant="attention">
        {yes > 0 ? `${yes} of ${headcount} so far` : "Part answered"}
      </Badge>
    );
  }
  if (reply === "MIXED") {
    // Everybody answered and they didn't agree. Not a yes, and not a no: the
    // room and the headcount both depend on knowing which.
    return (
      <Badge size="xs" variant="info">
        {yes} of {headcount} coming
      </Badge>
    );
  }
  return (
    <Badge size="xs" variant={reply === "YES" ? "positive" : "neutral"}>
      {reply === "YES" ? (headcount > 1 ? "All coming" : "Said yes") : "Said no"}
    </Badge>
  );
}

function CopyLink({
  token,
  name,
  label = "Copy link",
  tone,
}: {
  token: string;
  name: string;
  label?: string;
  /** Personal links are the exception, and are drawn like one. */
  tone?: "personal";
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    const url = `${CANONICAL_SITE_ORIGIN}/rsvp/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be refused; opening it is the next best thing.
      window.prompt(`Their link for ${name}`, url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!token) return null;

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy the invitation link for ${name}`}
      className={cn(
        "shrink-0 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
        copied
          ? "border-positive bg-positive-soft text-positive"
          : tone === "personal"
            ? "border-important/40 bg-important-soft text-important hover:border-important"
            : "border-line-strong bg-surface text-ink-soft hover:border-ink-faint hover:text-ink",
      )}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
