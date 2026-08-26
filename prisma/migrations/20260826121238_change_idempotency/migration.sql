-- CreateTable
CREATE TABLE "change_applications" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" JSONB,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_applications_weddingId_appliedAt_idx" ON "change_applications"("weddingId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "change_applications_weddingId_idempotencyKey_key" ON "change_applications"("weddingId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "change_applications" ADD CONSTRAINT "change_applications_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
