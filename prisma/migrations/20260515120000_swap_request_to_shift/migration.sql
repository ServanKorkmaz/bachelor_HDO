-- toShiftId column already exists; add FK if not present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'swap_requests_toShiftId_fkey'
      AND table_name = 'swap_requests'
  ) THEN
    ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_toShiftId_fkey"
      FOREIGN KEY ("toShiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
