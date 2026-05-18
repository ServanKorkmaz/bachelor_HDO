-- Switch week notes from team-wide to per-employee. The previous model keyed
-- notes on (teamId, isoYear, isoWeek), which meant every employee in a team
-- saw the same note in the Agenda view — the original frontend was already
-- documented as "per-employee", so this aligns the data model with the UI.
--
-- The existing rows can't be migrated meaningfully (there's no way to know
-- which employee a team-wide note "really" belonged to), so we drop them.
-- All current rows are pre-submission test data.

DELETE FROM "week_notes";

-- Drop the old constraints before adding the new column + constraints.
DROP INDEX IF EXISTS "week_notes_teamId_isoYear_isoWeek_key";
DROP INDEX IF EXISTS "week_notes_teamId_isoYear_isoWeek_idx";

ALTER TABLE "week_notes"
  ADD COLUMN "userId" TEXT NOT NULL;

ALTER TABLE "week_notes"
  ADD CONSTRAINT "week_notes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New idempotent-write key: (team, employee, year, week).
CREATE UNIQUE INDEX "week_notes_teamId_userId_isoYear_isoWeek_key"
  ON "week_notes"("teamId", "userId", "isoYear", "isoWeek");

-- Range scans by (team, employee, year, week) for the Agenda view.
CREATE INDEX "week_notes_teamId_userId_isoYear_isoWeek_idx"
  ON "week_notes"("teamId", "userId", "isoYear", "isoWeek");
