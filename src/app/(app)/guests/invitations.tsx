"use client";

/**
 * Save-the-dates and invitations.
 *
 * One row per household, because that is how invitations are actually
 * addressed. Two send columns and one answer column — the three facts anybody
 * chasing an RSVP list needs to see at once.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Button, EmptyState, SegmentBar } from "@/components/ui/primitives";
import { Input } from "@/components/ui/form";
import { CheckIcon, SearchIcon } from "@/components/ui/icons";
import { setHouseholdReply, setHouseholdSend } from "@/server/actions/guests";

export interface InvitationRow {
  householdId: string;
  name: string;
  side: string;
  headcount: number;
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
  responseRate: number;
}

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "std-not-sent", label: "No save-the-date" },
  { key: "not-invited", label: "No invitation" },
  { key: "awaiting", label: "Awaiting reply" },
  { key: "yes", label: "Coming" },
  { key: "no", label: "Not coming" },
] as const;

export function Invitations({
  rows,
  stats,
  canEdit,
}: {
  rows: InvitationRow[];
  stats: InvitationStats;
  canEdit: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<string>("all");
  const [busy, setBusy] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows
      .filter((row) => {
        switch (filter) {
          case "std-not-sent": return !row.saveTheDateSent;
          case "not-invited": return !row.invitationSent;
          case "awaiting": return row.reply === "AWAITING";
          case "yes": return row.reply === "YES";
          case "no": return row.reply === "NO";
          default: return true;
        }
      })
      .filter((row) => !q || row.name.toLowerCase().includes(q));
  }, [rows, filter, query]);

  async function toggleSend(row: InvitationRow, which: "saveTheDate" | "invitation") {
    if (!canEdit) return;
    const key = `${row.householdId}:${which}`;
    setBusy(key);
    const sent = which === "saveTheDate" ? row.saveTheDateSent : row.invitationSent;
    await setHouseholdSend(row.householdId, which, !sent);
    setBusy(null);
    router.refresh();
  }

  async function setReply(row: InvitationRow, reply: InvitationRow["reply"]) {
    if (!canEdit) return;
    setBusy(`${row.householdId}:reply`);
    // Clicking the answer a household already gave clears it back to awaiting,
    // so a mis-click is one click to undo rather than a dead end.
    await setHouseholdReply(row.householdId, row.reply === reply ? "AWAITING" : reply);
    setBusy(null);
    router.refresh();
  }

  return (
    <div>
      {/* Overview */}
      <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-line py-5 sm:grid-cols-5">
        <Figure
          value={`${stats.stdSent}/${stats.households}`}
          label="Save-the-dates sent"
        />
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
      </p>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
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
        <div className="relative ml-auto">
          <SearchIcon
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search households…"
            className="h-7 w-56 pl-8 text-[12.5px]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No households match"
          description="Try a different filter, or clear the search."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-3 text-left text-[11.5px] font-medium text-ink-muted">
                  Household
                </th>
                <th className="px-3 py-2 text-center text-[11.5px] font-medium text-ink-muted">
                  Save the date
                </th>
                <th className="px-3 py-2 text-center text-[11.5px] font-medium text-ink-muted">
                  Invitation
                </th>
                <th className="px-3 py-2 text-center text-[11.5px] font-medium text-ink-muted">
                  Coming?
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <motion.tr
                  key={row.householdId}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.28,
                    ease: [0.22, 1, 0.36, 1],
                    delay: reduce ? 0 : Math.min(index * 0.012, 0.24),
                  }}
                  className="border-b border-line/60 transition-colors hover:bg-ink/[0.015]"
                >
                  <td className="py-2.5 pr-3">
                    <span className="text-[13.5px] text-ink">{row.name}</span>
                    <span className="tabular ml-2 text-[11.5px] text-ink-faint">
                      {row.headcount}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-center">
                    <SentToggle
                      sent={row.saveTheDateSent}
                      busy={busy === `${row.householdId}:saveTheDate`}
                      disabled={!canEdit}
                      onClick={() => toggleSend(row, "saveTheDate")}
                    />
                  </td>

                  <td className="px-3 py-2.5 text-center">
                    <SentToggle
                      sent={row.invitationSent}
                      busy={busy === `${row.householdId}:invitation`}
                      disabled={!canEdit}
                      onClick={() => toggleSend(row, "invitation")}
                    />
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <ReplyButton
                        active={row.reply === "YES"}
                        tone="yes"
                        disabled={!canEdit}
                        onClick={() => setReply(row, "YES")}
                      >
                        Yes
                      </ReplyButton>
                      <ReplyButton
                        active={row.reply === "NO"}
                        tone="no"
                        disabled={!canEdit}
                        onClick={() => setReply(row, "NO")}
                      >
                        No
                      </ReplyButton>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Sent or not. A tick that fills, rather than a checkbox that looks like a form. */
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
      aria-label={sent ? "Sent — click to unmark" : "Not sent — click to mark as sent"}
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
        "rounded-lg border px-2.5 py-0.5 text-[12px] transition-colors",
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
          "tabular font-display text-[26px] leading-none",
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
