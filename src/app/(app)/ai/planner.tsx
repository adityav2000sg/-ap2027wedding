"use client";

/**
 * The AI Planner.
 *
 * Answers are grounded in tool calls against live wedding data — which tools it
 * consulted is shown under each reply, so an answer can always be traced back
 * to where the numbers came from.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { Badge, Button } from "@/components/ui/primitives";
import { Textarea } from "@/components/ui/form";
import { CheckIcon, CloseIcon, SparkIcon } from "@/components/ui/icons";
import { ImpactDrawer } from "@/components/wedding/impact-drawer";
import { approveAiProposal, dismissAiProposal } from "@/server/actions/ai";
import type { ImpactReport } from "@/domain/impact";

interface Proposal {
  id: string;
  action: string;
  /** Which part of the wedding it touches — guests, budget, the run of show… */
  area: string | null;
  summary: string;
  /**
   * Present only for changes the impact engine models. The rest — adding a
   * task, logging a call, booking a fitting — have no consequences to preview,
   * so they are applied from the card itself rather than through the drawer.
   */
  impact: ImpactReport | null;
  blocked: string | null;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  proposals?: Proposal[];
  error?: boolean;
}

const TOOL_LABEL: Record<string, string> = {
  get_overview: "overview",
  get_attention_list: "attention list",
  get_tasks: "tasks",
  get_budget: "budget",
  get_payments: "payments",
  get_vendors: "vendors",
  get_guests: "guests",
  get_events: "events",
  get_logistics: "logistics",
  get_run_of_show: "run of show",
  get_wardrobe_and_media: "wardrobe",
  get_people: "the family",
  get_invitations: "invitations",
  get_recent_activity: "recent activity",
  find_records: "the records",
  simulate_guest_count: "guest-count model",
};

export function AiPlanner({
  configured,
  viewerName,
  canSeeMoney,
  suggestions,
  currency,
}: {
  configured: boolean;
  viewerName: string;
  canSeeMoney: boolean;
  suggestions: string[];
  currency: string;
}) {
  const reduce = useReducedMotion();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [reviewing, setReviewing] = React.useState<Proposal | null>(null);
  const [applying, setApplying] = React.useState(false);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [resolved, setResolved] = React.useState<Record<string, "applied" | "dismissed">>({});
  const [applyingId, setApplyingId] = React.useState<string | null>(null);
  const [applyFailure, setApplyFailure] =
    React.useState<{ id: string; message: string } | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  /**
   * Apply one proposal.
   *
   * The same server action the drawer calls — approving from the card is not a
   * shortcut past anything, it just skips a preview that would have been empty.
   */
  async function apply(proposal: Proposal): Promise<boolean> {
    setApplyingId(proposal.id);
    setApplyError(null);
    setApplyFailure(null);
    const result = await approveAiProposal(proposal.id);
    setApplyingId(null);
    if (!result.ok) {
      // The drawer reads one; the card reads the other. A change applied from
      // the card would otherwise fail in silence.
      setApplyError(result.error);
      setApplyFailure({ id: proposal.id, message: result.error });
      return false;
    }
    setResolved((current) => ({ ...current, [proposal.id]: "applied" }));
    return true;
  }

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }, [turns, pending, reduce]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setTurns((current) => [...current, userTurn]);
    setDraft("");
    setPending(true);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: turns.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const payload = await response.json();

      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: payload.answer ?? payload.error ?? "No answer came back.",
          toolsUsed: payload.toolsUsed,
          proposals: payload.proposals,
          error: !response.ok,
        },
      ]);
    } catch {
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Couldn't reach the planner. Check your connection and try again.",
          error: true,
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-[820px] flex-col px-4 py-5 sm:px-8 sm:py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Ask anything</div>
        {/* Fraunces here, not the script face. "AI Planner" in a copperplate
            hand is a puzzle rather than a label — the letterforms fight the
            initials, and this is a screen people scan on the way to typing. */}
        <h1 className="font-display text-[27px] leading-tight text-ink sm:text-[38px]">
          AI Planner
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          It reads the live wedding — guests, budget, vendors, the run of show —
          and answers from the actual numbers.
          {!canSeeMoney ? " Financial details are hidden from your account." : ""}
        </p>
      </header>

      {!configured ? (
        <div className="rounded-xl border border-attention/25 bg-attention-soft px-4 py-3">
          <p className="text-[13px] font-medium text-attention">Not configured yet</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
            Set <code className="rounded bg-surface px-1">QWEN_API_KEY</code> in the
            environment and restart. Everything else in the app works without it.
          </p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1">
            {turns.length === 0 ? (
              <div className="py-4">
                <p className="mb-3 text-[13px] text-ink-soft">
                  Try one of these, {viewerName.split(" ")[0]}:
                </p>
                <div className="pill-row sm:gap-2">
                  {suggestions.map((suggestion, index) => (
                    <motion.button
                      key={suggestion}
                      type="button"
                      onClick={() => ask(suggestion)}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.32,
                        ease: [0.22, 1, 0.36, 1],
                        delay: reduce ? 0 : index * 0.05,
                      }}
                      className="max-w-[80vw] shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-2 text-left text-[12.5px] text-ink-soft transition-all hover:border-plum/40 hover:bg-plum-soft hover:text-plum sm:max-w-none sm:whitespace-normal sm:py-1.5"
                    >
                      {suggestion}
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="space-y-5 py-2">
                <AnimatePresence initial={false}>
                  {turns.map((turn) => (
                    <motion.li
                      key={turn.id}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {turn.role === "user" ? (
                        <div className="flex justify-end">
                          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13.5px] leading-relaxed text-canvas">
                            {turn.content}
                          </p>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <span
                            className={cn(
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                              turn.error
                                ? "bg-critical-soft text-critical"
                                : "bg-plum-soft text-plum",
                            )}
                          >
                            <SparkIcon size={14} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                "whitespace-pre-wrap text-[13.5px] leading-relaxed",
                                turn.error ? "text-critical" : "text-ink-soft",
                              )}
                            >
                              {turn.content}
                            </div>
                            {turn.proposals && turn.proposals.length > 0 ? (
                              <>
                                <ul className="mt-3 space-y-2">
                                  {turn.proposals.map((proposal) => (
                                    <ProposalCard
                                      key={proposal.id}
                                      proposal={proposal}
                                      currency={currency}
                                      state={resolved[proposal.id]}
                                      busy={applyingId === proposal.id}
                                      error={
                                        applyFailure?.id === proposal.id
                                          ? applyFailure.message
                                          : null
                                      }
                                      onReview={() => {
                                        setApplyError(null);
                                        setReviewing(proposal);
                                      }}
                                      onApply={() => apply(proposal)}
                                      onDismiss={async () => {
                                        setResolved((c) => ({ ...c, [proposal.id]: "dismissed" }));
                                        await dismissAiProposal(proposal.id);
                                      }}
                                    />
                                  ))}
                                </ul>
                                <PlanActions
                                  proposals={turn.proposals}
                                  resolved={resolved}
                                  busy={applyingId !== null}
                                  onApplyAll={async (list) => {
                                    // In order: a plan that reorders the week
                                    // depends on its own earlier steps.
                                    for (const proposal of list) {
                                      const ok = await apply(proposal);
                                      if (!ok) break;
                                    }
                                  }}
                                />
                              </>
                            ) : null}

                            {turn.toolsUsed && turn.toolsUsed.length > 0 ? (
                              <p className="mt-2 text-[11px] text-ink-faint">
                                Read:{" "}
                                {[...new Set(turn.toolsUsed)]
                                  .map((t) => TOOL_LABEL[t] ?? t)
                                  .join(" · ")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>

                {pending ? (
                  <motion.li
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-plum-soft text-plum">
                      <SparkIcon size={14} />
                    </span>
                    <span className="flex items-center gap-1 pt-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-plum/50"
                          animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            delay: i * 0.18,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </span>
                  </motion.li>
                ) : null}
              </ol>
            )}
            <div ref={endRef} />
          </div>

          {/* The composer is the thing you come to this page to use, so it's
              built as one solid object rather than a textarea with a button
              parked on top of it. The whole card takes the focus ring, and the
              textarea inside is transparent and unresizable — the drag handle
              poking out of the corner was most of what made it look cheap. */}
          <div className="sticky bottom-0 mt-5 bg-canvas pb-2 pt-3">
            <div
              className={cn(
                "flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 pl-3.5",
                "shadow-raised transition-all duration-300 transition-natural",
                "focus-within:border-saffron/50 focus-within:shadow-float",
                "focus-within:ring-[3px] focus-within:ring-saffron/15",
                pending && "opacity-70",
              )}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                rows={1}
                placeholder="Ask about the budget, the guests…"
                className={cn(
                  "min-h-[40px] flex-1 resize-none border-0 bg-transparent py-2.5 text-[15px] leading-snug",
                  "text-ink placeholder:text-ink-faint focus:outline-none sm:text-[14.5px]",
                )}
                disabled={pending}
              />
              <Button
                variant="primary"
                size="sm"
                className="mb-0.5 h-9 shrink-0 px-4"
                disabled={pending || draft.trim().length === 0}
                onClick={() => ask(draft)}
              >
                {pending ? "Thinking…" : "Ask"}
              </Button>
            </div>
            <p className="mt-2 px-1 text-[11px] text-ink-faint">
              It reads the live wedding and can suggest changes — you see exactly
              what each one affects before anything is applied.
            </p>
          </div>
        </>
      )}

      <ImpactDrawer
        report={reviewing?.impact ?? null}
        open={reviewing !== null}
        onOpenChange={(next) => !next && setReviewing(null)}
        confirmLabel="Apply this change"
        pending={applying}
        error={applyError}
        currency={currency}
        onConfirm={async () => {
          if (!reviewing) return;
          setApplying(true);
          const applied = await apply(reviewing);
          setApplying(false);
          if (applied) setReviewing(null);
        }}
      />
    </div>
  );
}

/** Which part of the wedding a change lands in. */
const AREA_LABEL: Record<string, string> = {
  guests: "Guest list",
  invitations: "Invitations",
  events: "Functions",
  tasks: "Tasks",
  vendors: "Vendors",
  budget: "Budget",
  timeline: "Run of show",
  logistics: "Logistics",
  wardrobe: "Wardrobe",
  wedding: "The wedding",
};

/**
 * Everything suggested in one reply, taken together.
 *
 * A real request is rarely one change — "reorder the week", "chase everyone
 * who hasn't replied" — and approving six cards one at a time is how a good
 * suggestion gets abandoned halfway. Anything the impact engine flagged as
 * material is deliberately left out: those are the ones worth opening.
 */
function PlanActions({
  proposals, resolved, busy, onApplyAll,
}: {
  proposals: Proposal[];
  resolved: Record<string, "applied" | "dismissed">;
  busy: boolean;
  onApplyAll(list: Proposal[]): void;
}) {
  const outstanding = proposals.filter((p) => !p.blocked && !resolved[p.id]);
  const straightforward = outstanding.filter((p) => !p.impact?.material);
  const needReview = outstanding.length - straightforward.length;
  if (straightforward.length < 2) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
      <Button
        variant="primary"
        size="xs"
        disabled={busy}
        onClick={() => onApplyAll(straightforward)}
      >
        {busy ? "Applying…" : `Apply all ${straightforward.length}`}
      </Button>
      <span className="text-[11.5px] text-ink-muted">
        {needReview > 0
          ? `${needReview} more ${needReview === 1 ? "needs" : "need"} a look first`
          : "In the order they're listed"}
      </span>
    </div>
  );
}

/** One suggested change, with a route into the full impact preview. */
function ProposalCard({
  proposal, currency, state, busy, error, onReview, onApply, onDismiss,
}: {
  proposal: Proposal;
  currency: string;
  state?: "applied" | "dismissed";
  busy: boolean;
  error: string | null;
  onReview(): void;
  onApply(): void;
  onDismiss(): void;
}) {
  const affects = proposal.impact?.impacts.length ?? 0;
  const delta = proposal.impact?.finance?.delta ?? 0;

  if (proposal.blocked) {
    return (
      <li className="rounded-xl border border-line bg-surface-soft px-3.5 py-2.5">
        <p className="text-[13px] text-ink">{proposal.summary}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-muted">
          Can't be applied — {proposal.blocked}
        </p>
      </li>
    );
  }

  if (state) {
    return (
      <li
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3.5 py-2.5",
          state === "applied"
            ? "border-positive/25 bg-positive-soft"
            : "border-line bg-surface-soft",
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            state === "applied" ? "bg-positive text-white" : "bg-line-strong text-canvas",
          )}
        >
          {state === "applied" ? <CheckIcon size={11} /> : <CloseIcon size={10} />}
        </span>
        <span className="text-[13px] text-ink-soft">
          {proposal.summary} — {state === "applied" ? "applied" : "dismissed"}
        </span>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-plum/25 bg-plum-soft/50 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] leading-snug text-ink">{proposal.summary}</p>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            {proposal.impact ? (
              <>
                {affects > 0
                  ? `Affects ${affects} ${affects === 1 ? "thing" : "things"}`
                  : "Nothing else depends on this"}
                {Math.abs(delta) >= 1
                  ? ` · ${formatMoney(delta, currency, { signed: true })}`
                  : ""}
              </>
            ) : (
              AREA_LABEL[proposal.area ?? ""] ?? "Change"
            )}
          </p>
        </div>
        {proposal.impact?.material ? (
          <Badge variant="attention" size="xs" className="shrink-0">
            Review
          </Badge>
        ) : null}
      </div>

      <div className="mt-2.5 flex gap-2">
        {proposal.impact ? (
          <Button variant="primary" size="xs" onClick={onReview} disabled={busy}>
            Review &amp; apply
          </Button>
        ) : (
          <Button variant="primary" size="xs" onClick={onApply} disabled={busy}>
            {busy ? "Applying…" : "Apply"}
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={onDismiss} disabled={busy}>
          No thanks
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[11.5px] text-critical">
          {error}
        </p>
      ) : null}
    </li>
  );
}
