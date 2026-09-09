-- Every board is a slice of the whole week's look, so the wedding-wide board
-- collects whatever is pinned anywhere else. New additions are mirrored by the
-- app; this brings the pictures that were filed before that rule existed.
--
-- Idempotent: the unique index on (moodboardId, mediaId) makes a re-run a no-op.
WITH overall AS (
  SELECT DISTINCT ON ("weddingId") "weddingId", "id"
  FROM "moodboards"
  WHERE "scope" = 'WEDDING' AND "eventId" IS NULL AND "archivedAt" IS NULL
  ORDER BY "weddingId", "sortOrder" ASC, "createdAt" ASC
)
INSERT INTO "moodboard_items" ("id", "moodboardId", "mediaId", "sortOrder")
SELECT
  REPLACE(gen_random_uuid()::text, '-', ''),
  overall."id",
  item."mediaId",
  0
FROM "moodboard_items" AS item
JOIN "moodboards" AS board ON board."id" = item."moodboardId"
JOIN overall ON overall."weddingId" = board."weddingId"
WHERE board."id" <> overall."id"
ON CONFLICT ("moodboardId", "mediaId") DO NOTHING;
