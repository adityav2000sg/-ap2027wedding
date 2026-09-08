"use client";

/**
 * The bell.
 *
 * Deliberately quiet: a dot rather than a number until there's something, and
 * everything marked read the moment the panel is opened. A badge that survives
 * being looked at is a badge people learn to ignore.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import { BellIcon } from "@/components/ui/icons";
import { formatTimeAgo } from "@/lib/dates";
import { markAllNotificationsRead } from "@/server/actions/notifications";

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
  actorName: string | null;
}

const KIND_TONE: Record<string, string> = {
  ASSIGNED: "text-saffron",
  TAGGED: "text-info",
  MENTIONED: "text-info",
  DUE_SOON: "text-attention",
  OVERDUE: "text-critical",
  COMMENTED: "text-ink-muted",
};

export function NotificationBell({
  items,
  unread,
  className,
}: {
  items: NotificationItem[];
  unread: number;
  className?: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [, startTransition] = useTransition();
  const [open, setOpen] = React.useState(false);

  function handleOpen(next: boolean) {
    setOpen(next);
    // Opening the panel is reading them. Nothing else marks them read, so the
    // badge can't linger over things you've already seen.
    if (next && unread > 0) {
      startTransition(async () => {
        await markAllNotificationsRead();
        router.refresh();
      });
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={handleOpen}
      align="end"
      className="w-[320px] p-0"
      trigger={
        <motion.button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          whileTap={reduce ? undefined : { scale: 0.94 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-xl text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink-soft",
            className,
          )}
        >
          <BellIcon size={17} />
          {unread > 0 ? (
            <motion.span
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 24 }}
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-critical ring-2 ring-surface-soft"
            />
          ) : null}
        </motion.button>
      }
    >
      <div className="border-b border-line px-3 py-2">
        <p className="text-[12.5px] font-medium text-ink">Notifications</p>
      </div>

      <div className="max-h-[380px] overflow-y-auto overscroll-contain">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-ink-faint">
            Nothing yet. You'll hear when someone tags you.
          </p>
        ) : (
          items.map((item) => {
            const inner = (
              <>
                <div className="flex items-start gap-2.5">
                  {item.actorName ? (
                    <Avatar name={item.actorName} tone="saffron" size="sm" />
                  ) : (
                    <span className={cn("mt-0.5", KIND_TONE[item.kind])}>
                      <BellIcon size={14} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-snug text-ink">{item.title}</p>
                    {item.body ? (
                      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">
                        {item.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {formatTimeAgo(new Date(item.createdAt))}
                    </p>
                  </div>
                  {!item.read ? (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron" />
                  ) : null}
                </div>
              </>
            );

            return item.href ? (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block border-b border-line/60 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-surface-sunken"
              >
                {inner}
              </Link>
            ) : (
              <div key={item.id} className="border-b border-line/60 px-3 py-2.5 last:border-b-0">
                {inner}
              </div>
            );
          })
        )}
      </div>
    </Popover>
  );
}
