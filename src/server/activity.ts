/**
 * Activity logging.
 *
 * Every meaningful mutation writes one of these. The feed is the wedding's
 * memory: who changed what, from what to what, and why. Because entries carry
 * structured before/after payloads, a subset of them can be undone.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { Viewer } from "./permissions";

export interface ActivityInput {
  weddingId: string;
  actorId?: string | null;
  source?: "MANUAL" | "AUTOMATED" | "AI";
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  action: string;
  /** Written in plain language: "Avantika moved the Shaadi 45 minutes later." */
  summary: string;
  /**
   * Arbitrary snapshots of the entity before and after. Accepts anything —
   * Dates, Prisma Decimals, nested objects — and is normalised to JSON here so
   * callers never have to think about Prisma's input types.
   */
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  undoable?: boolean;
}

type Client = Prisma.TransactionClient | typeof db;

/**
 * Normalise a value into something Postgres' jsonb will accept. Round-tripping
 * through JSON also flattens Dates to ISO strings and Decimals to strings,
 * which is exactly what we want stored in an audit trail.
 */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  try {
    const serialised = JSON.parse(JSON.stringify(value)) as unknown;
    if (serialised === null) return Prisma.JsonNull;
    return serialised as Prisma.InputJsonValue;
  } catch {
    // A value that won't serialise is not worth failing the mutation over.
    return Prisma.JsonNull;
  }
}

export async function logActivity(
  input: ActivityInput,
  client: Client = db,
): Promise<void> {
  await client.activityLog.create({
    data: {
      weddingId: input.weddingId,
      actorId: input.actorId ?? null,
      source: input.source ?? "MANUAL",
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      action: input.action,
      summary: input.summary,
      before: toJson(input.before),
      after: toJson(input.after),
      reason: input.reason ?? null,
      undoable: input.undoable ?? false,
    },
  });
}

/** Convenience wrapper that fills in the actor from the viewer. */
export async function logViewerActivity(
  viewer: Viewer,
  input: Omit<ActivityInput, "weddingId" | "actorId">,
  client: Client = db,
): Promise<void> {
  await logActivity(
    { ...input, weddingId: viewer.weddingId, actorId: viewer.userId },
    client,
  );
}

/**
 * Diff two records into a human sentence fragment, e.g.
 * `status Shortlisted → Selected`. Returns null when nothing meaningful moved.
 */
export function describeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string> = {},
): string | null {
  const parts: string[] = [];
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (from === to) continue;
    if (from === undefined) continue;
    if (from instanceof Date && to instanceof Date && from.getTime() === to.getTime()) {
      continue;
    }
    parts.push(`${labels[key] ?? key} ${format(from)} → ${format(to)}`);
  }
  return parts.length ? parts.join(", ") : null;
}

function format(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}
