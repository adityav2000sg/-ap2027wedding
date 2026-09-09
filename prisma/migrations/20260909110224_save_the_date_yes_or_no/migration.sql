-- The save-the-date now asks yes or no, with nothing in between.
--
-- Anyone who had answered "maybe" is put back to unanswered rather than being
-- guessed either way: they still hold the link, and answering again takes a
-- second. Guessing on their behalf would put a number in the headcount that
-- nobody actually said.
UPDATE "guests" SET "stdResponse" = NULL WHERE "stdResponse" = 'MAYBE';

-- Postgres cannot drop a value from an enum in place, so the type is rebuilt.
ALTER TYPE "SaveTheDateResponse" RENAME TO "SaveTheDateResponse_old";
CREATE TYPE "SaveTheDateResponse" AS ENUM ('YES', 'NO');
ALTER TABLE "guests"
  ALTER COLUMN "stdResponse" TYPE "SaveTheDateResponse"
  USING ("stdResponse"::text::"SaveTheDateResponse");
DROP TYPE "SaveTheDateResponse_old";
