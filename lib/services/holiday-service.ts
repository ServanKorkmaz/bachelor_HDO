import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/admin/audit'
import { holidayTypeToNorwegian, statusToNorwegian } from '@/lib/i18n'
import { dateNDaysAgoString, todayStringInTimeZone } from '@/lib/date-utils'
import { ServiceError } from './errors'

export type HolidayType = 'HOLIDAY' | 'ABSENCE' | 'SICKNESS'

export interface CreateHolidayInput {
  teamId: string
  userId: string
  type: HolidayType
  dateFrom: string
  dateTo?: string | null
  message?: string | null
}

/**
 * Date sanity checks: holidays can't be in the past; sickness can only be
 * back-dated up to 30 days. Throws so the route handler maps to 400.
 */
function assertDates(input: { type: HolidayType; dateFrom: string; dateTo?: string | null }) {
  const todayStr = todayStringInTimeZone()
  const earliestSickness = dateNDaysAgoString(30)

  if (input.type !== 'SICKNESS' && input.dateFrom < todayStr) {
    throw new ServiceError(
      'HOLIDAY_PAST_START',
      'Start date cannot be in the past for holiday/absence',
      400
    )
  }
  if (input.type === 'SICKNESS' && input.dateFrom < earliestSickness) {
    throw new ServiceError(
      'HOLIDAY_TOO_OLD',
      'Sickness requests can only be submitted up to 30 days in the past',
      400
    )
  }
  if (input.dateTo && input.dateTo < input.dateFrom) {
    throw new ServiceError('HOLIDAY_DATE_ORDER', 'End date cannot be before start date', 400)
  }
}

/**
 * Reject submissions that overlap an existing non-rejected request for the
 * same user. The DB-level exclusion constraint
 * (`holiday_requests_no_overlap_per_user`) is the load-bearing check —
 * race-safe even under concurrent submissions — but doing a pre-check here
 * lets the user see a friendly 409 instead of a generic 500 in the common
 * non-racing case.
 */
async function assertNoOverlap(input: CreateHolidayInput) {
  const newEnd = input.dateTo ?? input.dateFrom
  const overlapping = await prisma.holidayRequest.findFirst({
    where: {
      userId: input.userId,
      status: { not: 'REJECTED' },
      dateFrom: { lte: newEnd },
      OR: [
        { dateTo: { gte: input.dateFrom } },
        // Rows with no dateTo cover exactly one day = dateFrom. They overlap
        // the new range when that single day falls inside it.
        { dateTo: null, dateFrom: { gte: input.dateFrom } },
      ],
    },
    select: { id: true },
  })
  if (overlapping) {
    throw new ServiceError(
      'HOLIDAY_OVERLAP',
      'Du har allerede en forespørsel som overlapper med denne perioden',
      409
    )
  }
}

/**
 * Submit a new holiday/absence/sickness request for `userId`. Posts a team-wide
 * notification so leaders can see it. The actor (used for the audit log) is
 * always the same as the request owner — the service does not support
 * submitting on someone else's behalf.
 */
export async function createHoliday(input: CreateHolidayInput) {
  assertDates(input)
  await assertNoOverlap(input)

  try {
    return await prisma.$transaction(async (tx) => {
      const hr = await tx.holidayRequest.create({
        data: {
          teamId: input.teamId,
          userId: input.userId,
          type: input.type,
          status: 'PENDING',
          dateFrom: input.dateFrom,
          dateTo: input.dateTo || null,
          message: input.message || null,
        },
        include: { user: { select: { id: true, name: true } } },
      })

      const typeNor = holidayTypeToNorwegian(input.type)
      await tx.notification.create({
        data: {
          teamId: input.teamId,
          userId: null,
          type: 'HOLIDAY_REQUESTED',
          title: 'Ny fraværsforespørsel',
          message: `${hr.user.name} sendte inn en forespørsel om ${typeNor}`,
        },
      })

      await createAuditLog(tx, {
        actorUserId: input.userId,
        action: 'HOLIDAY_REQUESTED',
        entityType: 'holiday_request',
        entityId: hr.id,
        afterJson: JSON.stringify({
          type: input.type,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        }),
      })

      return hr
    })
  } catch (e) {
    // Race fallback: another submission slipped past the pre-check and the DB
    // exclusion constraint kicked in. The error wrapping varies between
    // Prisma versions, so match on either the known code or the constraint
    // name in the message.
    const msg = e instanceof Error ? e.message : ''
    const isExclusion =
      msg.includes('holiday_requests_no_overlap_per_user') ||
      (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2010')
    if (isExclusion) {
      throw new ServiceError(
        'HOLIDAY_OVERLAP',
        'Du har allerede en forespørsel som overlapper med denne perioden',
        409
      )
    }
    throw e
  }
}

/**
 * Leader/admin decides on a PENDING holiday request — APPROVE or REJECT.
 * Writes one audit row and notifies the requester. Returns the updated row
 * with the user relation, matching the route's previous response shape.
 */
export async function decideHoliday(
  holidayRequestId: string,
  actorUserId: string,
  action: 'APPROVE' | 'REJECT'
) {
  return prisma.$transaction(async (tx) => {
    const hr = await tx.holidayRequest.findUnique({ where: { id: holidayRequestId } })
    if (!hr) {
      throw new ServiceError('HOLIDAY_NOT_FOUND', 'Not found', 404)
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    const res = await tx.holidayRequest.update({
      where: { id: holidayRequestId },
      data: { status: newStatus, decidedBy: actorUserId, decidedAt: new Date() },
      include: { user: { select: { id: true, name: true } } },
    })

    const typeNor = holidayTypeToNorwegian(res.type)
    const statusNor = statusToNorwegian(newStatus)
    await tx.notification.create({
      data: {
        teamId: res.teamId,
        userId: res.userId,
        type: 'HOLIDAY_DECIDED',
        title: `Forespørsel ${statusNor}`,
        message: `Din ${typeNor}-forespørsel ble ${statusNor.toLowerCase()}`,
      },
    })

    await createAuditLog(tx, {
      actorUserId,
      action: action === 'APPROVE' ? 'HOLIDAY_APPROVED' : 'HOLIDAY_REJECTED',
      entityType: 'holiday_request',
      entityId: holidayRequestId,
      beforeJson: JSON.stringify(hr),
      afterJson: JSON.stringify(res),
    })

    return res
  })
}
