-- Highlighted couples remain in their shared household/accommodation group,
-- but each person receives an independent, unguessable invitation link.
ALTER TABLE "guests"
ADD COLUMN "rsvpToken" TEXT,
ADD COLUMN "rsvpMessage" TEXT,
ADD COLUMN "rsvpSubmittedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "guests_rsvpToken_key" ON "guests"("rsvpToken");

UPDATE "guests" AS guest
SET "rsvpToken" = REPLACE(gen_random_uuid()::text, '-', '')
FROM "weddings" AS wedding
WHERE guest."weddingId" = wedding."id"
  AND wedding."slug" = 'avantika-prateek'
  AND guest."tier" = 'A'
  AND (guest."firstName", guest."lastName") IN (
    ('Muttaqee', 'Dar'),
    ('Bintay Zahra', ''),
    ('Josh', 'Keeling'),
    ('Jelena', 'Vukovic'),
    ('Sebastien', 'Santhiapillai'),
    ('Sophie', 'Norman'),
    ('Alistair', 'McGuire'),
    ('Priyanka', 'Nankani'),
    ('Angus', 'Forbes'),
    ('Katie', 'O''Byrne'),
    ('John', 'Nicolaou'),
    ('Marilena', 'Nicolaou'),
    ('Josh', 'Ray'),
    ('Ellie', 'Cherrill'),
    ('Abi', 'Bateman'),
    ('Stef', 'Roxanis')
  );
