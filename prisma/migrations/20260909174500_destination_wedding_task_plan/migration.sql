-- Conrad Bali is one destination hotel containing all five functions. The
-- original generic task library treated every function as a separately sourced
-- venue, producing five copies of the same availability, walkthrough, pricing,
-- contract and rules work. Keep one real task for each hotel decision and file
-- the redundant copies away.

CREATE TEMP TABLE "_venue_task_rank" ON COMMIT DROP AS
SELECT
  task."id",
  task."weddingId",
  REGEXP_REPLACE(task."templateKey", ':.*$', '') AS "baseKey",
  ROW_NUMBER() OVER (
    PARTITION BY task."weddingId", REGEXP_REPLACE(task."templateKey", ':.*$', '')
    ORDER BY
      CASE WHEN task."status" = 'DONE' THEN 0 ELSE 1 END,
      task."createdAt",
      task."id"
  ) AS "position"
FROM "tasks" AS task
JOIN "weddings" AS wedding ON wedding."id" = task."weddingId"
WHERE wedding."slug" = 'avantika-prateek'
  AND task."archivedAt" IS NULL
  AND REGEXP_REPLACE(task."templateKey", ':.*$', '') IN (
    'venue-research',
    'venue-availability',
    'venue-walkthrough',
    'venue-capacity',
    'venue-pricing',
    'venue-book',
    'venue-restrictions',
    'venue-curfew'
  );

-- Edges pointing at filed-away copies are no longer part of the live plan.
DELETE FROM "task_dependencies" AS dependency
USING "_venue_task_rank" AS ranked
WHERE ranked."position" > 1
  AND (
    dependency."taskId" = ranked."id"
    OR dependency."dependsOnId" = ranked."id"
  );

UPDATE "tasks" AS task
SET
  "archivedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_venue_task_rank" AS ranked
WHERE task."id" = ranked."id"
  AND ranked."position" > 1;

-- The visit, proposal and core hotel checks were completed in August. The
-- contract remains the next venue decision; later operating checks stay open.
UPDATE "tasks" AS task
SET
  "templateKey" = ranked."baseKey",
  "eventId" = NULL,
  "title" = CASE ranked."baseKey"
    WHEN 'venue-research' THEN 'Research and select the destination venue'
    WHEN 'venue-availability' THEN 'Confirm the wedding dates with the venue'
    WHEN 'venue-walkthrough' THEN 'Complete the venue site visit'
    WHEN 'venue-capacity' THEN 'Confirm venue capacity for the full guest list'
    WHEN 'venue-pricing' THEN 'Review the venue proposal and inclusions'
    WHEN 'venue-book' THEN 'Sign the venue contract and pay the deposit'
    WHEN 'venue-restrictions' THEN 'Review venue house rules across all functions'
    WHEN 'venue-curfew' THEN 'Confirm music curfews across the venue spaces'
    ELSE task."title"
  END,
  "status" = CASE
    WHEN ranked."baseKey" IN (
      'venue-research', 'venue-availability', 'venue-walkthrough',
      'venue-capacity', 'venue-pricing'
    ) THEN 'DONE'::"TaskStatus"
    ELSE task."status"
  END,
  "dueDate" = CASE ranked."baseKey"
    WHEN 'venue-research' THEN DATE '2026-08-12'
    WHEN 'venue-availability' THEN DATE '2026-08-18'
    WHEN 'venue-walkthrough' THEN DATE '2026-08-26'
    WHEN 'venue-capacity' THEN DATE '2026-08-27'
    WHEN 'venue-pricing' THEN DATE '2026-08-29'
    WHEN 'venue-book' THEN DATE '2026-09-30'
    WHEN 'venue-restrictions' THEN DATE '2026-10-23'
    WHEN 'venue-curfew' THEN DATE '2026-10-30'
    ELSE task."dueDate"
  END,
  "completedAt" = CASE
    WHEN ranked."baseKey" IN (
      'venue-research', 'venue-availability', 'venue-walkthrough',
      'venue-capacity', 'venue-pricing'
    ) THEN TIMESTAMP '2026-08-26 12:00:00'
    ELSE task."completedAt"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_venue_task_rank" AS ranked
WHERE task."id" = ranked."id"
  AND ranked."position" = 1;

-- Keep future date shifts correct after assigning the real 2026 dates above.
UPDATE "tasks" AS task
SET "offsetDays" = task."dueDate" - wedding."startDate"
FROM "weddings" AS wedding
WHERE task."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND task."archivedAt" IS NULL
  AND task."templateKey" IN (
    'venue-research',
    'venue-availability',
    'venue-walkthrough',
    'venue-capacity',
    'venue-pricing',
    'venue-book',
    'venue-restrictions',
    'venue-curfew'
  );

-- Rebuild the single meaningful booking dependency chain.
DELETE FROM "task_dependencies" AS dependency
USING "tasks" AS task
WHERE dependency."taskId" = task."id"
  AND task."templateKey" = 'venue-book'
  AND task."archivedAt" IS NULL;

INSERT INTO "task_dependencies" ("id", "taskId", "dependsOnId")
SELECT
  REPLACE(GEN_RANDOM_UUID()::TEXT, '-', ''),
  booking."id",
  prerequisite."id"
FROM "tasks" AS booking
JOIN "tasks" AS prerequisite
  ON prerequisite."weddingId" = booking."weddingId"
  AND prerequisite."templateKey" IN ('venue-walkthrough', 'venue-pricing')
  AND prerequisite."archivedAt" IS NULL
JOIN "weddings" AS wedding ON wedding."id" = booking."weddingId"
WHERE wedding."slug" = 'avantika-prateek'
  AND booking."templateKey" = 'venue-book'
  AND booking."archivedAt" IS NULL
ON CONFLICT ("taskId", "dependsOnId") DO NOTHING;

-- A 9–12 month task is due at the end of that planning window. The old anchor
-- was 320 days before the wedding, which made live September work look forty
-- days overdue. Move only unfinished work; completed history remains intact.
UPDATE "tasks" AS task
SET
  "offsetDays" = task."offsetDays" + 50,
  "dueDate" = wedding."startDate" + (task."offsetDays" + 50),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "weddings" AS wedding
WHERE task."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND task."archivedAt" IS NULL
  AND task."phase" = 'NINE_TO_TWELVE_MONTHS'
  AND task."status" NOT IN ('DONE', 'CANCELLED')
  AND task."offsetDays" IS NOT NULL;

-- The dates are locked. Place the few remaining foundation decisions into a
-- realistic September sequence instead of preserving seeded August warnings.
UPDATE "tasks" AS task
SET
  "status" = CASE
    WHEN task."templateKey" = 'foundation-date' THEN 'DONE'::"TaskStatus"
    ELSE task."status"
  END,
  "dueDate" = CASE task."templateKey"
    WHEN 'foundation-date' THEN DATE '2026-08-26'
    WHEN 'foundation-decision-makers' THEN DATE '2026-09-16'
    WHEN 'foundation-planner' THEN DATE '2026-09-18'
    WHEN 'foundation-muhurat' THEN DATE '2026-09-23'
    WHEN 'foundation-style' THEN DATE '2026-09-25'
    ELSE task."dueDate"
  END,
  "completedAt" = CASE
    WHEN task."templateKey" = 'foundation-date'
      THEN TIMESTAMP '2026-08-26 12:00:00'
    ELSE task."completedAt"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "weddings" AS wedding
WHERE task."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND task."archivedAt" IS NULL
  AND task."templateKey" IN (
    'foundation-date',
    'foundation-decision-makers',
    'foundation-planner',
    'foundation-muhurat',
    'foundation-style'
  );

UPDATE "tasks" AS task
SET "offsetDays" = task."dueDate" - wedding."startDate"
FROM "weddings" AS wedding
WHERE task."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND task."archivedAt" IS NULL
  AND task."templateKey" IN (
    'foundation-date',
    'foundation-decision-makers',
    'foundation-planner',
    'foundation-muhurat',
    'foundation-style'
  );

-- Remove journeys that do not exist at a single-hotel destination wedding.
-- Guests need airport transfers, not railway pickups or shuttles between the
-- hotel and its own function spaces.
DELETE FROM "task_dependencies" AS dependency
USING "tasks" AS task
WHERE task."templateKey" IN (
    'haldi-transport', 'transport-station', 'transport-shuttles'
  )
  AND task."archivedAt" IS NULL
  AND (
    dependency."taskId" = task."id"
    OR dependency."dependsOnId" = task."id"
  );

UPDATE "tasks" AS task
SET "archivedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
FROM "weddings" AS wedding
WHERE task."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND task."archivedAt" IS NULL
  AND task."templateKey" IN (
    'haldi-transport', 'transport-station', 'transport-shuttles'
  );

-- Keep the remaining destination-specific wording aligned with the actual
-- Conrad Bali plan.
UPDATE "tasks" AS task
SET
  "title" = CASE task."templateKey"
    WHEN 'photo-drone' THEN 'Check Conrad Bali''s drone permissions'
    WHEN 'ent-sound' THEN 'Confirm the sound system for each function'
    WHEN 'ent-sound-limits' THEN 'Confirm Conrad Bali''s sound limits'
    WHEN 'hotel-shortlist' THEN 'Review Conrad Bali room-block options'
    WHEN 'hotel-negotiate' THEN 'Agree the Conrad Bali room rate and inclusions'
    WHEN 'hotel-block' THEN 'Confirm the Conrad Bali room block'
    WHEN 'hotel-contract' THEN 'Sign the accommodation terms with Conrad Bali'
    WHEN 'transport-plan' THEN 'Plan airport transfers and family transport'
    WHEN 'transport-capacity' THEN 'Check airport-transfer capacity against arrival groups'
    WHEN 'hosp-water' THEN 'Arrange water in function spaces and vehicles'
    ELSE task."title"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "weddings" AS wedding
WHERE task."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND task."archivedAt" IS NULL
  AND task."templateKey" IN (
    'photo-drone',
    'ent-sound',
    'ent-sound-limits',
    'hotel-shortlist',
    'hotel-negotiate',
    'hotel-block',
    'hotel-contract',
    'transport-plan',
    'transport-capacity',
    'hosp-water'
  );

-- Vehicle capacity now follows the airport pickup plan rather than a shuttle
-- between venues that do not exist.
INSERT INTO "task_dependencies" ("id", "taskId", "dependsOnId")
SELECT
  REPLACE(GEN_RANDOM_UUID()::TEXT, '-', ''),
  capacity."id",
  airport."id"
FROM "tasks" AS capacity
JOIN "tasks" AS airport
  ON airport."weddingId" = capacity."weddingId"
  AND airport."templateKey" = 'transport-airport'
  AND airport."archivedAt" IS NULL
JOIN "weddings" AS wedding ON wedding."id" = capacity."weddingId"
WHERE wedding."slug" = 'avantika-prateek'
  AND capacity."templateKey" = 'transport-capacity'
  AND capacity."archivedAt" IS NULL
ON CONFLICT ("taskId", "dependsOnId") DO NOTHING;
