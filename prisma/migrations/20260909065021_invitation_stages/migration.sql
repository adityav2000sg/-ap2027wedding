-- CreateEnum
CREATE TYPE "InvitationStage" AS ENUM ('SAVE_THE_DATE', 'INVITATION');

-- CreateEnum
CREATE TYPE "SaveTheDateResponse" AS ENUM ('YES', 'NO', 'MAYBE');

-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "stdResponse" "SaveTheDateResponse";

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "stdRepliedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "weddings" ADD COLUMN     "invitationStage" "InvitationStage" NOT NULL DEFAULT 'SAVE_THE_DATE';
