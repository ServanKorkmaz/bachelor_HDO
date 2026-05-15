-- One short note per (team, ISO week-year, ISO week-number). Used by the
-- per-employee Agenda view to render a "fokus for uka" header above each
-- week card. ISO year is stored separately from ISO week because the ISO
-- year at the boundary of January/December can differ from the calendar
-- year (e.g. 2024-12-30 is in 2025-W01).
CREATE TABLE "week_notes" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "week_notes_pkey" PRIMARY KEY ("id")
);

-- Idempotent-write contract: the upsert API uses (teamId, isoYear, isoWeek)
-- as the natural key, so the unique constraint guarantees we never store
-- two notes for the same week.
CREATE UNIQUE INDEX "week_notes_teamId_isoYear_isoWeek_key"
  ON "week_notes"("teamId", "isoYear", "isoWeek");

-- Range scans by (teamId, year, week) for the Agenda view.
CREATE INDEX "week_notes_teamId_isoYear_isoWeek_idx"
  ON "week_notes"("teamId", "isoYear", "isoWeek");

ALTER TABLE "week_notes"
  ADD CONSTRAINT "week_notes_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull on the creator FK: deleting a leader shouldn't erase the
-- historical record of week notes they wrote.
ALTER TABLE "week_notes"
  ADD CONSTRAINT "week_notes_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
