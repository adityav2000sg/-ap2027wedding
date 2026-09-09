-- Two pairs occur twice in the original 267-row planning workbook: once in
-- Tier A under Harris and once in Tier B under Bham. The earlier name-only tier
-- import could not distinguish them, leaving all four records in Tier A.
UPDATE "guests" AS guest
SET "tier" = 'B', "attendanceScore" = 4
FROM "households" AS household, "weddings" AS wedding
WHERE guest."householdId" = household."id"
  AND guest."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND household."name" = 'Bham'
  AND (guest."firstName", guest."lastName") IN (
    ('Amay', 'Bham'),
    ('Ashray', 'Bham')
  );

UPDATE "guests" AS guest
SET "tier" = 'A', "attendanceScore" = 4
FROM "households" AS household, "weddings" AS wedding
WHERE guest."householdId" = household."id"
  AND guest."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND household."name" = 'Harris'
  AND (guest."firstName", guest."lastName") IN (
    ('Amay', 'Bham'),
    ('Ashray', 'Bham')
  );

-- The two Sanjay Anands are also distinct people. Restore their probability
-- scores using the planning group that disambiguates them.
UPDATE "guests" AS guest
SET "attendanceScore" = CASE
  WHEN household."name" = 'Anand-Dhulapia' THEN 3
  WHEN household."name" = 'Anand' THEN 5
  ELSE guest."attendanceScore"
END
FROM "households" AS household, "weddings" AS wedding
WHERE guest."householdId" = household."id"
  AND guest."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND guest."firstName" = 'Sanjay'
  AND guest."lastName" = 'Anand';
