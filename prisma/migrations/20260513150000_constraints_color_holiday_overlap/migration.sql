-- ShiftType.color must be a 6-digit hex value (#RRGGBB). The Zod schema in
-- lib/validation/schemas.ts already enforces this at the API boundary; this
-- CHECK constraint is a second layer that catches any write path bypassing
-- the API (seed scripts, manual SQL, future ETL).
ALTER TABLE "shift_types"
  ADD CONSTRAINT "shift_types_color_hex_chk"
  CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
