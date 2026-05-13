-- DropIndex
DROP INDEX IF EXISTS "shifts_userId_date_idx";

-- CreateIndex
CREATE UNIQUE INDEX "shifts_userId_date_key" ON "shifts"("userId", "date");
