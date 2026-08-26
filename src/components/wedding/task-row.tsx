"use client";

/**
 * A task row.
 *
 * Optimistic completion: the checkbox flips instantly, the ring and counts
 * follow when the server confirms. If it fails, the tick comes back off and the
 * error surfaces rather than silently pretending.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn, toneClasses } from "@/lib/cn";
import { formatDueLabel } from "@/lib/dates";
import { formatCompactMoney } from "@/lib/money";
import { Badge, Avatar } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlays";
import { ClockIcon, LockIcon } from "@/components/ui/icons";
import { toggleTaskComplete } from "@/server/actions/tasks";
import type { TaskRowData } from "./task-row-data";

export type { TaskRowData };

export function TaskRow({
  task,
  onSelect,
  selected,
  onToggleSelect,
  showEvent = true,
  compact,
  canEdit = true,
}: {
  task: TaskRowData;
  onSelect?(id: string): void;
  selected?: boolean;
  onToggleSelect?(id: string, selected: boolean): void;
  showEvent?: boolean;
  compact?: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = React.useState(task.isDone);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setDone(task.isDone), [task.isDone]);

  async function toggle(next: boolean) {
    if (!canEdit) return;
    setDone(next);
    setPending(true);
    setError(null);
    try {
      const result = await toggleTaskComplete(task.id, next);
      if (!result.ok) {
        setDone(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setDone(!next);
      setError("Couldn't save that. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 transition-colors",
        compact ? "py-2" : "py-2.5",
        "px-3 hover:bg-surface-sunken/60",
        selected && "bg-saffron-soft/40",
      )}
    >
      {onToggleSelect ? (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={(event) => onToggleSelect(task.id, event.target.checked)}
          aria-label={`Select ${task.title}`}
          className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--color-saffron)]"
        />
      ) : null}

      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
        disabled={!canEdit || pending}
        onClick={() => toggle(!done)}
        className={cn(
          "mt-[1px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150",
          done
            ? "border-positive bg-positive text-white"
            : "border-line-strong bg-surface hover:border-saffron",
          !canEdit && "cursor-not-allowed opacity-50",
          pending && "opacity-60",
        )}
      >
        {done ? (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
            <path d="M2 5.5L4.5 8L9 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <button
            type="button"
            onClick={() => onSelect?.(task.id)}
            className={cn(
              "text-left text-[13.5px] leading-snug transition-colors",
              done ? "text-ink-faint line-through" : "text-ink",
              onSelect && "hover:text-saffron",
            )}
          >
            {task.title}
          </button>

          {task.importance >= 5 && !done ? (
            <Tooltip content="Essential — the wedding doesn't happen without this">
              <span className="text-[11px] text-saffron">●</span>
            </Tooltip>
          ) : null}

          {task.priority === "CRITICAL" && !done ? (
            <Badge variant="critical" size="xs">Critical</Badge>
          ) : null}
        </div>

        {!compact ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-muted">
            {task.dueDate && !done ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  task.isOverdue && "font-medium text-critical",
                )}
              >
                <ClockIcon size={11} />
                {formatDueLabel(new Date(task.dueDate))}
              </span>
            ) : null}

            {task.isBlocked ? (
              <Tooltip
                content={`Waiting on: ${task.blockedByTitles.join(", ")}`}
              >
                <span className="inline-flex items-center gap-1 text-attention">
                  <LockIcon size={11} />
                  Waiting on {task.blockedByTitles.length}
                </span>
              </Tooltip>
            ) : null}

            {task.downstreamCount > 0 && !done ? (
              <Tooltip content={`Finishing this unblocks ${task.downstreamCount} other ${task.downstreamCount === 1 ? "task" : "tasks"}`}>
                <span className="text-ink-muted">
                  Unblocks {task.downstreamCount}
                </span>
              </Tooltip>
            ) : null}

            {showEvent && task.eventName ? (
              <span className={cn("inline-flex items-center gap-1", toneClasses(task.eventTone).text)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", toneClasses(task.eventTone).dot)} />
                {task.eventName}
              </span>
            ) : null}

            {task.area ? <span className="text-ink-faint">{task.area}</span> : null}

            {task.subtaskCount > 0 ? (
              <span className="tabular">
                {task.subtasksDone}/{task.subtaskCount} subtasks
              </span>
            ) : null}

            {task.commentCount > 0 ? (
              <span className="tabular">{task.commentCount} 💬</span>
            ) : null}

            {task.estimatedCost ? (
              <span className="tabular">
                {formatCompactMoney(task.estimatedCost, task.currency)}
              </span>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-1 text-[11.5px] text-critical" role="alert">{error}</p>
        ) : null}
      </div>

      {task.ownerName ? (
        <Avatar name={task.ownerName} tone={task.ownerTone} size="sm" className="mt-0.5" />
      ) : (
        <Tooltip content="Nobody is handling this yet">
          <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line-strong text-[10px] text-ink-faint">
            ?
          </span>
        </Tooltip>
      )}
    </div>
  );
}
