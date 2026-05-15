import { NextResponse } from 'next/server'
import { withAuth, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { weekNoteUpsertSchema } from '@/lib/validation/schemas'
import { listWeekNotes, upsertWeekNote } from '@/lib/services/week-note-service'
import { serviceErrorResponse } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/week-notes
 *
 * List week notes for a team in an ISO-week range. All team members can read;
 * the data is the kind of "fokus for uka"-message that everyone on the team
 * sees in the Agenda view.
 *
 * Query params (all required):
 *   - teamId
 *   - fromYear, fromWeek (inclusive lower bound)
 *   - toYear, toWeek (inclusive upper bound)
 */
export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url)
  const teamId = searchParams.get('teamId')
  const fromYear = Number(searchParams.get('fromYear'))
  const fromWeek = Number(searchParams.get('fromWeek'))
  const toYear = Number(searchParams.get('toYear'))
  const toWeek = Number(searchParams.get('toWeek'))

  if (!teamId || !Number.isFinite(fromYear) || !Number.isFinite(fromWeek) || !Number.isFinite(toYear) || !Number.isFinite(toWeek)) {
    return NextResponse.json({ error: 'Missing or invalid query params' }, { status: 400 })
  }

  try {
    const notes = await listWeekNotes({ teamId, fromYear, fromWeek, toYear, toWeek })
    return NextResponse.json(notes)
  } catch (e) {
    const mapped = serviceErrorResponse(e)
    if (mapped) return mapped
    console.error('/api/week-notes failed', e)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
})

/**
 * PUT /api/week-notes
 *
 * Upsert a week note. Empty body string deletes the row — this keeps the
 * API surface to a single mutation method instead of forcing the client into
 * a separate DELETE flow. Leader/admin only because these notes drive
 * weekly priorities for the whole team.
 */
export const PUT = withLeaderOrAdmin(async (request, ctx) => {
  const parsed = await parseJsonBody(request, weekNoteUpsertSchema)
  if ('error' in parsed) return parsed.error

  try {
    const note = await upsertWeekNote({
      ...parsed.data,
      actorUserId: ctx.userId,
    })
    // Distinguishes "saved" from "cleared" without a separate DELETE route.
    return NextResponse.json(note ?? { deleted: true })
  } catch (e) {
    const mapped = serviceErrorResponse(e)
    if (mapped) return mapped
    console.error('/api/week-notes failed', e)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
})
