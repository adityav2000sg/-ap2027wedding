import "server-only";

/**
 * AI-proposed changes.
 *
 * The model never writes. It calls `propose_change`, which validates the shape,
 * runs the impact engine and records a pending proposal. A human then approves,
 * and execution goes through exactly the same `applyChange` path a manual edit
 * would — same validation, same permission check, same activity log.
 */

import { z } from "zod";

import { analyseChange, type ImpactReport, type PlannedChange } from "@/domain/impact";
import { db } from "@/server/db";
import { fetchSnapshot } from "@/server/snapshot-query";
import type { Viewer } from "@/server/permissions";
import type { ToolDefinition } from "./qwen";

/** The subset of changes the AI is allowed to suggest. */
export const PROPOSABLE = [
  "wedding.guests",
  "event.time",
  "event.guests",
  "vendor.status",
  "vendor.quote",
  "task.update",
] as const;

const proposalSchema = z.object({
  action: z.enum(PROPOSABLE),
  summary: z.string().trim().min(1).max(300),
  args: z.record(z.string(), z.unknown()),
});

export const PROPOSE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "propose_change",
    description:
      "Propose a specific change for the user to approve. Use this when they ask you to change something, or when a change is clearly the right recommendation. " +
      "You cannot apply it yourself — proposing shows them a preview of everything it would affect, and they decide. " +
      "Call this once per distinct change. Always explain in your reply what you proposed and why.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [...PROPOSABLE],
          description:
            "wedding.guests = change the overall guest estimate. " +
            "event.time = move a function's start/end time. Prefer passing {eventId, shiftMinutes} — a relative shift, positive for later — and let the system do the arithmetic. " +
            "event.guests = change one function's expected attendance. " +
            "vendor.status = move a vendor along (e.g. to SELECTED). " +
            "vendor.quote = record a new quote amount. " +
            "task.update = change a task's owner, due date, status or priority.",
        },
        summary: {
          type: "string",
          description:
            "One plain sentence describing the change, as the user would say it. e.g. 'Move the Shaadi 45 minutes later'.",
        },
        args: {
          type: "object",
          description:
            "The change parameters. wedding.guests: {estimatedGuests}. " +
            "event.time: {eventId, shiftMinutes} to move a function by a relative amount (STRONGLY PREFERRED — never do the arithmetic yourself), " +
            "or {eventId, startMinute, endMinute} for an absolute time. " +
            "event.guests: {eventId, estimatedGuests}. vendor.status: {vendorId, status}. vendor.quote: {vendorId, amount}. " +
            "task.update: {taskId, and any of ownerId, dueDate (YYYY-MM-DD), status, priority}.",
        },
      },
      required: ["action", "summary", "args"],
    },
  },
};

export interface RecordedProposal {
  id: string;
  action: string;
  summary: string;
  args: Record<string, unknown>;
  impact: ImpactReport | null;
  /** Set when the proposal can't be applied, and why. */
  blocked: string | null;
}

/**
 * Validate and record a proposal. Returns a short confirmation the model can
 * read, plus the stored proposal for the UI.
 */
export async function recordProposal(
  raw: unknown,
  viewer: Viewer,
  conversationId: string | null,
): Promise<{ toolOutput: string; proposal: RecordedProposal | null }> {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      toolOutput: JSON.stringify({
        error: "That proposal was malformed. Check the required fields.",
      }),
      proposal: null,
    };
  }

  const { action, summary, args } = parsed.data;
  const snapshot = await fetchSnapshot(viewer.weddingId);

  // Task updates don't go through the impact engine — they're low-risk and have
  // their own execution path.
  let impact: ImpactReport | null = null;
  let blocked: string | null = null;

  if (action === "task.update") {
    const taskId = String(args.taskId ?? "");
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) blocked = "That task doesn't exist.";
    if (!viewer.permissions.has("tasks.edit")) {
      blocked = "You don't have permission to change tasks.";
    }
  } else {
    try {
      // A relative shift is far more reliable than asking the model to add
      // minutes to a clock time, so resolve it here against the real event.
      if (action === "event.time" && args.shiftMinutes !== undefined) {
        const event = snapshot.events.find((e) => e.id === String(args.eventId ?? ""));
        if (!event) throw new Error("That event doesn't exist.");
        const shift = Number(args.shiftMinutes);
        if (!Number.isFinite(shift)) throw new Error("shiftMinutes must be a number.");
        args.startMinute = event.startMinute + shift;
        args.endMinute = event.endMinute + shift;
        delete args.shiftMinutes;
      }

      const change = { type: action, ...args } as unknown as PlannedChange;
      impact = analyseChange(snapshot, change, viewer.displayCurrency);
    } catch (error) {
      blocked =
        error instanceof Error ? error.message : "That change couldn't be modelled.";
    }
  }

  const record = await db.aIActionProposal.create({
    data: {
      weddingId: viewer.weddingId,
      conversationId,
      action,
      args: args as never,
      summary,
      impact: (impact as never) ?? undefined,
      status: blocked ? "FAILED" : "PENDING",
      result: blocked ? ({ blocked } as never) : undefined,
    },
    select: { id: true },
  });

  return {
    toolOutput: JSON.stringify(
      blocked
        ? { recorded: false, reason: blocked }
        : {
            recorded: true,
            summary,
            affects: impact?.impacts.length ?? 0,
            material: impact?.material ?? false,
            note: "Shown to the user for approval. Do not claim it has been applied.",
          },
    ),
    proposal: {
      id: record.id,
      action,
      summary,
      args,
      impact,
      blocked,
    },
  };
}

/**
 * Execute an approved proposal. Runs through the same server actions a manual
 * edit uses, so permissions and activity logging are identical.
 */
export async function executeProposal(
  proposalId: string,
  viewer: Viewer,
): Promise<{ ok: boolean; error?: string }> {
  const proposal = await db.aIActionProposal.findFirst({
    where: { id: proposalId, weddingId: viewer.weddingId, status: "PENDING" },
  });
  if (!proposal) {
    return { ok: false, error: "That suggestion is no longer available." };
  }

  const args = (proposal.args ?? {}) as Record<string, unknown>;

  try {
    if (proposal.action === "task.update") {
      const { updateTask } = await import("@/server/actions/tasks");
      const result = await updateTask({ id: args.taskId, ...args });
      if (!result.ok) throw new Error(result.error);
    } else {
      const { applyChange } = await import("@/server/actions/impact");
      const result = await applyChange(
        { type: proposal.action, ...args },
        {
          // The proposal id doubles as the idempotency key, so approving twice
          // can't apply twice.
          idempotencyKey: `proposal:${proposalId}`,
          reason: `Suggested by the AI Planner and approved by ${viewer.name}`,
        },
      );
      if (!result.ok) throw new Error(result.error);
      if (result.data.stale) {
        throw new Error(
          "Something changed since this was suggested. Ask again so the consequences can be recalculated.",
        );
      }
    }

    await db.aIActionProposal.update({
      where: { id: proposalId },
      data: { status: "EXECUTED", resolvedAt: new Date() },
    });

    // Every AI mutation gets its own activity entry, tagged as AI.
    const { logActivity } = await import("@/server/activity");
    await logActivity({
      weddingId: viewer.weddingId,
      actorId: viewer.userId,
      source: "AI",
      entityType: "ai",
      entityId: proposalId,
      action: "executed",
      summary: `AI Planner: ${proposal.summary} — approved by ${viewer.name}.`,
      after: args,
    });

    return { ok: true };
  } catch (error) {
    await db.aIActionProposal.update({
      where: { id: proposalId },
      data: {
        status: "FAILED",
        resolvedAt: new Date(),
        result: {
          error: error instanceof Error ? error.message : "Failed",
        } as never,
      },
    });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That change couldn't be applied.",
    };
  }
}

export async function rejectProposal(
  proposalId: string,
  viewer: Viewer,
): Promise<void> {
  await db.aIActionProposal.updateMany({
    where: { id: proposalId, weddingId: viewer.weddingId, status: "PENDING" },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });
}
