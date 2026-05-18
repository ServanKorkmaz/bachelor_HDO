import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { bulkShiftSchema, type BulkShiftBody } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { createShift, deleteShift, updateShift } from '@/lib/services/shift-service'
import { ServiceError } from '@/lib/services/errors'

type BulkShiftItem = BulkShiftBody['items'][number]

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const timeRegex = /^\d{2}:\d{2}$/
const BATCH_SIZE = 20

type ItemResult =
  | { status: 'success'; userId: string; date: string; shiftId: string }
  | { status: 'failure'; userId: string; date: string; error: string }

/**
 * Bulk create, update, or delete shifts for multiple users and dates.
 *
 * The route is the *batch coordinator*: it pre-fetches users and shift types
 * once, then delegates each item to `lib/services/shift-service.ts` so the
 * domain rules (time validation, duplicate-shift handling, notification +
 * delivery) live in exactly one place.
 */
export const POST = withAuth(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.shiftsBulk)
    if (limited) return limited

    const parsed = await parseJsonBody(request, bulkShiftSchema)
    if ('error' in parsed) return parsed.error
    const { action, items, teamId } = parsed.data

    const forbidden = await assertTeamMember(ctx, teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    if (items.length === 0) {
      return NextResponse.json({ error: 'items is required' }, { status: 400 })
    }

    // Batch-fetch the user/shift-type rows once so per-item processing can run
    // in parallel without N round-trips for the same handful of ids.
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

    const successes: Array<{ userId: string; date: string; shiftId: string }> = []
    const failures: Array<{ userId: string; date: string; error: string }> = []

    const processItem = async (item: BulkShiftItem): Promise<ItemResult> => {
      let userId = item.userId
      let date = item.date
      let existingShift: { id: string; teamId: string; userId: string; date: string; shiftTypeId: string; user: { name: string } } | null = null

      if (item.shiftId) {
        const shift = await prisma.shift.findUnique({
          where: { id: item.shiftId },
          select: { id: true, userId: true, date: true, teamId: true, shiftTypeId: true, user: { select: { name: true } } },
        })
        if (!shift || shift.teamId !== teamId) {
          return { status: 'failure', userId: userId || '', date: date || '', error: 'Shift not found' }
        }
        existingShift = shift
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

      if (!existingShift && action !== 'create') {
        const found = await prisma.shift.findFirst({
          where: { userId, date, teamId },
          select: { id: true, teamId: true, userId: true, date: true, shiftTypeId: true, user: { select: { name: true } } },
        })
        existingShift = found
      }

      try {
        if (action === 'create') {
          const created = await createShift({
            teamId,
            userId,
            actorUserId: ctx.userId,
            date,
            shiftTypeId: shiftType!.id,
            startTime: item.startTime!,
            endTime: item.endTime!,
            comment: item.comment,
            shiftType: shiftType ?? undefined,
          })
          return { status: 'success', userId, date, shiftId: created.id }
        }

        if (action === 'update') {
          if (!existingShift) {
            return { status: 'failure', userId, date, error: 'Shift not found' }
          }
          const updated = await updateShift(existingShift, {
            userId,
            actorUserId: ctx.userId,
            date,
            shiftTypeId: shiftType!.id,
            startTime: item.startTime!,
            endTime: item.endTime!,
            comment: item.comment,
            shiftType: shiftType ?? undefined,
          })
          return { status: 'success', userId, date, shiftId: updated.id }
        }

        // action === 'delete'
        if (!existingShift) {
          return { status: 'failure', userId, date, error: 'Shift not found' }
        }
        await deleteShift(existingShift, ctx.userId)
        return { status: 'success', userId, date, shiftId: existingShift.id }
      } catch (e) {
        if (e instanceof ServiceError) {
          return { status: 'failure', userId, date, error: e.message }
        }
        throw e
      }
    }

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(batch.map(item => processItem(item)))

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const value = result.value
          if (value.status === 'success') {
            successes.push({ userId: value.userId, date: value.date, shiftId: value.shiftId })
          } else {
            failures.push({ userId: value.userId, date: value.date, error: value.error })
          }
          return
        }
        // A non-ServiceError escaped processItem (e.g. Prisma transient error).
        // Surface it as a failure so the result counts match the input and the
        // client sees the row, instead of silently dropping it. Log the reason
        // server-side; do not leak it to the client.
        const item = batch[idx]
        console.error('Bulk shift item rejected:', result.reason)
        failures.push({
          userId: item?.userId ?? '',
          date: item?.date ?? '',
          error: 'Unexpected error',
        })
      })
    }

    return NextResponse.json({ successes, failures })
  } catch (error) {
    console.error('Error processing bulk shifts:', error)
    return NextResponse.json({ error: 'Failed to process bulk shifts' }, { status: 500 })
  }
})
