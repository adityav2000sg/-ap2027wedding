-- CreateEnum
CREATE TYPE "RsvpReply" AS ENUM ('AWAITING', 'YES', 'NO');

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "rsvpRepliedAt" TIMESTAMP(3),
ADD COLUMN     "rsvpReply" "RsvpReply" NOT NULL DEFAULT 'AWAITING',
ADD COLUMN     "rsvpSentAt" TIMESTAMP(3),
ADD COLUMN     "saveTheDateSentAt" TIMESTAMP(3);
