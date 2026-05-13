import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { buildShiftDateTimes, ShiftTimeError } from '@/lib/shifts/time'
import { ServiceError } from './errors'

const shiftInclude = {
  shiftType: true,
  user: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ShiftInclude

export type ShiftWithRelations = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>

/** Minimal shape needed to compute datetimes; bulk passes pre-fetched rows here. */
type ShiftTypeForTimes = { crossesMidnight: boolean }

export interface CreateShiftInput {
  teamId: string
  userId: string
  date: string
  shiftTypeId: string
  startTime: string
  endTime: string
  comment?: string | null
  /**
   * Optional pre-fetched shift type. When provided the service skips its own
   * lookup — used by the bulk route to avoid N round-trips for the same set
   * of shift-type ids.
   */
  shiftType?: ShiftTypeForTimes
}

export interface UpdateShiftInput {
  userId: string
  date: string
  shiftTypeId: string
  startTime: string
  endTime: string
  comment?: string | null
  shiftType?: ShiftTypeForTimes
}

/** Lookup a shift type or throw a typed not-found error. */
async function loadShiftType(shiftTypeId: string, preloaded?: ShiftTypeForTimes) {
  if (preloaded) return preloaded
  const shiftType = await prisma.shiftType.findUnique({ where: { id: shiftTypeId } })
  if (!shiftType) {
    throw new ServiceError('SHIFT_TYPE_NOT_FOUND', 'Shift type not found', 404)
  }
  return shiftType
}

/** Build datetimes for a shift, translating ShiftTimeError into a domain error. */
function resolveTimes(args: {
  date: string
  startTime: string
  endTime: string
  shiftType: { crossesMidnight: boolean }
}) {
  try {
    return buildShiftDateTimes(args)
  } catch (e) {
    if (e instanceof ShiftTimeError) {
      throw new ServiceError('INVALID_TIME', e.message, 400)
    }
    throw e
  }
}

/** Map Prisma's unique-constraint code to a domain duplicate error. */
function translateUniqueViolation(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new ServiceError(
      'DUPLICATE_SHIFT',
      'Brukeren har allerede en vakt på denne datoen',
      409
    )
  }
  throw e
}

/** Persist a notification row and fan it out to the user's channels. */
async function notify(params: {
  teamId: string
  userId: string
  type: 'SHIFT_CREATED' | 'SHIFT_UPDATED' | 'SHIFT_DELETED'
  title: string
  message: string
}) {
  await prisma.notification.create({
    data: {
      teamId: params.teamId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
    },
  })
  void deliverNotificationToChannels(params)
}

/** Create a shift, then notify the assigned user. */
export async function createShift(input: CreateShiftInput): Promise<ShiftWithRelations> {
  const shiftType = await loadShiftType(input.shiftTypeId, input.shiftType)
  const { startDateTime, endDateTime } = resolveTimes({
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType,
  })

  let shift: ShiftWithRelations
  try {
    shift = await prisma.shift.create({
      data: {
        teamId: input.teamId,
        userId: input.userId,
        date: input.date,
        startDateTime,
        endDateTime,
        shiftTypeId: input.shiftTypeId,
        comment: input.comment || null,
      },
      include: shiftInclude,
    })
  } catch (e) {
    translateUniqueViolation(e)
  }

  await notify({
    teamId: shift.teamId,
    userId: shift.userId,
    type: 'SHIFT_CREATED',
    title: 'Vakt opprettet',
    message: `Ny vakt opprettet for ${shift.user.name} på ${input.date}`,
  })

  return shift
}

/**
 * Update an already-loaded shift and notify the previous assignee. Caller is
 * expected to have fetched `existing` for the auth check; passing it in avoids
 * a redundant lookup and keeps the recipient stable across a reassignment.
 */
export async function updateShift(
  existing: { id: string; teamId: string; userId: string },
  input: UpdateShiftInput
): Promise<ShiftWithRelations> {
  const shiftType = await loadShiftType(input.shiftTypeId, input.shiftType)
  const { startDateTime, endDateTime } = resolveTimes({
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType,
  })

  let shift: ShiftWithRelations
  try {
    shift = await prisma.shift.update({
      where: { id: existing.id },
      data: {
        userId: input.userId,
        date: input.date,
        startDateTime,
        endDateTime,
        shiftTypeId: input.shiftTypeId,
        comment: input.comment || null,
      },
      include: shiftInclude,
    })
  } catch (e) {
    translateUniqueViolation(e)
  }

  await notify({
    teamId: existing.teamId,
    userId: existing.userId,
    type: 'SHIFT_UPDATED',
    title: 'Vakt oppdatert',
    message: `Vakt oppdatert for ${shift.user.name} på ${input.date}`,
  })

  return shift
}

/** Delete an already-loaded shift and notify the previous assignee. */
export async function deleteShift(existing: {
  id: string
  teamId: string
  userId: string
  date: string
  user: { name: string }
}): Promise<void> {
  await prisma.shift.delete({ where: { id: existing.id } })

  await notify({
    teamId: existing.teamId,
    userId: existing.userId,
    type: 'SHIFT_DELETED',
    title: 'Vakt slettet',
    message: `Vakt slettet for ${existing.user.name} på ${existing.date}`,
  })
}
