import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { requireTeamMembership } from '@/lib/auth/requireTeamMembership'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { noteCreateSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'

export const dynamic = 'force-dynamic'

/** List notes for a team, optionally within a date range. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const auth = await requireTeamMembership(request, teamId)
    if ('error' in auth) return auth.error

    const where: any = { teamId }

    // Employees can read ALL and TEAM notes, but never LEADERS-only ones.
    // ADMIN/LEADER see everything.
    if (auth.role === 'EMPLOYEE') {
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
}

/** Create a note and notify the creator. */
export async function POST(request: Request) {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.notesWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, noteCreateSchema)
    if ('error' in parsed) return parsed.error
    const { teamId, type, status, title, body: noteBody, dateFrom, dateTo, visibility } = parsed.data

    const auth = await requireTeamMembership(request, teamId)
    if ('error' in auth) return auth.error
    // createdByUserId always comes from the authenticated caller — never trust the body
    const createdByUserId = auth.userId

    // Only ADMIN/LEADER may post LEADERS-only notes. Silently downgrade if an
    // EMPLOYEE somehow asks for it.
    const effectiveVisibility =
      visibility === 'LEADERS' && auth.role === 'EMPLOYEE' ? 'ALL' : (visibility ?? 'ALL')

    const note = await prisma.note.create({
      data: {
        teamId,
        createdByUserId,
        type,
        status: status || 'PENDING',
        title: title || null,
        body: noteBody,
        dateFrom,
        dateTo,
        visibility: effectiveVisibility,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    const notifTitle = 'Notat opprettet'
    const notifMessage = `Nytt notat opprettet: ${title || type}`
    await prisma.notification.create({
      data: {
        teamId,
        userId: createdByUserId,
        type: 'NOTE_CREATED',
        title: notifTitle,
        message: notifMessage,
      },
    })
    void deliverNotificationToChannels({
      userId: createdByUserId,
      teamId,
      type: 'NOTE_CREATED',
      title: notifTitle,
      message: notifMessage,
    })

    return NextResponse.json(note)
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}

