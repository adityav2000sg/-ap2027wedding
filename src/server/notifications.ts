import "server-only";

/**
 * Telling people things.
 *
 * Notifications are written when the event happens, not derived on read. That
 * matters: "you were assigned this" stays true and stays in your list even after
 * the task is reassigned to somebody else, which a recomputed view could never
 * represent.
 *
 * Nobody is notified about their own actions. Assigning yourself a task is not
 * news, and a feed full of your own doings is the fastest way to teach people to
 * ignore the badge.
 */

import { db } from "./db";

export type NotificationKind =
  | "ASSIGNED"
  | "TAGGED"
  | "MENTIONED"
  | "DUE_SOON"
  | "OVERDUE"
  | "COMMENTED";

interface NotifyInput {
  weddingId: string;
  /** Members to tell. Duplicates and the actor are removed. */
  memberIds: string[];
  actorId: string | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  taskId?: string | null;
}

export async function notify(input: NotifyInput): Promise<number> {
  const recipients = [...new Set(input.memberIds)].filter(
    (id) => id && id !== input.actorId,
  );
  if (recipients.length === 0) return 0;

  const result = await db.notification.createMany({
    data: recipients.map((memberId) => ({
      weddingId: input.weddingId,
      memberId,
      actorId: input.actorId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      taskId: input.taskId ?? null,
    })),
  });

  return result.count;
}

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: Date;
  actorName: string | null;
}

/** The bell's contents. Newest first, unread included. */
export async function listNotifications(
  memberId: string,
  limit = 30,
): Promise<NotificationRow[]> {
  const rows = await db.notification.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { include: { user: { select: { name: true } } } } },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    href: row.href,
    read: row.readAt !== null,
    createdAt: row.createdAt,
    actorName: row.actor?.user.name ?? null,
  }));
}

export async function unreadCount(memberId: string): Promise<number> {
  return db.notification.count({ where: { memberId, readAt: null } });
}
