import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const where: any = { teamId }

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

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { teamId, createdByUserId, type, status, title, body: noteBody, dateFrom, dateTo } = body

    if (!teamId || !createdByUserId || !type || !noteBody || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

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
        visibility: 'ALL',
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

    // Create notification
    await prisma.notification.create({
      data: {
        teamId,
        userId: createdByUserId,
        type: 'NOTE_CREATED',
        title: 'Notat opprettet',
        message: `Nytt notat opprettet: ${title || type}`,
      },
    })

    return NextResponse.json(note)
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}

