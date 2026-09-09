-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "attendanceScore" INTEGER,
ADD COLUMN     "tier" "GuestTier" NOT NULL DEFAULT 'A';
