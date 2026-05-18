import { NextResponse } from 'next/server'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { weekNoteUpsertSchema } from '@/lib/validation/schemas'
import { listWeekNotes, upsertWeekNote } from '@/lib/services/week-note-service'
import { serviceErrorResponse } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/week-notes
 *
 * List week notes for one employee in an ISO-week range. Notes are per-
 * employee ("fokus for uka" for this person), so the caller must specify
 * which employee on which team.
 *
 * Query params (all required):
 *   - teamId
 *   - userId
 *   - fromYear, fromWeek (inclusive lower bound)
 *   - toYear, toWeek (inclusive upper bound)
 */
export const GET = withAuth(async (request, ctx) => {
  const { searchParams } = new URL(request.url)
  const teamId = searchParams.get('teamId')
  const userId = searchParams.get('userId')
  const fromYear = Number(searchParams.get('fromYear'))
  const fromWeek = Number(searchParams.get('fromWeek'))
  const toYear = Number(searchParams.get('toYear'))
  const toWeek = Number(searchParams.get('toWeek'))

  if (
    !teamId ||
    !userId ||
    !Number.isFinite(fromYear) ||
    !Number.isFinite(fromWeek) ||
    !Number.isFinite(toYear) ||
    !Number.isFinite(toWeek)
  ) {
    return NextResponse.json({ error: 'Missing or invalid query params' }, { status: 400 })
  }

  const forbidden = await assertTeamMember(ctx, teamId)
  if (forbidden) return forbidden

  // Employees can only read their own week notes. ADMIN/LEADER can read any
  // team member's, gated by the team check above.
  if (ctx.role === 'EMPLOYEE' && ctx.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const notes = await listWeekNotes({ teamId, userId, fromYear, fromWeek, toYear, toWeek })
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
 * Upsert a week note for one employee. Empty body deletes the row — keeps the
 * API surface to a single mutation method.
 *
 * Authorization: ADMIN/LEADER may write notes for any employee on a team they
 * belong to; EMPLOYEE may write only their own.
 */
export const PUT = withAuth(async (request, ctx) => {
  const parsed = await parseJsonBody(request, weekNoteUpsertSchema)
  if ('error' in parsed) return parsed.error

  const forbidden = await assertTeamMember(ctx, parsed.data.teamId)
  if (forbidden) return forbidden

  if (ctx.role === 'EMPLOYEE' && ctx.userId !== parsed.data.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
