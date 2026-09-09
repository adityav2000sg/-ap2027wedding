"use client";

/**
 * Handing a task to somebody, from the row.
 *
 * Dividing up four hundred tasks is one long sitting, and doing it through a
 * detail sheet would be four hundred round trips. This opens on the avatar,
 * takes one tap per person, and stays open so a task can go to two or three
 * people before you move on.
 *
 * Owner and tagged are kept distinct because they mean different things — one
 * person is responsible, the others are kept in the loop — but both are set
 * from the same place, since in the moment you're just deciding who's involved.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/primitives";
import { Popover, Tooltip } from "@/components/ui/overlays";
import { CheckIcon } from "@/components/ui/icons";
import { updateTask } from "@/server/actions/tasks";

export interface AssignableMember {
  id: string;
  name: string;
  tone: string;
}

export function AssignMenu({
  taskId,
  ownerId,
  ownerName,
  ownerTone,
  collaboratorIds,
  members,
  canEdit,
  className,
}: {
  taskId: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerTone: string | null;
  collaboratorIds: string[];
  members: AssignableMember[];
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const tagged = members.filter((m) => collaboratorIds.includes(m.id));

  async function apply(patch: Record<string, unknown>) {
    setPending(true);
    await updateTask({ id: taskId, ...patch });
    setPending(false);
    router.refresh();
  }

  /** First tap makes them the owner; tapping the owner again clears them. */
  async function toggleOwner(memberId: string) {
    await apply({
      ownerId: ownerId === memberId ? null : memberId,
      // Somebody being handed the task shouldn't also sit in the tagged list.
      collaboratorIds: collaboratorIds.filter((id) => id !== memberId),
    });
  }

  async function toggleTagged(memberId: string) {
    const next = collaboratorIds.includes(memberId)
      ? collaboratorIds.filter((id) => id !== memberId)
      : [...collaboratorIds, memberId];
    await apply({ collaboratorIds: next });
  }

  const trigger = (
    <motion.button
      type="button"
      whileTap={reduce || !canEdit ? undefined : { scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      aria-label={ownerName ? `${ownerName} is handling this` : "Nobody is handling this — assign it"}
      className={cn(
        "mt-0.5 flex shrink-0 items-center transition-opacity",
        pending && "opacity-50",
        canEdit ? "cursor-pointer" : "cursor-default",
        className,
      )}
    >
      {ownerName ? (
        <span className="flex items-center -space-x-1.5">
          <Avatar name={ownerName} tone={ownerTone ?? "slate"} size="sm" />
          {tagged.slice(0, 2).map((member) => (
            <Avatar
              key={member.id}
              name={member.name}
              tone={member.tone}
              size="sm"
              className="opacity-70 ring-2 ring-canvas"
            />
          ))}
          {tagged.length > 2 ? (
            <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-surface-sunken text-[9.5px] text-ink-muted ring-2 ring-canvas">
              +{tagged.length - 2}
            </span>
          ) : null}
        </span>
      ) : (
        <span
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed text-[10px] transition-colors",
            canEdit
              ? "border-line-strong text-ink-faint hover:border-saffron hover:text-saffron"
              : "border-line-strong text-ink-faint",
          )}
        >
          +
        </span>
      )}
    </motion.button>
  );

  if (!canEdit) {
    return (
      <Tooltip content={ownerName ?? "Nobody is handling this yet"}>{trigger}</Tooltip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-60 p-1"
      trigger={trigger}
    >
      <div className="border-b border-line px-2.5 pb-1.5 pt-1">
        <p className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">
          Who's handling it
        </p>
      </div>

      <div className="py-1">
        {members.map((member) => {
          const isOwner = member.id === ownerId;
          const isTagged = collaboratorIds.includes(member.id);
          return (
            <div
              key={member.id}
              className="flex items-center gap-1 rounded-lg px-1 transition-colors hover:bg-surface-sunken"
            >
              <button
                type="button"
                onClick={() => toggleOwner(member.id)}
                disabled={pending}
                className="flex min-h-[36px] min-w-0 flex-1 items-center gap-2 px-1.5 text-left"
              >
                <Avatar name={member.name} tone={member.tone} size="xs" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    isOwner ? "text-saffron" : "text-ink-soft",
                  )}
                >
                  {member.name}
                </span>
                {isOwner ? <CheckIcon size={13} className="shrink-0 text-saffron" /> : null}
              </button>

              {/* Tagging is the secondary act, so it gets the smaller target. */}
              {!isOwner ? (
                <button
                  type="button"
                  onClick={() => toggleTagged(member.id)}
                  disabled={pending}
                  title={isTagged ? "Remove from the loop" : "Keep in the loop"}
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-1 text-[10px] uppercase tracking-[0.06em] transition-colors",
                    isTagged
                      ? "bg-saffron-soft text-saffron"
                      : "text-ink-faint hover:bg-surface-sunken hover:text-ink-muted",
                  )}
                >
                  {isTagged ? "Tagged" : "Tag"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {ownerId ? (
        <div className="border-t border-line pt-1">
          <button
            type="button"
            onClick={() => apply({ ownerId: null, collaboratorIds: [] })}
            disabled={pending}
            className="flex min-h-[34px] w-full items-center rounded-lg px-2.5 text-left text-[12.5px] text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            Clear everyone
          </button>
        </div>
      ) : null}
    </Popover>
  );
}
