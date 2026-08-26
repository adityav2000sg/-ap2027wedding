"use client";

/**
 * Tasks.
 *
 * Saved views down the side, an editorial list in the middle, and a detail
 * sheet that stays in context. Bulk actions appear only once something is
 * selected, so the default state is quiet.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatDueLabel, formatMediumDate, toDateInput } from "@/lib/dates";
import { Avatar, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { SearchIcon } from "@/components/ui/icons";
import { TaskRow } from "@/components/wedding/task-row";
import type { TaskRowData } from "@/components/wedding/task-row-data";
import {
  addTaskComment,
  archiveTask,
  bulkUpdateTasks,
  updateTask,
} from "@/server/actions/tasks";

interface Task extends TaskRowData {
  ownerId: string | null;
  eventId: string | null;
  description: string | null;
  phase: string;
  leverage: number;
  blockedBy: { id: string; title: string; status: string }[];
  blocking: { id: string; title: string }[];
}

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "blocked", label: "Waiting on" },
  { key: "unassigned", label: "No owner" },
  { key: "soon", label: "Next 30 days" },
  { key: "done", label: "Done" },
  { key: "all", label: "Everything" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started", IN_PROGRESS: "In progress", WAITING: "Waiting on",
  BLOCKED: "Blocked", REVIEW: "Needs review", DONE: "Done", CANCELLED: "Cancelled",
};

export function TasksWorkspace({
  tasks, members, events, areas, stats, canEdit, viewerMemberId,
  initialView, initialTaskId, initialOwner, initialEvent,
}: {
  tasks: Task[];
  members: { id: string; name: string; tone: string; relation: string }[];
  events: { id: string; name: string; tone: string }[];
  areas: string[];
  stats: Record<string, number>;
  canEdit: boolean;
  viewerMemberId: string;
  initialView: string;
  initialTaskId: string | null;
  initialOwner: string | null;
  initialEvent: string | null;
  readinessPercent: number;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [view, setView] = React.useState(
    initialOwner === "unassigned" ? "unassigned" : initialView,
  );
  const [query, setQuery] = React.useState("");
  const [area, setArea] = React.useState<string>("");
  const [eventId, setEventId] = React.useState<string>(initialEvent ?? "");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [openTask, setOpenTask] = React.useState<string | null>(initialTaskId);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    return tasks
      .filter((task) => {
        switch (view) {
          case "open": return !task.isDone && task.status !== "CANCELLED";
          case "mine": return task.ownerId === viewerMemberId && !task.isDone;
          case "overdue": return task.isOverdue;
          case "blocked": return task.isBlocked && !task.isDone;
          case "unassigned": return !task.ownerId && !task.isDone;
          case "soon":
            return (
              !task.isDone &&
              task.dueDate !== null &&
              new Date(task.dueDate).getTime() <= Date.now() + 30 * 86_400_000
            );
          case "done": return task.isDone;
          default: return true;
        }
      })
      .filter((task) => !area || task.area === area)
      .filter((task) => !eventId || task.eventId === eventId)
      .filter((task) => !q || task.title.toLowerCase().includes(q))
      .sort((a, b) => {
        if (view === "done") {
          return (b.dueDate ?? "").localeCompare(a.dueDate ?? "");
        }
        return b.leverage - a.leverage;
      });
  }, [tasks, view, area, eventId, query, viewerMemberId]);

  // Group by area so a 478-task list reads as sections, not a wall.
  const grouped = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filtered) {
      const key = task.area ?? "Other";
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const active = tasks.find((t) => t.id === openTask) ?? null;

  async function applyBulk(patch: Record<string, unknown>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSelected(new Set());
    await bulkUpdateTasks({ ids, ...patch });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">The plan</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] leading-tight text-ink">Tasks</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              {stats.done} done · {stats.total - stats.done} open
              {stats.overdue > 0 ? (
                <span className="text-critical"> · {stats.overdue} overdue</span>
              ) : null}
            </p>
          </div>

          <div className="relative">
            <SearchIcon
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="h-8 w-56 pl-8 text-[12.5px]"
            />
          </div>
        </div>
      </header>

      {/* Views */}
      <div className="-mx-5 mb-4 overflow-x-auto px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max items-center gap-1 border-b border-line">
          {VIEWS.map((v) => {
            const isActive = v.key === view;
            const count =
              v.key === "mine" ? stats.mine
              : v.key === "overdue" ? stats.overdue
              : v.key === "blocked" ? stats.blocked
              : v.key === "unassigned" ? stats.unassigned
              : v.key === "done" ? stats.done
              : null;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-[13px] transition-colors",
                  isActive ? "text-ink" : "text-ink-muted hover:text-ink-soft",
                )}
              >
                {v.label}
                {count !== null && count > 0 ? (
                  <span
                    className={cn(
                      "tabular text-[11px]",
                      v.key === "overdue" ? "text-critical" : "text-ink-faint",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
                {isActive ? (
                  <motion.span
                    layoutId={reduce ? undefined : "task-view"}
                    className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-saffron"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="h-8 w-auto min-w-[150px] text-[12.5px]"
        >
          <option value="">Every area</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="h-8 w-auto min-w-[150px] text-[12.5px]"
        >
          <option value="">Every function</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <span className="tabular text-[12px] text-ink-muted">
          {filtered.length} {filtered.length === 1 ? "task" : "tasks"}
        </span>
      </div>

      {/* Bulk bar */}
      <AnimatePresence>
        {selected.size > 0 && canEdit ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-saffron/25 bg-saffron-soft px-3 py-2"
          >
            <span className="tabular text-[12.5px] font-medium text-saffron">
              {selected.size} selected
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Button variant="secondary" size="xs" onClick={() => applyBulk({ status: "DONE" })}>
                Mark done
              </Button>
              <Button variant="secondary" size="xs" onClick={() => applyBulk({ status: "IN_PROGRESS" })}>
                In progress
              </Button>
              <Select
                className="h-7 w-auto text-[12px]"
                defaultValue=""
                onChange={(e) => e.target.value && applyBulk({ ownerId: e.target.value })}
              >
                <option value="">Assign to…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
              <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          title={
            view === "overdue" ? "Nothing is overdue"
            : view === "mine" ? "Nothing assigned to you"
            : view === "blocked" ? "Nothing is waiting on anything else"
            : "No tasks match"
          }
          description={
            view === "overdue"
              ? "Everything with a date on it is still in hand."
              : "Try a different view, or clear the filters."
          }
        />
      ) : (
        <div className="space-y-7">
          {grouped.map(([areaName, areaTasks]) => (
            <section key={areaName}>
              <div className="rule-heading mb-1">
                <h2 className="flex items-baseline gap-2 font-display text-[17px] text-ink">
                  {areaName}
                  <span className="tabular text-[11.5px] font-normal text-ink-muted">
                    {areaTasks.length}
                  </span>
                </h2>
              </div>
              <div className="-mx-3 divide-y divide-line">
                {areaTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    canEdit={canEdit}
                    onSelect={setOpenTask}
                    selected={selected.has(task.id)}
                    onToggleSelect={
                      canEdit
                        ? (id, isSelected) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (isSelected) next.add(id);
                              else next.delete(id);
                              return next;
                            })
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <TaskSheet
        task={active}
        members={members}
        events={events}
        canEdit={canEdit}
        onClose={() => setOpenTask(null)}
        onChanged={() => router.refresh()}
        onOpenTask={setOpenTask}
      />
    </div>
  );
}

function TaskSheet({
  task, members, events, canEdit, onClose, onChanged, onOpenTask,
}: {
  task: Task | null;
  members: { id: string; name: string; tone: string }[];
  events: { id: string; name: string }[];
  canEdit: boolean;
  onClose(): void;
  onChanged(): void;
  onOpenTask(id: string): void;
}) {
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState(false);

  if (!task) return null;

  async function patch(data: Record<string, unknown>) {
    if (!task) return;
    await updateTask({ id: task.id, ...data });
    onChanged();
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={task.title}
      description={[task.area, task.eventName].filter(Boolean).join(" · ")}
      width="md"
      footer={
        canEdit ? (
          <div className="flex justify-between">
            <Button
              variant="dangerGhost"
              size="sm"
              onClick={async () => {
                await archiveTask(task.id);
                onClose();
                onChanged();
              }}
            >
              Remove task
            </Button>
            <Button
              variant={task.isDone ? "secondary" : "primary"}
              size="sm"
              onClick={() => patch({ status: task.isDone ? "NOT_STARTED" : "DONE" })}
            >
              {task.isDone ? "Reopen" : "Mark done"}
            </Button>
          </div>
        ) : null
      }
    >
      {task.isBlocked ? (
        <div className="mb-4 rounded-lg border border-attention/25 bg-attention-soft px-3 py-2.5">
          <p className="text-[12.5px] font-medium text-attention">
            Waiting on {task.blockedBy.length} other {task.blockedBy.length === 1 ? "task" : "tasks"}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {task.blockedBy.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(b.id)}
                  className="text-[12.5px] text-ink-soft hover:text-saffron hover:underline"
                >
                  {b.title}
                  <span className="ml-1.5 text-ink-faint">{STATUS_LABEL[b.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {task.downstreamCount > 0 ? (
        <div className="mb-4 rounded-lg border border-line bg-surface-soft px-3 py-2.5">
          <p className="text-[12.5px] text-ink-soft">
            Finishing this unblocks{" "}
            <span className="font-medium text-ink">{task.downstreamCount}</span>{" "}
            {task.downstreamCount === 1 ? "task" : "tasks"}.
          </p>
          {task.blocking.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {task.blocking.slice(0, 4).map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(b.id)}
                    className="text-[12.5px] text-ink-muted hover:text-saffron hover:underline"
                  >
                    {b.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Status" htmlFor="t-status">
          <Select
            id="t-status"
            value={task.status}
            disabled={!canEdit}
            onChange={(e) => patch({ status: e.target.value })}
          >
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Who's handling this?" htmlFor="t-owner">
          <Select
            id="t-owner"
            value={task.ownerId ?? ""}
            disabled={!canEdit}
            onChange={(e) => patch({ ownerId: e.target.value })}
          >
            <option value="">Nobody yet</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </FormField>

        <FormField label="Due" htmlFor="t-due">
          <Input
            id="t-due"
            type="date"
            defaultValue={toDateInput(task.dueDate ? new Date(task.dueDate) : null)}
            disabled={!canEdit}
            onChange={(e) => patch({ dueDate: e.target.value })}
          />
        </FormField>

        <FormField label="How urgent?" htmlFor="t-priority">
          <Select
            id="t-priority"
            value={task.priority}
            disabled={!canEdit}
            onChange={(e) => patch({ priority: e.target.value })}
          >
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </FormField>

        <FormField label="Which function" className="sm:col-span-2" htmlFor="t-event">
          <Select
            id="t-event"
            value={task.eventId ?? ""}
            disabled={!canEdit}
            onChange={(e) => patch({ eventId: e.target.value })}
          >
            <option value="">The whole wedding</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </FormField>
      </div>

      <div className="mt-4">
        <FormField label="Notes" htmlFor="t-desc">
          <Textarea
            id="t-desc"
            defaultValue={task.description ?? ""}
            disabled={!canEdit}
            placeholder="Anything worth remembering…"
            onBlur={(e) => {
              if (e.target.value !== (task.description ?? "")) {
                patch({ description: e.target.value });
              }
            }}
          />
        </FormField>
      </div>

      {canEdit ? (
        <div className="mt-5">
          <h4 className="eyebrow mb-2">Add a comment</h4>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Leave a note for the family…"
          />
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            disabled={pending || comment.trim().length === 0}
            onClick={async () => {
              setPending(true);
              await addTaskComment({ taskId: task.id, body: comment });
              setComment("");
              setPending(false);
              onChanged();
            }}
          >
            {pending ? "Posting…" : "Post comment"}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
