"use server";

import { db } from "@/server/db";
import { revalidateWedding, withViewer } from "./shared";

/** Mark one notification read — used when you click through to the thing. */
export async function markNotificationRead(id: string) {
  return withViewer(async (viewer) => {
    // Scoped to the viewer's own row, so an id from elsewhere does nothing.
    await db.notification.updateMany({
      where: { id, memberId: viewer.memberId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidateWedding();
    return { id };
  });
}

export async function markAllNotificationsRead() {
  return withViewer(async (viewer) => {
    const { count } = await db.notification.updateMany({
      where: { memberId: viewer.memberId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidateWedding();
    return { count };
  });
}
