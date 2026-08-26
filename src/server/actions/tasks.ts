"use server";

import { z } from "zod";

import { formatDueLabel } from "@/lib/dates";
import { analyseTasks, wouldCreateCycle } from "@/domain/tasks";
import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import { fetchSnapshot } from "@/server/snapshot-query";
import {
  civilDate,
  optionalCivilDate,
  optionalId,
  optionalMoney,
  optionalString,
  revalidateWedding,
  withAction,
} from "./shared";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "WAITING", "BLOCKED", "REVIEW", "DONE", "CANCELLED"] as const;
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the task a name.").max(200),
  description: optionalString.optional(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  importance: z.coerce.number().int().min(1).max(5).default(3),
  dueDate: optionalCivilDate.optional(),
  ownerId: optionalId.optional(),
  eventId: optionalId.optional(),
  vendorId: optionalId.optional(),
  categoryId: optionalId.optional(),
  parentId: optionalId.optional(),
  estimatedCost: optionalMoney.optional(),
});

export async function createTask(input: unknown) {
  return withAction("tasks.edit", async (viewer) => {
    const data = createSchema.parse(input);

    const task = await db.task.create({
      data: {
        weddingId: viewer.weddingId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        importance: data.importance,
        dueDate: data.dueDate ?? null,
        ownerId: data.ownerId ?? null,
        eventId: data.eventId ?? null,
        vendorId: data.vendorId ?? null,
        categoryId: data.categoryId ?? null,
        parentId: data.parentId ?? null,
        estimatedCost: data.estimatedCost ?? null,
        createdById: viewer.memberId,
      },
      select: { id: true, title: true, dueDate: true },
    });

    await logViewerActivity(viewer, {
      entityType: "task",
      entityId: task.id,
      entityLabel: task.title,
      action: "created",
      summary: `${viewer.name} added the task “${task.title}”${
        task.dueDate ? `, ${formatDueLabel(task.dueDate).toLowerCase()}` : ""
      }.`,
      after: { title: task.title, priority: data.priority },
    });

    revalidateWedding();
    return { id: task.id };
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  description: optionalString.optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  importance: z.coerce.number().int().min(1).max(5).optional(),
  dueDate: optionalCivilDate.optional(),
  startDate: optionalCivilDate.optional(),
  ownerId: optionalId.optional(),
  eventId: optionalId.optional(),
  vendorId: optionalId.optional(),
  categoryId: optionalId.optional(),
  budgetItemId: optionalId.optional(),
  estimatedCost: optionalMoney.optional(),
});

export async function updateTask(input: unknown) {
  return withAction("tasks.edit", async (viewer) => {
    const { id, ...patch } = updateSchema.parse(input);

    const existing = await db.task.findFirst({
      where: { id, weddingId: viewer.weddingId },
    });
    if (!existing) throw new Error("That task no longer exists.");

    // Completion timestamps are derived from status, never set by hand.
    const completedAt =
      patch.status === undefined
        ? undefined
        : patch.status === "DONE"
          ? existing.completedAt ?? new Date()
          : null;

    const updated = await db.task.update({
      where: { id },
      data: { ...patch, ...(completedAt !== undefined ? { completedAt } : {}) },
      select: { id: true, title: true, status: true },
    });

    const summary = describeTaskChange(viewer.name, existing, patch);
    if (summary) {
      await logViewerActivity(viewer, {
        entityType: "task",
        entityId: updated.id,
        entityLabel: updated.title,
        action: patch.status === "DONE" ? "completed" : "updated",
        summary,
        before: snapshotOf(existing, patch),
        after: patch as Record<string, unknown>,
        undoable: true,
      });
    }

    revalidateWedding();
    return { id: updated.id, status: updated.status };
  });
}

/** Fast path for the checkbox on a task row. */
export async function toggleTaskComplete(id: string, done: boolean) {
  return updateTask({ id, status: done ? "DONE" : "NOT_STARTED" });
}

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one task."),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  ownerId: optionalId.optional(),
  dueDate: optionalCivilDate.optional(),
});

export async function bulkUpdateTasks(input: unknown) {
  return withAction("tasks.edit", async (viewer) => {
    const { ids, ...patch } = bulkSchema.parse(input);

    const result = await db.$transaction(async (tx) => {
      const owned = await tx.task.findMany({
        where: { id: { in: ids }, weddingId: viewer.weddingId },
        select: { id: true },
      });
      const ownedIds = owned.map((t) => t.id);
      if (ownedIds.length === 0) return { count: 0 };

      await tx.task.updateMany({
        where: { id: { in: ownedIds } },
        data: {
          ...patch,
          ...(patch.status === "DONE"
            ? { completedAt: new Date() }
            : patch.status
              ? { completedAt: null }
              : {}),
        },
      });
      return { count: ownedIds.length };
    });

    if (result.count > 0) {
      await logViewerActivity(viewer, {
        entityType: "task",
        action: "bulk_updated",
        summary: `${viewer.name} updated ${result.count} ${result.count === 1 ? "task" : "tasks"}.`,
        after: patch as Record<string, unknown>,
      });
    }

    revalidateWedding();
    return result;
  });
}

export async function archiveTask(id: string) {
  return withAction("tasks.edit", async (viewer) => {
    const task = await db.task.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, title: true },
    });
    if (!task) throw new Error("That task no longer exists.");

    await db.task.update({ where: { id }, data: { archivedAt: new Date() } });

    await logViewerActivity(viewer, {
      entityType: "task",
      entityId: task.id,
      entityLabel: task.title,
      action: "archived",
      summary: `${viewer.name} removed the task “${task.title}”.`,
      undoable: true,
    });

    revalidateWedding();
    return { id: task.id };
  });
}

// ─────────────────────────────────────────────────────────────── Dependencies

export async function addTaskDependency(taskId: string, dependsOnId: string) {
  return withAction("tasks.edit", async (viewer) => {
    if (taskId === dependsOnId) {
      throw new Error("A task can't wait on itself.");
    }

    const snapshot = await fetchSnapshot(viewer.weddingId);
    const both = snapshot.tasks.filter((t) => t.id === taskId || t.id === dependsOnId);
    if (both.length !== 2) throw new Error("One of those tasks no longer exists.");

    // Guard the graph before writing, so it can never contain a cycle.
    if (wouldCreateCycle(snapshot.dependencies, taskId, dependsOnId)) {
      throw new Error(
        "That would create a loop — these two tasks would end up waiting on each other.",
      );
    }

    await db.taskDependency.create({ data: { taskId, dependsOnId } });

    const task = snapshot.tasks.find((t) => t.id === taskId)!;
    const prerequisite = snapshot.tasks.find((t) => t.id === dependsOnId)!;

    await logViewerActivity(viewer, {
      entityType: "task",
      entityId: taskId,
      entityLabel: task.title,
      action: "dependency_added",
      summary: `${viewer.name} made “${task.title}” wait on “${prerequisite.title}”.`,
    });

    revalidateWedding();
    return { taskId, dependsOnId };
  });
}

export async function removeTaskDependency(taskId: string, dependsOnId: string) {
  return withAction("tasks.edit", async (viewer) => {
    const task = await db.task.findFirst({
      where: { id: taskId, weddingId: viewer.weddingId },
      select: { id: true, title: true },
    });
    if (!task) throw new Error("That task no longer exists.");

    await db.taskDependency.deleteMany({ where: { taskId, dependsOnId } });

    await logViewerActivity(viewer, {
      entityType: "task",
      entityId: taskId,
      entityLabel: task.title,
      action: "dependency_removed",
      summary: `${viewer.name} removed a dependency from “${task.title}”.`,
    });

    revalidateWedding();
    return { taskId };
  });
}

/**
 * What does delaying this task actually cost? Used by the task sheet to show
 * "this affects N downstream tasks" before someone pushes a date.
 */
export async function previewTaskDelay(taskId: string) {
  return withAction("tasks.edit", async (viewer) => {
    const snapshot = await fetchSnapshot(viewer.weddingId);
    const analysed = analyseTasks(snapshot);
    const task = analysed.find((t) => t.id === taskId);
    if (!task) throw new Error("That task no longer exists.");

    return {
      downstreamCount: task.downstreamCount,
      directDependents: task.blocking,
    };
  });
}

// ─────────────────────────────────────────────────────────────────── Comments

const commentSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().trim().min(1, "Write something first.").max(2000),
});

export async function addTaskComment(input: unknown) {
  return withAction("tasks.edit", async (viewer) => {
    const data = commentSchema.parse(input);

    const task = await db.task.findFirst({
      where: { id: data.taskId, weddingId: viewer.weddingId },
      select: { id: true, title: true },
    });
    if (!task) throw new Error("That task no longer exists.");

    const comment = await db.taskComment.create({
      data: { taskId: task.id, authorId: viewer.memberId, body: data.body },
      select: { id: true },
    });

    await logViewerActivity(viewer, {
      entityType: "task",
      entityId: task.id,
      entityLabel: task.title,
      action: "commented",
      summary: `${viewer.name} commented on “${task.title}”.`,
    });

    revalidateWedding();
    return { id: comment.id };
  });
}

// ──────────────────────────────────────────────────────────────────── Helpers

const FIELD_LABELS: Record<string, string> = {
  status: "status",
  priority: "priority",
  dueDate: "due date",
  ownerId: "who's handling it",
  importance: "importance",
  title: "name",
};

const STATUS_TEXT: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting on",
  BLOCKED: "Blocked",
  REVIEW: "Needs review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

function describeTaskChange(
  actor: string,
  before: { title: string; status: string; dueDate: Date | null },
  patch: Record<string, unknown>,
): string | null {
  if (patch.status === "DONE") {
    return `${actor} completed “${before.title}”.`;
  }
  if (patch.status && patch.status !== before.status) {
    return `${actor} moved “${before.title}” from ${STATUS_TEXT[before.status] ?? before.status} to ${STATUS_TEXT[patch.status as string] ?? patch.status}.`;
  }
  if (patch.dueDate !== undefined) {
    const next = patch.dueDate as Date | null;
    if (next?.getTime() !== before.dueDate?.getTime()) {
      return next
        ? `${actor} moved “${before.title}” to ${formatDueLabel(next).replace(/^Due /, "")}.`
        : `${actor} cleared the due date on “${before.title}”.`;
    }
  }

  const changed = Object.keys(patch).filter(
    (key) => patch[key] !== undefined && key in FIELD_LABELS,
  );
  if (changed.length === 0) return null;
  return `${actor} updated the ${changed.map((k) => FIELD_LABELS[k]).join(" and ")} on “${before.title}”.`;
}

function snapshotOf(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) continue;
    const value = existing[key];
    before[key] = value instanceof Date ? value.toISOString() : value;
  }
  return before;
}
