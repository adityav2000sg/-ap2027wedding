"use server";

import { z } from "zod";

import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import { deleteMedia } from "@/server/media";
import { optionalId, optionalString, revalidateWedding, withAction } from "./shared";

// ───────────────────────────────────────────────────────────────── Moodboards

const boardSchema = z.object({
  name: z.string().trim().min(1, "Give the board a name.").max(120),
  description: optionalString.optional(),
  scope: z.enum(["WEDDING", "EVENT", "CATEGORY"]).default("WEDDING"),
  eventId: optionalId.optional(),
  category: optionalString.optional(),
});

export async function createMoodboard(input: unknown) {
  return withAction("documents.upload", async (viewer) => {
    const data = boardSchema.parse(input);
    const count = await db.moodboard.count({ where: { weddingId: viewer.weddingId } });

    const board = await db.moodboard.create({
      data: {
        weddingId: viewer.weddingId,
        name: data.name,
        description: data.description ?? null,
        scope: data.scope,
        eventId: data.scope === "EVENT" ? data.eventId ?? null : null,
        category: data.scope === "CATEGORY" ? data.category ?? null : null,
        sortOrder: count,
      },
      select: { id: true, name: true },
    });

    await logViewerActivity(viewer, {
      entityType: "moodboard",
      entityId: board.id,
      entityLabel: board.name,
      action: "created",
      summary: `${viewer.name} created the ${board.name} moodboard.`,
    });

    revalidateWedding();
    return { id: board.id };
  });
}

export async function updateMoodboard(input: unknown) {
  return withAction("documents.upload", async (viewer) => {
    const data = boardSchema
      .partial()
      .extend({ id: z.string().min(1), coverMediaId: optionalId.optional() })
      .parse(input);
    const { id, ...patch } = data;

    const board = await db.moodboard.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!board) throw new Error("That moodboard no longer exists.");

    await db.moodboard.update({ where: { id }, data: patch });
    revalidateWedding();
    return { id };
  });
}

export async function archiveMoodboard(id: string) {
  return withAction("documents.upload", async (viewer) => {
    const board = await db.moodboard.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!board) throw new Error("That moodboard no longer exists.");

    await db.moodboard.update({ where: { id }, data: { archivedAt: new Date() } });

    await logViewerActivity(viewer, {
      entityType: "moodboard",
      entityId: board.id,
      entityLabel: board.name,
      action: "archived",
      summary: `${viewer.name} removed the ${board.name} moodboard. The images themselves are untouched.`,
    });

    revalidateWedding();
    return { id };
  });
}

// ──────────────────────────────────────────────────────────── Moodboard items

export async function updateMoodboardItem(input: unknown) {
  return withAction("documents.upload", async (viewer) => {
    const data = z
      .object({
        id: z.string().min(1),
        caption: optionalString.optional(),
        notes: optionalString.optional(),
        isFavourite: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        vendorId: optionalId.optional(),
        outfitId: optionalId.optional(),
      })
      .parse(input);
    const { id, ...patch } = data;

    const item = await db.moodboardItem.findFirst({
      where: { id, moodboard: { weddingId: viewer.weddingId } },
      include: { moodboard: { select: { name: true } } },
    });
    if (!item) throw new Error("That image is no longer on this board.");

    await db.moodboardItem.update({ where: { id }, data: patch });

    // Captions are also stored on the asset, so the same photo carries its
    // description wherever else it's used.
    if (patch.caption !== undefined) {
      await db.mediaAsset.update({
        where: { id: item.mediaId },
        data: { caption: patch.caption },
      });
    }

    revalidateWedding();
    return { id };
  });
}

/** Persist a new order after a drag. */
export async function reorderMoodboardItems(moodboardId: string, orderedIds: string[]) {
  return withAction("documents.upload", async (viewer) => {
    const ids = z.array(z.string().min(1)).parse(orderedIds);

    const board = await db.moodboard.findFirst({
      where: { id: moodboardId, weddingId: viewer.weddingId },
      select: { id: true },
    });
    if (!board) throw new Error("That moodboard no longer exists.");

    await db.$transaction(
      ids.map((id, index) =>
        db.moodboardItem.updateMany({
          where: { id, moodboardId: board.id },
          data: { sortOrder: index },
        }),
      ),
    );

    revalidateWedding();
    return { count: ids.length };
  });
}

/**
 * Take an image off a board without deleting the file — it may well be in use
 * elsewhere. Deleting the underlying asset is a separate, explicit action.
 */
export async function removeMoodboardItem(id: string) {
  return withAction("documents.upload", async (viewer) => {
    const item = await db.moodboardItem.findFirst({
      where: { id, moodboard: { weddingId: viewer.weddingId } },
      select: { id: true },
    });
    if (!item) throw new Error("That image is no longer on this board.");

    await db.moodboardItem.delete({ where: { id } });
    revalidateWedding();
    return { id };
  });
}

/** Put an existing image onto another board. One file, many contexts. */
export async function addExistingMediaToBoard(moodboardId: string, mediaIds: string[]) {
  return withAction("documents.upload", async (viewer) => {
    const ids = z.array(z.string().min(1)).min(1).parse(mediaIds);

    const board = await db.moodboard.findFirst({
      where: { id: moodboardId, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!board) throw new Error("That moodboard no longer exists.");

    const count = await db.moodboardItem.count({ where: { moodboardId: board.id } });
    const result = await db.moodboardItem.createMany({
      data: ids.map((mediaId, index) => ({
        moodboardId: board.id,
        mediaId,
        sortOrder: count + index,
      })),
      skipDuplicates: true,
    });

    if (result.count > 0) {
      await logViewerActivity(viewer, {
        entityType: "moodboard",
        entityId: board.id,
        entityLabel: board.name,
        action: "updated",
        summary: `${viewer.name} added ${result.count} ${result.count === 1 ? "image" : "images"} to ${board.name}.`,
      });
    }

    revalidateWedding();
    return { count: result.count };
  });
}

// ──────────────────────────────────────────────────────────────────── Assets

export async function updateMediaCaption(mediaId: string, caption: string) {
  return withAction("documents.upload", async (viewer) => {
    const text = z.string().trim().max(400).parse(caption);
    const asset = await db.mediaAsset.findFirst({
      where: { id: mediaId, weddingId: viewer.weddingId },
      select: { id: true },
    });
    if (!asset) throw new Error("That file no longer exists.");

    await db.mediaAsset.update({
      where: { id: mediaId },
      data: { caption: text || null },
    });
    await db.moodboardItem.updateMany({
      where: { mediaId },
      data: { caption: text || null },
    });

    revalidateWedding();
    return { id: mediaId };
  });
}

export async function deleteMediaAsset(mediaId: string) {
  return withAction("documents.upload", async (viewer) => {
    await deleteMedia(viewer, mediaId);
    revalidateWedding();
    return { id: mediaId };
  });
}

/** Attach an already-uploaded asset to another entity. */
export async function linkMedia(
  mediaId: string,
  entityType: string,
  entityId: string,
  role = "reference",
) {
  return withAction("documents.upload", async (viewer) => {
    const asset = await db.mediaAsset.findFirst({
      where: { id: mediaId, weddingId: viewer.weddingId },
      select: { id: true },
    });
    if (!asset) throw new Error("That file no longer exists.");

    const count = await db.mediaLink.count({ where: { entityType, entityId } });
    await db.mediaLink.upsert({
      where: {
        mediaId_entityType_entityId_role: { mediaId, entityType, entityId, role },
      },
      create: { mediaId, entityType, entityId, role, sortOrder: count },
      update: {},
    });

    revalidateWedding();
    return { id: mediaId };
  });
}

export async function unlinkMedia(
  mediaId: string,
  entityType: string,
  entityId: string,
  role = "reference",
) {
  return withAction("documents.upload", async (viewer) => {
    await db.mediaLink.deleteMany({
      where: { mediaId, entityType, entityId, role, media: { weddingId: viewer.weddingId } },
    });
    revalidateWedding();
    return { id: mediaId };
  });
}

/** Promote an image to be the cover for its entity (outfit, vendor, board). */
export async function setCoverMedia(
  mediaId: string,
  entityType: string,
  entityId: string,
) {
  return withAction("documents.upload", async (viewer) => {
    const asset = await db.mediaAsset.findFirst({
      where: { id: mediaId, weddingId: viewer.weddingId },
      select: { id: true },
    });
    if (!asset) throw new Error("That file no longer exists.");

    await db.$transaction(async (tx) => {
      // Only one cover at a time — demote whatever held it.
      await tx.mediaLink.updateMany({
        where: { entityType, entityId, role: "cover" },
        data: { role: "reference" },
      });
      await tx.mediaLink.upsert({
        where: {
          mediaId_entityType_entityId_role: {
            mediaId, entityType, entityId, role: "cover",
          },
        },
        create: { mediaId, entityType, entityId, role: "cover", sortOrder: -1 },
        update: { sortOrder: -1 },
      });
    });

    revalidateWedding();
    return { id: mediaId };
  });
}
