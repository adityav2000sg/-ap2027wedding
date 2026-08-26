/**
 * The serialisable shape a task row renders from, and the mapper that produces
 * it.
 *
 * Deliberately *not* a client module: server components call `toTaskRow` while
 * building a page, then hand the plain result across the boundary.
 */

import type { AnalysedTask } from "@/domain/tasks";
import type { TaskPriority, TaskStatus } from "@/domain/types";

export interface TaskRowData {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  importance: number;
  isDone: boolean;
  isOverdue: boolean;
  isBlocked: boolean;
  daysLate: number;
  dueDate: string | null;
  ownerName: string | null;
  ownerTone: string | null;
  eventName: string | null;
  eventTone: string | null;
  area: string | null;
  blockedByTitles: string[];
  downstreamCount: number;
  estimatedCost: number | null;
  currency: string;
  subtaskCount: number;
  subtasksDone: number;
  commentCount: number;
}

export interface TaskRowLookup {
  members: Map<string, { name: string; tone: string }>;
  events: Map<string, { name: string; tone: string }>;
  currency: string;
}

export function toTaskRow(task: AnalysedTask, lookup: TaskRowLookup): TaskRowData {
  const owner = task.ownerId ? lookup.members.get(task.ownerId) : null;
  const event = task.eventId ? lookup.events.get(task.eventId) : null;

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    importance: task.importance,
    isDone: task.isDone,
    isOverdue: task.isOverdue,
    isBlocked: task.isBlocked,
    daysLate: task.daysLate,
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
    ownerName: owner?.name ?? null,
    ownerTone: owner?.tone ?? null,
    eventName: event?.name ?? null,
    eventTone: event?.tone ?? null,
    area: task.area,
    blockedByTitles: task.blockedBy.map((b) => b.title),
    downstreamCount: task.downstreamCount,
    estimatedCost: task.estimatedCost,
    currency: lookup.currency,
    subtaskCount: task.subtaskCount,
    subtasksDone: task.subtasksDone,
    commentCount: task.commentCount,
  };
}
