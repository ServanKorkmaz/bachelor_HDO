-- CreateTable
CREATE TABLE "rotation_patterns" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "slotsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rotation_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rotation_patterns_teamId_idx" ON "rotation_patterns"("teamId");

-- AddForeignKey
ALTER TABLE "rotation_patterns" ADD CONSTRAINT "rotation_patterns_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
