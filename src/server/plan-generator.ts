/**
 * Master plan generation.
 *
 * Turns the template library into real, dated, dependency-linked tasks for a
 * specific wedding. Used at onboarding, when a family adds a new function, and
 * when the wedding date moves.
 *
 * Idempotent: tasks are keyed by `templateKey`, so re-running adds only what's
 * missing and never duplicates or clobbers work already in progress.
 *
 * Takes an explicit Prisma client, so the seed script can call it directly.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { addDays, toCivil } from "@/lib/dates";
import { resolveTemplates, TASK_LIBRARY } from "@/domain/task-library";
import { db } from "./db";

type Client = Prisma.TransactionClient | PrismaClient;

export interface GenerationResult {
  created: number;
  dependenciesCreated: number;
  skipped: number;
}

/**
 * Instantiate every applicable template that doesn't already exist.
 *
 * Due dates are `weddingStart + offsetDays`. Anything whose computed deadline
 * has already passed is clamped to a near-term date instead — a plan generated
 * nine months out shouldn't open with fifty tasks that are already overdue.
 */
export async function generateMasterPlan(
  weddingId: string,
  options: { clampPastTo?: Date; client?: Client } = {},
): Promise<GenerationResult> {
  const client = options.client ?? db;

  const wedding = await client.wedding.findUniqueOrThrow({
    where: { id: weddingId },
    select: { startDate: true, traditions: true },
  });
  const events = await client.event.findMany({
    where: { weddingId, archivedAt: null },
    select: { id: true, name: true, kind: true },
  });

  const existing = await client.task.findMany({
    where: { weddingId },
    select: { templateKey: true },
  });
  const existingKeys = new Set(
    existing.map((t) => t.templateKey).filter((k): k is string => Boolean(k)),
  );

  const resolved = resolveTemplates(events, wedding.traditions);
  const start = toCivil(wedding.startDate);
  const clampFloor = options.clampPastTo ? toCivil(options.clampPastTo) : null;

  const toCreate = resolved.filter((r) => !existingKeys.has(r.instanceKey));

  // Map template key -> created task id, so dependencies can be wired after.
  const createdIds = new Map<string, string>();
  let created = 0;

  for (const item of toCreate) {
    const { template } = item;
    let dueDate = addDays(start, template.offsetDays);
    if (clampFloor && dueDate < clampFloor) {
      // Preserve relative order among already-late tasks rather than piling
      // them all onto one day.
      const lateness = Math.abs(template.offsetDays);
      dueDate = addDays(clampFloor, Math.min(21, Math.floor(lateness / 30)));
    }

    const task = await client.task.create({
      data: {
        weddingId,
        title: item.title,
        description: template.description ?? null,
        status: "NOT_STARTED",
        priority: template.priority,
        importance: template.importance,
        phase: template.phase,
        eventId: item.eventId,
        dueDate,
        isMilestone: template.isMilestone ?? false,
        templateKey: item.instanceKey,
        offsetDays: template.offsetDays,
      },
      select: { id: true },
    });

    createdIds.set(item.instanceKey, task.id);
    created += 1;
  }

  // Resolve dependencies. A dependency declared between two templates becomes
  // an edge between their instances — matched within the same event where both
  // sides are event-scoped, so Sangeet rehearsals depend on the Sangeet song
  // list, not the Reception's.
  const allTasks = await client.task.findMany({
    where: { weddingId, templateKey: { not: null } },
    select: { id: true, templateKey: true, eventId: true },
  });
  const byInstanceKey = new Map(
    allTasks.map((t) => [t.templateKey as string, t]),
  );

  const edges: { taskId: string; dependsOnId: string }[] = [];
  const libraryByKey = new Map(TASK_LIBRARY.map((t) => [t.key, t]));

  for (const item of resolved) {
    const definition = libraryByKey.get(item.template.key);
    if (!definition?.dependsOn?.length) continue;
    const task = byInstanceKey.get(item.instanceKey);
    if (!task) continue;

    for (const prerequisiteKey of definition.dependsOn) {
      // Prefer the same-event instance; fall back to the wedding-level one.
      const scoped = item.eventId ? `${prerequisiteKey}:${item.eventId}` : null;
      const prerequisite =
        (scoped ? byInstanceKey.get(scoped) : undefined) ??
        byInstanceKey.get(prerequisiteKey);
      if (!prerequisite || prerequisite.id === task.id) continue;
      edges.push({ taskId: task.id, dependsOnId: prerequisite.id });
    }
  }

  let dependenciesCreated = 0;
  if (edges.length) {
    const result = await client.taskDependency.createMany({
      data: edges,
      skipDuplicates: true,
    });
    dependenciesCreated = result.count;
  }

  return { created, dependenciesCreated, skipped: resolved.length - toCreate.length };
}

/**
 * Re-derive every generated task's deadline after the wedding date moves.
 *
 * Only touches tasks that still carry their original offset and haven't been
 * completed — if someone deliberately moved a date, we leave it alone.
 */
export async function shiftPlanDeadlines(
  weddingId: string,
  newStartDate: Date,
  options: { client?: Client } = {},
): Promise<{ updated: number }> {
  const client = options.client ?? db;
  const start = toCivil(newStartDate);

  const tasks = await client.task.findMany({
    where: {
      weddingId,
      archivedAt: null,
      offsetDays: { not: null },
      status: { notIn: ["DONE", "CANCELLED"] },
    },
    select: { id: true, offsetDays: true },
  });

  let updated = 0;
  for (const task of tasks) {
    if (task.offsetDays === null) continue;
    await client.task.update({
      where: { id: task.id },
      data: { dueDate: addDays(start, task.offsetDays) },
    });
    updated += 1;
  }

  return { updated };
}
