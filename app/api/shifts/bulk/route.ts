import { NextResponse } from 'next/server'
import { parse } from 'date-fns'
import { prisma } from '@/lib/prisma'

type BulkAction = 'create' | 'update' | 'delete'

interface BulkShiftItem {
  shiftId?: string
  userId?: string
  date?: string
  shiftTypeId?: string
  startTime?: string
  endTime?: string
  comment?: string
}

interface BulkShiftRequest {
  action: BulkAction
  teamId?: string
  items: BulkShiftItem[]
  currentUserId?: string
}

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const timeRegex = /^\d{2}:\d{2}$/
const MAX_ITEMS = 200
const BATCH_SIZE = 20

/** Bulk create, update, or delete shifts for multiple users and dates. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BulkShiftRequest
    const { action, items, currentUserId } = body

    if (!currentUserId) {
      return NextResponse.json({ error: 'currentUserId is required' }, { status: 401 })
    }

    const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } })
    if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'LEADER')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const teamId = body.teamId || currentUser.teamId
    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    if (!action || !['create', 'update', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items is required' }, { status: 400 })
    }

    if (items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Too many items (max ${MAX_ITEMS})` }, { status: 400 })
    }

    const uniqueUserIds = Array.from(
      new Set(items.map(item => item.userId).filter(Boolean)) as Set<string>
    )
    const users = uniqueUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: uniqueUserIds } },
          select: { id: true, teamId: true },
        })
      : []
    const userMap = new Map(users.map(user => [user.id, user]))

    const uniqueShiftTypeIds = Array.from(
      new Set(items.map(item => item.shiftTypeId).filter(Boolean)) as Set<string>
    )
    const shiftTypes = uniqueShiftTypeIds.length > 0
      ? await prisma.shiftType.findMany({ where: { id: { in: uniqueShiftTypeIds } } })
      : []
    const shiftTypeMap = new Map(shiftTypes.map(shiftType => [shiftType.id, shiftType]))

    const successes: Array<{ userId: string; date: string; shiftId?: string }> = []
    const failures: Array<{ userId: string; date: string; error: string }> = []

    const processItem = async (item: BulkShiftItem) => {
      let userId = item.userId
      let date = item.date
      let existingShift = null as null | { id: string; userId: string; date: string }

      if (item.shiftId) {
        const shift = await prisma.shift.findUnique({
          where: { id: item.shiftId },
          select: { id: true, userId: true, date: true, teamId: true },
        })
        if (!shift || shift.teamId !== teamId) {
          return { status: 'failure', userId: userId || '', date: date || '', error: 'Shift not found' }
        }
        existingShift = { id: shift.id, userId: shift.userId, date: shift.date }
        userId = shift.userId
        date = shift.date
      }

      if (action === 'create' && (!userId || !date)) {
        return { status: 'failure', userId: userId || '', date: date || '', error: 'userId and date are required' }
      }

      if (!userId || !date) {
        return { status: 'failure', userId: userId || '', date: date || '', error: 'Shift is required' }
      }

      if (!dateRegex.test(date)) {
        return { status: 'failure', userId, date, error: 'Invalid date format' }
      }

      const user = userMap.get(userId) || (await prisma.user.findUnique({ where: { id: userId } }))
      if (!user) {
        return { status: 'failure', userId, date, error: 'User not found' }
      }
      if (user.teamId !== teamId) {
        return { status: 'failure', userId, date, error: 'User must belong to team' }
      }

      let shiftType = null
      if (action !== 'delete') {
        if (!item.shiftTypeId || !item.startTime || !item.endTime) {
          return { status: 'failure', userId, date, error: 'shiftTypeId, startTime, and endTime are required' }
        }
        if (!timeRegex.test(item.startTime) || !timeRegex.test(item.endTime)) {
          return { status: 'failure', userId, date, error: 'Invalid time format' }
        }
        shiftType = shiftTypeMap.get(item.shiftTypeId)
        if (!shiftType) {
          return { status: 'failure', userId, date, error: 'Shift type not found' }
        }
      }

      if (!existingShift) {
        existingShift = await prisma.shift.findFirst({
          where: { userId, date, teamId },
          select: { id: true, userId: true, date: true },
        })
      }

      if (action === 'create') {
        if (existingShift) {
          return { status: 'failure', userId, date, error: 'Shift already exists' }
        }

        const startDateTime = parse(`${date}T${item.startTime}`, "yyyy-MM-dd'T'HH:mm", new Date())
        let endDateTime = parse(`${date}T${item.endTime}`, "yyyy-MM-dd'T'HH:mm", new Date())
        if (shiftType?.crossesMidnight || endDateTime <= startDateTime) {
          endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000)
        }

        const created = await prisma.shift.create({
          data: {
            teamId,
            userId,
            date,
            startDateTime,
            endDateTime,
            shiftTypeId: shiftType!.id,
            comment: item.comment || null,
          },
        })

        await prisma.notification.create({
          data: {
            teamId,
            userId,
            type: 'SHIFT_CREATED',
            title: 'Vakt opprettet',
            message: `Ny vakt opprettet for ${date}`,
          },
        })

        return { status: 'success', userId, date, shiftId: created.id }
      }

      if (action === 'update') {
        if (!existingShift) {
          return { status: 'failure', userId, date, error: 'Shift not found' }
        }

        const startDateTime = parse(`${date}T${item.startTime}`, "yyyy-MM-dd'T'HH:mm", new Date())
        let endDateTime = parse(`${date}T${item.endTime}`, "yyyy-MM-dd'T'HH:mm", new Date())
        if (shiftType?.crossesMidnight || endDateTime <= startDateTime) {
          endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000)
        }

        const updated = await prisma.shift.update({
          where: { id: existingShift.id },
          data: {
            startDateTime,
            endDateTime,
            shiftTypeId: shiftType!.id,
            comment: item.comment || null,
          },
        })

        await prisma.notification.create({
          data: {
            teamId,
            userId,
            type: 'SHIFT_UPDATED',
            title: 'Vakt oppdatert',
            message: `Vakt oppdatert for ${date}`,
          },
        })

        return { status: 'success', userId, date, shiftId: updated.id }
      }

      if (!existingShift) {
        return { status: 'failure', userId, date, error: 'Shift not found' }
      }

      await prisma.shift.delete({ where: { id: existingShift.id } })
      await prisma.notification.create({
        data: {
          teamId,
          userId,
          type: 'SHIFT_DELETED',
          title: 'Vakt slettet',
          message: `Vakt slettet for ${date}`,
        },
      })

      return { status: 'success', userId, date, shiftId: existingShift.id }
    }

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(batch.map(item => processItem(item)))

      results.forEach(result => {
        if (result.status !== 'fulfilled') {
          return
        }
        const value = result.value
        if (value.status === 'success') {
          successes.push({ userId: value.userId, date: value.date, shiftId: value.shiftId })
        } else {
          failures.push({ userId: value.userId, date: value.date, error: value.error })
        }
      })
    }

    return NextResponse.json({ successes, failures })
  } catch (error) {
    console.error('Error processing bulk shifts:', error)
    return NextResponse.json({ error: 'Failed to process bulk shifts' }, { status: 500 })
  }
}

