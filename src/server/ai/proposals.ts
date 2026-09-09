import "server-only";

/**
 * AI-proposed changes.
 *
 * The model never writes. It calls `propose_change` with one of the actions in
 * the capability registry, which validates the arguments, checks the action
 * against the viewer's own permissions, runs the impact engine where the change
 * is one it models, and records a pending proposal. A human then approves, and
 * execution goes through exactly the same path a manual edit would — same
 * validation, same permission check, same activity log.
 *
 * The registry is deliberately wide: everything the app can do, the assistant
 * can suggest. Withholding capabilities bought nothing, because proposing is
 * not applying — the gate is the approval, not the size of the catalogue.
 */

import { z } from "zod";

import { analyseChange, type ImpactReport, type PlannedChange } from "@/domain/impact";
import { db } from "@/server/db";
import { fetchSnapshot } from "@/server/snapshot-query";
import type { Viewer } from "@/server/permissions";
import { EXECUTORS } from "./execute";
import {
  capabilityCatalogue,
  capabilityActions,
  findCapability,
  permittedActions,
  type CapabilityArea,
} from "./registry";
import type { ToolDefinition } from "./qwen";

const proposalSchema = z.object({
  action: z.string().min(1),
  summary: z.string().trim().min(1).max(300),
  args: z.record(z.string(), z.unknown()),
});

/**
 * The change tool, described for one person.
 *
 * The catalogue is generated from the registry and filtered to what this
 * viewer could do by hand, so the model is never told about a capability it
 * would only be refused on.
 */
export function proposeTool(viewer: Viewer): ToolDefinition {
  const has = (permission: Parameters<typeof viewer.permissions.has>[0]) =>
    viewer.permissions.has(permission);

  return {
    type: "function",
    function: {
      name: "propose_change",
      description:
        "Propose one specific change for the user to approve. Use this whenever they ask you to add, " +
        "change, move, remove, assign, record or set anything at all — and when a change is clearly the " +
        "right recommendation. You cannot apply it yourself: proposing shows them what it would affect and " +
        "they decide. Call it once per distinct change; several calls make a plan they can approve together. " +
        "Every id must come from a tool result — use find_records to look one up by name. " +
        "What you can propose:\n" +
        capabilityCatalogue(has),
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: permittedActions(has),
            description: "One of the actions listed above.",
          },
          summary: {
            type: "string",
            description:
              "One plain sentence describing the change as the user would say it. " +
              "e.g. 'Move the Shaadi 45 minutes later' or 'Add a task to chase the Bali venue quote'.",
          },
          args: {
            type: "object",
            description:
              "The arguments that action takes, exactly as named in the list above. " +
              "Dates are YYYY-MM-DD; times are minutes from midnight (1140 = 7:00 PM).",
          },
        },
        required: ["action", "summary", "args"],
      },
    },
  };
}

/** Every action the registry knows, for tests and diagnostics. */
export const PROPOSABLE = capabilityActions();

export interface RecordedProposal {
  id: string;
  action: string;
  area: CapabilityArea | null;
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
  const capability = findCapability(action);
  if (!capability) {
    // Answering with the list rather than a flat refusal — the model can pick
    // the right one and try again in the same turn.
    return {
      toolOutput: JSON.stringify({
        error: `There is no action called "${action}".`,
        availableActions: capabilityActions(),
      }),
      proposal: null,
    };
  }

  // Bad arguments come straight back rather than becoming a dead card the user
  // has to dismiss: the model can correct them and propose again.
  const checked = capability.schema.safeParse(args);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return {
      toolOutput: JSON.stringify({
        error: `Those arguments don't fit ${action}: ${issue?.path.join(".") || "args"} — ${issue?.message}`,
        expects: capability.hint,
      }),
      proposal: null,
    };
  }

  const snapshot = await fetchSnapshot(viewer.weddingId);

  let impact: ImpactReport | null = null;
  let blocked: string | null = null;

  if (!viewer.permissions.has(capability.permission)) {
    blocked = "You don't have permission to make that change.";
  } else if (capability.planned) {
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

      impact = analyseChange(snapshot, capability.planned(args), viewer.displayCurrency);
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
      area: capability.area,
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
 *
 * Two routes, and the difference matters: changes the impact engine models go
 * through `applyChange`, which re-checks the preview against current state and
 * refuses to apply a stale one. Everything else calls its ordinary action.
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
  const capability = findCapability(proposal.action);

  try {
    if (!capability) {
      throw new Error("That kind of change is no longer supported.");
    }
    if (!viewer.permissions.has(capability.permission)) {
      throw new Error("You don't have permission to make that change.");
    }

    if (capability.planned) {
      const { applyChange } = await import("@/server/actions/impact");
      const result = await applyChange(capability.planned(args) as PlannedChange, {
        // The proposal id doubles as the idempotency key, so approving twice
        // can't apply twice.
        idempotencyKey: `proposal:${proposalId}`,
        reason: `Suggested by the AI Planner and approved by ${viewer.name}`,
      });
      if (!result.ok) throw new Error(result.error);
      if (result.data.stale) {
        throw new Error(
          "Something changed since this was suggested. Ask again so the consequences can be recalculated.",
        );
      }
    } else {
      const execute = EXECUTORS[proposal.action];
      if (!execute) throw new Error("That change has no way to run.");
      await execute(args);
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
