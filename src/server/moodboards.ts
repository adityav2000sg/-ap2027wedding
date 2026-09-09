import "server-only";

/**
 * The overall board.
 *
 * One board is the whole week's look — "Overall Wedding" — and every other
 * board is a slice of it: the Haldi, the florals, the mandap. That only holds
 * if it is true automatically. A picture pinned to the Haldi board is, by
 * definition, part of the wedding's look, and asking somebody to add it twice
 * is asking them to maintain a rule the app could keep itself.
 *
 * So: anything added anywhere is mirrored here. The mirror is one-way — taking
 * a picture off the Haldi board leaves it on the overall one, which is what
 * "it's still part of the wedding, just not that function" means.
 */

import { db } from "@/server/db";

/**
 * The wedding-wide board, if there is one.
 *
 * The first board scoped to the whole wedding rather than a function or a
 * category. Nothing is created here: if the couple have deleted their overall
 * board, they meant to, and the mirror simply stops.
 */
export async function findOverallBoardId(weddingId: string): Promise<string | null> {
  const board = await db.moodboard.findFirst({
    where: { weddingId, archivedAt: null, scope: "WEDDING", eventId: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return board?.id ?? null;
}

/**
 * Put these images on the overall board too.
 *
 * Idempotent — the unique index on (moodboardId, mediaId) means adding the same
 * picture twice is a no-op rather than a duplicate. Returns how many were
 * genuinely new, so a caller can decide whether it is worth mentioning.
 */
export async function mirrorToOverall(
  weddingId: string,
  mediaIds: string[],
  options: { skipBoardId?: string } = {},
): Promise<number> {
  if (mediaIds.length === 0) return 0;

  const overallId = await findOverallBoardId(weddingId);
  // Nothing to do when the picture is already going onto the overall board.
  if (!overallId || overallId === options.skipBoardId) return 0;

  const existing = await db.moodboardItem.count({ where: { moodboardId: overallId } });
  const result = await db.moodboardItem.createMany({
    data: mediaIds.map((mediaId, index) => ({
      moodboardId: overallId,
      mediaId,
      sortOrder: existing + index,
    })),
    skipDuplicates: true,
  });

  return result.count;
}
