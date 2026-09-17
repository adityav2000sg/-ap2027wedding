-- AlterTable
ALTER TABLE "budget_items" ADD COLUMN     "payerId" TEXT;

-- CreateIndex
CREATE INDEX "budget_items_weddingId_payerId_idx" ON "budget_items"("weddingId", "payerId");

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The four parents, as people money comes from.
--
-- Seeded here rather than in prisma/seed.ts because seed only runs on an empty
-- database, and this has to reach the wedding that already exists. Idempotent
-- by the (weddingId, name) unique constraint, so re-running is a no-op — and so
-- is renaming one afterwards, which will simply not be undone.
INSERT INTO payers (id, "weddingId", name, kind, "sortOrder")
SELECT
  'payer_' || md5(w.id || parent.name || clock_timestamp()::text),
  w.id,
  parent.name,
  'person',
  parent.ord
FROM weddings w
CROSS JOIN (
  VALUES
    ('Namrita Chowdhry', 0),
    ('Dheeraj Chowdhry', 1),
    ('Preeti Mehan', 2),
    ('Ajay Mehan', 3)
) AS parent(name, ord)
ON CONFLICT ("weddingId", name) DO NOTHING;
