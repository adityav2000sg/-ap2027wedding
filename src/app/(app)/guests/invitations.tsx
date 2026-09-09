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

import { cn } from "@/lib/cn";
import { Badge, Button, EmptyState, SegmentBar } from "@/components/ui/primitives";
import { Input } from "@/components/ui/form";
import { CheckIcon, ChevronRightIcon, SearchIcon } from "@/components/ui/icons";
import {
  setGuestContact,
  setGuestSend,
  setHouseholdReply,
  setHouseholdSend,
  setHouseholdTier,
} from "@/server/actions/guests";

export type Tier = "A" | "B" | "C";

export interface InvitationPerson {
  guestId: string;
  name: string;
  phone: string | null;
  email: string | null;
  saveTheDateSent: boolean;
  invitationSent: boolean;
}

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
}

export interface TierStat {
  tier: Tier;
  households: number;
  people: number;
  stdSent: number;
  rsvpSent: number;
  yes: number;
  no: number;
  awaiting: number;
}

const TIER_BLURB: Record<Tier, string> = {
  A: "First wave — save-the-dates go to these now",
  B: "Held back until Tier A replies are in",
  C: "Reserve list",
};

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "std-not-sent", label: "No save-the-date" },
  { key: "not-invited", label: "No invitation" },
  { key: "partial", label: "Partly messaged" },
  { key: "awaiting", label: "Awaiting reply" },
  { key: "yes", label: "Coming" },
  { key: "no", label: "Not coming" },
] as const;

export function Invitations({
  rows,
  stats,
  tiers,
  canEdit,
}: {
  rows: InvitationRow[];
  stats: InvitationStats;
  tiers: TierStat[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<string>("all");
  const [tierFilter, setTierFilter] = React.useState<Tier | "">("");
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
          case "awaiting": return row.reply === "AWAITING";
          case "yes": return row.reply === "YES";
          case "no": return row.reply === "NO";
          default: return true;
        }
      })
      .filter(
        (row) =>
          !q ||
          row.name.toLowerCase().includes(q) ||
          row.people.some((p) => p.name.toLowerCase().includes(q)),
      );
  }, [rows, filter, tierFilter, query]);

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
      {/* Waves */}
      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        {tiers.map((tier) => (
          <button
            key={tier.tier}
            type="button"
            onClick={() => setTierFilter((t) => (t === tier.tier ? "" : tier.tier))}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              tierFilter === tier.tier
                ? "border-saffron/40 bg-saffron-soft"
                : "border-line hover:border-line-strong",
            )}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[12.5px] font-medium text-ink">Tier {tier.tier}</span>
              <span className="tabular text-[12px] text-ink-muted">
                {tier.households} · {tier.people} people
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
              {TIER_BLURB[tier.tier]}
            </p>
            <p className="tabular mt-2 text-[11.5px] text-ink-muted">
              {tier.stdSent}/{tier.households} save-the-dates ·{" "}
              {tier.yes} yes
            </p>
          </button>
        ))}
      </div>

      {/* Overview */}
      <div className="stat-row mb-6 border-y border-line py-5" style={{ ["--stat-cols" as string]: 5 }}>
        <Figure value={`${stats.stdSent}/${stats.households}`} label="Save-the-dates sent" />
        <Figure value={`${stats.rsvpSent}/${stats.households}`} label="Invitations sent" />
        <Figure value={stats.yes} label="Said yes" tone="positive" />
        <Figure value={stats.no} label="Said no" />
        <Figure value={`${stats.responseRate}%`} label="Replied" tone="attention" />
      </div>

      <SegmentBar
        className="mb-2"
        segments={[
          { value: stats.yes, tone: "olive", label: "Yes" },
          { value: stats.no, tone: "slate", label: "No" },
          { value: stats.awaiting, tone: "amber", label: "Awaiting" },
        ]}
      />
      <p className="mb-6 text-[12px] text-ink-muted">
        {stats.peopleYes} confirmed · {stats.peopleAwaiting} still to answer ·{" "}
        {stats.peopleNo} not coming
        <span className="mx-2 text-ink-faint">·</span>
        {stats.peopleStdSent} people personally messaged
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
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
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

                  <CopyLink token={row.householdId ? row.rsvpToken : ""} name={row.name} />

                  <TierSelect
                    tier={row.tier}
                    disabled={!canEdit || busy === `${row.householdId}:tier`}
                    onChange={(tier) =>
                      run(`${row.householdId}:tier`, () =>
                        setHouseholdTier(row.householdId, tier),
                      )
                    }
                  />

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
                    <Labelled label="Coming?">
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
          className="h-7 rounded-lg border border-dashed border-line px-2 text-[11.5px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
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

function TierSelect({
  tier,
  disabled,
  onChange,
}: {
  tier: Tier;
  disabled: boolean;
  onChange(tier: Tier): void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
      {(["A", "B", "C"] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          aria-pressed={tier === option}
          aria-label={`Tier ${option}`}
          className={cn(
            "h-6 w-6 rounded-md text-[11.5px] font-medium transition-colors",
            tier === option
              ? "bg-ink text-canvas"
              : "text-ink-faint hover:bg-surface-sunken hover:text-ink-muted",
            disabled && "cursor-default opacity-60",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** A tiny caption above a control, so the ticks aren't a guessing game. */
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
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
function CopyLink({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    const url = `${window.location.origin}/rsvp/${token}`;
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
        "shrink-0 rounded-lg border px-2 py-1 text-[11.5px] transition-colors",
        copied
          ? "border-positive/30 bg-positive-soft text-positive"
          : "border-line text-ink-faint hover:border-line-strong hover:text-ink",
      )}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
