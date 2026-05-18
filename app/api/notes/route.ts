import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { noteCreateSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { createNote, type NoteVisibility } from '@/lib/services/note-service'
import { serviceErrorResponse } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

/** List notes for a team, optionally within a date range. */
export const GET = withAuth(async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const forbidden = await assertTeamMember(ctx, teamId)
    if (forbidden) return forbidden

    const where: Prisma.NoteWhereInput = { teamId }

    // Employees can read ALL and TEAM notes, but never LEADERS-only ones.
    // ADMIN/LEADER see everything.
    if (ctx.role === 'EMPLOYEE') {
      where.visibility = { not: 'LEADERS' }
    }

    if (dateFrom && dateTo) {
      where.OR = [
        {
          dateFrom: { lte: dateTo },
          dateTo: { gte: dateFrom },
        },
      ]
    }

    const notes = await prisma.note.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(notes)
  } catch (error) {
    console.error('Error fetching notes:', error)
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }
})

/** Create a note and notify the creator. */
export const POST = withAuth(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.notesWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, noteCreateSchema)
    if ('error' in parsed) return parsed.error
    const { teamId, type, status, title, body: noteBody, dateFrom, dateTo, visibility } = parsed.data

    const forbidden = await assertTeamMember(ctx, teamId)
    if (forbidden) return forbidden

    // Only ADMIN/LEADER may post LEADERS-only notes. Silently downgrade
    // because that mirrors the original behavior. Clients won't see an error
    // here, they just get a less-restricted note than they asked for.
    const effectiveVisibility: NoteVisibility =
      visibility === 'LEADERS' && ctx.role === 'EMPLOYEE'
        ? 'ALL'
        : ((visibility as NoteVisibility) ?? 'ALL')

    const note = await createNote({
      teamId,
      // createdByUserId always comes from the authenticated caller. Never trust the body
      createdByUserId: ctx.userId,
      type,
      status,
      title,
      body: noteBody,
      dateFrom,
      dateTo,
      visibility: effectiveVisibility,
    })

    return NextResponse.json(note)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
})
