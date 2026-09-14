-- CreateEnum
CREATE TYPE "RsvpSubmissionOutcome" AS ENUM ('RECORDED', 'LINK_NOT_FOUND', 'REPLIES_CLOSED', 'NOBODY_TO_ANSWER_FOR', 'NAMES_NOT_MATCHED', 'INVALID_PAYLOAD', 'WRITE_FAILED');

-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "rsvpLastOpenedAt" TIMESTAMP(3),
ADD COLUMN     "rsvpOpenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rsvpOpenedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "rsvpLastOpenedAt" TIMESTAMP(3),
ADD COLUMN     "rsvpOpenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rsvpOpenedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rsvp_submissions" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT,
    "token" TEXT NOT NULL,
    "outcome" "RsvpSubmissionOutcome" NOT NULL,
    "householdId" TEXT,
    "householdName" TEXT,
    "guestId" TEXT,
    "guestName" TEXT,
    "stage" "InvitationStage",
    "payload" JSONB NOT NULL,
    "summary" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsvp_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rsvp_submissions_createdAt_idx" ON "rsvp_submissions"("createdAt");

-- CreateIndex
CREATE INDEX "rsvp_submissions_householdId_idx" ON "rsvp_submissions"("householdId");

-- CreateIndex
CREATE INDEX "rsvp_submissions_guestId_idx" ON "rsvp_submissions"("guestId");

-- CreateIndex
CREATE INDEX "rsvp_submissions_outcome_idx" ON "rsvp_submissions"("outcome");

