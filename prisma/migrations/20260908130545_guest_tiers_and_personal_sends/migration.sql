-- CreateEnum
CREATE TYPE "GuestTier" AS ENUM ('A', 'B', 'C');

-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "invitationSentAt" TIMESTAMP(3),
ADD COLUMN     "saveTheDateSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "tier" "GuestTier" NOT NULL DEFAULT 'A';
