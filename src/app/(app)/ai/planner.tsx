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
  summary: string;
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
  const endRef = React.useRef<HTMLDivElement>(null);

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
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-[820px] flex-col px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Ask anything</div>
        <h1 className="font-display text-[34px] leading-tight text-ink">AI Planner</h1>
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
                <div className="flex flex-wrap gap-2">
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
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-[12.5px] text-ink-soft transition-all hover:border-plum/40 hover:bg-plum-soft hover:text-plum"
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
                              <ul className="mt-3 space-y-2">
                                {turn.proposals.map((proposal) => (
                                  <ProposalCard
                                    key={proposal.id}
                                    proposal={proposal}
                                    currency={currency}
                                    state={resolved[proposal.id]}
                                    onReview={() => {
                                      setApplyError(null);
                                      setReviewing(proposal);
                                    }}
                                    onDismiss={async () => {
                                      setResolved((c) => ({ ...c, [proposal.id]: "dismissed" }));
                                      await dismissAiProposal(proposal.id);
                                    }}
                                  />
                                ))}
                              </ul>
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

          <div className="sticky bottom-0 mt-5 bg-canvas pb-2 pt-3">
            <div className="relative">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                placeholder="Ask about the budget, the guests, what's behind…"
                className="min-h-[52px] pr-24"
                disabled={pending}
              />
              <Button
                variant="primary"
                size="sm"
                className="absolute bottom-2.5 right-2.5"
                disabled={pending || draft.trim().length === 0}
                onClick={() => ask(draft)}
              >
                {pending ? "Thinking…" : "Ask"}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">
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
          setApplyError(null);
          const result = await approveAiProposal(reviewing.id);
          setApplying(false);
          if (!result.ok) {
            setApplyError(result.error);
            return;
          }
          setResolved((c) => ({ ...c, [reviewing.id]: "applied" }));
          setReviewing(null);
        }}
      />
    </div>
  );
}

/** One suggested change, with a route into the full impact preview. */
function ProposalCard({
  proposal, currency, state, onReview, onDismiss,
}: {
  proposal: Proposal;
  currency: string;
  state?: "applied" | "dismissed";
  onReview(): void;
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
            {affects > 0
              ? `Affects ${affects} ${affects === 1 ? "thing" : "things"}`
              : "Nothing else depends on this"}
            {Math.abs(delta) >= 1
              ? ` · ${formatMoney(delta, currency, { signed: true })}`
              : ""}
          </p>
        </div>
        {proposal.impact?.material ? (
          <Badge variant="attention" size="xs" className="shrink-0">
            Review
          </Badge>
        ) : null}
      </div>

      <div className="mt-2.5 flex gap-2">
        <Button variant="primary" size="xs" onClick={onReview}>
          Review &amp; apply
        </Button>
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          No thanks
        </Button>
      </div>
    </li>
  );
}
