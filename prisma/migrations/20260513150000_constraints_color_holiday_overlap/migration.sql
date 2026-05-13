-- ShiftType.color must be a 6-digit hex value (#RRGGBB). The Zod schema in
-- lib/validation/schemas.ts already enforces this at the API boundary; this
-- CHECK constraint is defense-in-depth for any write path that bypasses the
-- API (seed scripts, manual SQL, future ETL).
ALTER TABLE "shift_types"
  ADD CONSTRAINT "shift_types_color_hex_chk"
  CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');

-- Prevent overlapping HolidayRequests for the same user. Postgres exclusion
-- constraints solve this race-safely at the DB level — even if two POST /api
-- requests submit at the same time, one will fail with an exclusion violation
-- rather than both succeeding.
--
-- REJECTED requests are excluded from the constraint so historical decisions
-- don't block a new request for the same period.
--
-- `dateFrom`/`dateTo` are stored as YYYY-MM-DD strings (see schema.prisma for
-- the rationale). We cast to ::date inside the range expression — Zod
-- guarantees the values parse as real dates at the API boundary.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "holiday_requests"
  ADD CONSTRAINT "holiday_requests_no_overlap_per_user"
  EXCLUDE USING gist (
    "userId" WITH =,
    daterange("dateFrom"::date, COALESCE("dateTo", "dateFrom")::date, '[]') WITH &&
  )
  WHERE (status <> 'REJECTED');
