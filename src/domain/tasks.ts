/**
 * Task engine.
 *
 * Adds the derived state the database deliberately doesn't store: is this
 * blocked, is it late, what is it holding up, and how much does it matter.
 * "Blocked" is computed from dependencies rather than typed by a human, so it
 * can never drift out of sync with reality.
 */

import { daysBetween } from "@/lib/dates";
import type {
  DependencyEdge,
  TaskNode,
  TaskPriority,
  TaskStatus,
  WeddingSnapshot,
} from "./types";

export const OPEN_STATUSES: TaskStatus[] = [
  "NOT_STARTED", "IN_PROGRESS", "WAITING", "BLOCKED", "REVIEW",
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting on",
  BLOCKED: "Blocked",
  REVIEW: "Needs review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

/**
 * Readiness weight per importance level. Exponential on purpose: confirming the
 * Shaadi venue (5) must not be worth the same as buying safety pins (1).
 */
export const IMPORTANCE_WEIGHT: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 8, 5: 16,
};

/** How "done" a status counts as when scoring readiness. */
const STATUS_PROGRESS: Record<TaskStatus, number> = {
  DONE: 1,
  REVIEW: 0.85,
  IN_PROGRESS: 0.5,
  WAITING: 0.3,
  BLOCKED: 0.15,
  NOT_STARTED: 0,
  CANCELLED: 0,
};

export interface AnalysedTask extends TaskNode {
  /** Prerequisite tasks that are not finished. */
  blockedBy: { id: string; title: string; status: TaskStatus }[];
  /** Tasks that cannot start until this one is done. */
  blocking: { id: string; title: string }[];
  /** Everything downstream, transitively — the true cost of a slip. */
  downstreamCount: number;
  isBlocked: boolean;
  isOverdue: boolean;
  daysLate: number;
  daysUntilDue: number | null;
  isDone: boolean;
  weight: number;
  progress: number;
  subtaskCount: number;
  subtasksDone: number;
  /** Ranking score used by "Next best actions". Higher = do it sooner. */
  leverage: number;
}

export function analyseTasks(snapshot: WeddingSnapshot): AnalysedTask[] {
  const { tasks, dependencies, today } = snapshot;
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const prerequisites = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const edge of dependencies) {
    push(prerequisites, edge.taskId, edge.dependsOnId);
    push(dependents, edge.dependsOnId, edge.taskId);
  }

  const subtaskCounts = new Map<string, { total: number; done: number }>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const entry = subtaskCounts.get(task.parentId) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (task.status === "DONE") entry.done += 1;
    subtaskCounts.set(task.parentId, entry);
  }

  const downstreamCache = new Map<string, number>();

  return tasks.map((task) => {
    const isDone = task.status === "DONE";
    const blockedBy = (prerequisites.get(task.id) ?? [])
      .map((id) => byId.get(id))
      .filter((t): t is TaskNode => Boolean(t))
      .filter((t) => t.status !== "DONE" && t.status !== "CANCELLED")
      .map((t) => ({ id: t.id, title: t.title, status: t.status }));

    const blocking = (dependents.get(task.id) ?? [])
      .map((id) => byId.get(id))
      .filter((t): t is TaskNode => Boolean(t))
      .map((t) => ({ id: t.id, title: t.title }));

    const daysUntilDue = task.dueDate ? daysBetween(today, new Date(task.dueDate)) : null;
    const isOverdue =
      !isDone && task.status !== "CANCELLED" && daysUntilDue !== null && daysUntilDue < 0;

    const analysed: AnalysedTask = {
      ...task,
      blockedBy,
      blocking,
      downstreamCount: countDownstream(task.id, dependents, downstreamCache),
      isBlocked: !isDone && blockedBy.length > 0,
      isOverdue,
      daysLate: isOverdue && daysUntilDue !== null ? -daysUntilDue : 0,
      daysUntilDue,
      isDone,
      weight: IMPORTANCE_WEIGHT[task.importance] ?? 4,
      progress: STATUS_PROGRESS[task.status] ?? 0,
      subtaskCount: subtaskCounts.get(task.id)?.total ?? 0,
      subtasksDone: subtaskCounts.get(task.id)?.done ?? 0,
      leverage: 0,
    };

    analysed.leverage = computeLeverage(analysed);
    return analysed;
  });
}

/**
 * Prioritisation for "Next best actions". Deliberately multi-factor: a task
 * that is late, critical, and blocking four other things should outrank a
 * high-priority task due next month that blocks nothing.
 */
function computeLeverage(task: AnalysedTask): number {
  if (task.isDone || task.status === "CANCELLED") return 0;

  let score = 0;

  // Importance is the backbone.
  score += task.weight * 4;

  // Urgency: steep once inside a fortnight.
  if (task.daysUntilDue !== null) {
    if (task.daysUntilDue < 0) score += 60 + Math.min(task.daysLate, 30) * 2;
    else if (task.daysUntilDue === 0) score += 50;
    else if (task.daysUntilDue <= 3) score += 40;
    else if (task.daysUntilDue <= 7) score += 28;
    else if (task.daysUntilDue <= 14) score += 18;
    else if (task.daysUntilDue <= 30) score += 8;
  } else {
    // No due date on an important task is itself a problem worth surfacing.
    score += task.importance >= 4 ? 10 : 0;
  }

  score += PRIORITY_RANK[task.priority] === 0 ? 25 : (3 - PRIORITY_RANK[task.priority]) * 6;

  // Unblocking work is the highest-leverage thing a person can do.
  score += task.downstreamCount * 12;

  // Financially material tasks matter more.
  if (task.estimatedCost) score += Math.min(20, task.estimatedCost / 50_000);

  if (task.isMilestone) score += 15;

  // A blocked task can't be actioned — push it down, don't hide it.
  if (task.isBlocked) score *= 0.35;

  // Unassigned important work needs an owner before anything else happens.
  if (!task.ownerId && task.importance >= 4) score += 12;

  return Math.round(score);
}

function countDownstream(
  taskId: string,
  dependents: Map<string, string[]>,
  cache: Map<string, number>,
  seen: Set<string> = new Set(),
): number {
  const cached = cache.get(taskId);
  if (cached !== undefined) return cached;
  if (seen.has(taskId)) return 0; // Cycle guard — bad data shouldn't hang a page.
  seen.add(taskId);

  const direct = dependents.get(taskId) ?? [];
  let total = direct.length;
  for (const child of direct) {
    total += countDownstream(child, dependents, cache, seen);
  }
  cache.set(taskId, total);
  return total;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// ─────────────────────────────────────────────────────────────────── Selectors

export function openTasks(tasks: AnalysedTask[]): AnalysedTask[] {
  return tasks.filter((t) => OPEN_STATUSES.includes(t.status));
}

export function overdueTasks(tasks: AnalysedTask[]): AnalysedTask[] {
  return tasks.filter((t) => t.isOverdue).sort((a, b) => b.daysLate - a.daysLate);
}

export function blockedTasks(tasks: AnalysedTask[]): AnalysedTask[] {
  return tasks.filter((t) => t.isBlocked && !t.isDone);
}

/** The ordered "do these next" list that drives Home. */
export function nextBestActions(tasks: AnalysedTask[], limit = 6): AnalysedTask[] {
  return openTasks(tasks)
    .filter((t) => !t.isBlocked)
    .sort((a, b) => b.leverage - a.leverage || compareDue(a, b))
    .slice(0, limit);
}

export function dueWithin(tasks: AnalysedTask[], days: number): AnalysedTask[] {
  return openTasks(tasks)
    .filter((t) => t.daysUntilDue !== null && t.daysUntilDue >= 0 && t.daysUntilDue <= days)
    .sort(compareDue);
}

export function compareDue(a: AnalysedTask, b: AnalysedTask): number {
  if (a.dueDate && b.dueDate) {
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  }
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

export function completionVelocity(
  tasks: TaskNode[],
  today: Date,
  weeks = 8,
): { weekStart: Date; completed: number }[] {
  const buckets: { weekStart: Date; completed: number }[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - i * 7 - start.getUTCDay());
    buckets.push({ weekStart: new Date(start), completed: 0 });
  }

  for (const task of tasks) {
    if (!task.completedAt) continue;
    const at = new Date(task.completedAt).getTime();
    for (let i = buckets.length - 1; i >= 0; i -= 1) {
      if (at >= buckets[i].weekStart.getTime()) {
        buckets[i].completed += 1;
        break;
      }
    }
  }
  return buckets;
}

/**
 * Detects whether adding `dependsOnId` as a prerequisite of `taskId` would
 * create a cycle. Called before writing, so the graph stays acyclic.
 */
export function wouldCreateCycle(
  dependencies: DependencyEdge[],
  taskId: string,
  dependsOnId: string,
): boolean {
  if (taskId === dependsOnId) return true;
  const prerequisites = new Map<string, string[]>();
  for (const edge of dependencies) push(prerequisites, edge.taskId, edge.dependsOnId);

  const stack = [dependsOnId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(prerequisites.get(current) ?? []));
  }
  return false;
}
