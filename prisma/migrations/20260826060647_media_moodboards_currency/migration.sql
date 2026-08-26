-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'DOCUMENT', 'RECEIPT', 'REFERENCE');

-- CreateEnum
CREATE TYPE "MoodboardScope" AS ENUM ('WEDDING', 'EVENT', 'CATEGORY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "displayCurrency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN     "mustSetPassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vendor_quotes" ADD COLUMN     "mediaId" TEXT;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "derivatives" JSONB,
    "blurData" TEXT,
    "kind" "MediaKind" NOT NULL DEFAULT 'PHOTO',
    "caption" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_links" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'reference',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "media_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moodboards" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "MoodboardScope" NOT NULL DEFAULT 'WEDDING',
    "eventId" TEXT,
    "category" TEXT,
    "coverMediaId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moodboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moodboard_items" (
    "id" TEXT NOT NULL,
    "moodboardId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "caption" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isFavourite" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "outfitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moodboard_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_weddingId_kind_idx" ON "media_assets"("weddingId", "kind");

-- CreateIndex
CREATE INDEX "media_links_entityType_entityId_idx" ON "media_links"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "media_links_mediaId_entityType_entityId_role_key" ON "media_links"("mediaId", "entityType", "entityId", "role");

-- CreateIndex
CREATE INDEX "moodboards_weddingId_idx" ON "moodboards"("weddingId");

-- CreateIndex
CREATE INDEX "moodboard_items_moodboardId_sortOrder_idx" ON "moodboard_items"("moodboardId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "moodboard_items_moodboardId_mediaId_key" ON "moodboard_items"("moodboardId", "mediaId");

-- AddForeignKey
ALTER TABLE "vendor_quotes" ADD CONSTRAINT "vendor_quotes_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_links" ADD CONSTRAINT "media_links_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_moodboardId_fkey" FOREIGN KEY ("moodboardId") REFERENCES "moodboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "outfits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
