-- Create the enum
CREATE TYPE "NoteType" AS ENUM ('GENERAL', 'INFO', 'ABSENCE', 'HOLIDAY', 'SICKNESS');

-- Convert the existing String column to the enum using an explicit cast.
-- All existing values in Neon ('GENERAL', 'ABSENCE') are members of the new
-- enum, so the cast succeeds without data loss.
ALTER TABLE "notes" ALTER COLUMN "type" TYPE "NoteType" USING "type"::"NoteType";
