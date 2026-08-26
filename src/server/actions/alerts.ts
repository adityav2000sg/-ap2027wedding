"use server";

import { z } from "zod";

import { db } from "@/server/db";
import { revalidateWedding, withAction } from "./shared";

/**
 * Alerts themselves are computed live and never stored — only the dismissal is
 * persisted, so a problem that gets fixed disappears on its own, and one that
 * gets worse can be surfaced again by clearing the dismissal.
 */
export async function dismissAlert(alertKey: string) {
  return withAction("tasks.edit", async (viewer) => {
    const key = z.string().trim().min(1).max(200).parse(alertKey);

    await db.alertDismissal.upsert({
      where: { weddingId_alertKey: { weddingId: viewer.weddingId, alertKey: key } },
      create: {
        weddingId: viewer.weddingId,
        alertKey: key,
        dismissedById: viewer.userId,
      },
      update: { dismissedById: viewer.userId, dismissedAt: new Date() },
    });

    revalidateWedding();
    return { key };
  });
}

export async function restoreAlert(alertKey: string) {
  return withAction("tasks.edit", async (viewer) => {
    const key = z.string().trim().min(1).max(200).parse(alertKey);
    await db.alertDismissal.deleteMany({
      where: { weddingId: viewer.weddingId, alertKey: key },
    });
    revalidateWedding();
    return { key };
  });
}

export async function restoreAllAlerts() {
  return withAction("tasks.edit", async (viewer) => {
    const result = await db.alertDismissal.deleteMany({
      where: { weddingId: viewer.weddingId },
    });
    revalidateWedding();
    return { count: result.count };
  });
}
