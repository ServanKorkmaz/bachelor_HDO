import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { requireTeamMembership } from '@/lib/auth/requireTeamMembership'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { shiftUpdateSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { parse } from 'date-fns'

/** Update a shift by id and notify the affected user. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.shiftWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, shiftUpdateSchema)
    if ('error' in parsed) return parsed.error
    const { date, userId, shiftTypeId, startTime, endTime, comment } = parsed.data

    const existingShift = await prisma.shift.findUnique({
      where: { id: params.id },
    })

    if (!existingShift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    const auth = await requireTeamMembership(request, existingShift.teamId, ['ADMIN', 'LEADER'])
    if ('error' in auth) return auth.error

    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    })

    if (!shiftType) {
      return NextResponse.json({ error: 'Shift type not found' }, { status: 404 })
    }

    const startDateTime = parse(`${date}T${startTime}`, "yyyy-MM-dd'T'HH:mm", new Date())
    let endDateTime = parse(`${date}T${endTime}`, "yyyy-MM-dd'T'HH:mm", new Date())

    if (shiftType.crossesMidnight || endDateTime <= startDateTime) {
      endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000)
    }

    let shift
    try {
      shift = await prisma.shift.update({
        where: { id: params.id },
        data: {
          userId,
          date,
          startDateTime,
          endDateTime,
          shiftTypeId,
          comment: comment || null,
        },
        include: {
          shiftType: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json(
          { error: 'Brukeren har allerede en vakt på denne datoen' },
          { status: 409 }
        )
      }
      throw e
    }

    // Create notification
    const updateTitle = 'Vakt oppdatert'
    const updateMessage = `Vakt oppdatert for ${shift.user.name} på ${date}`
    await prisma.notification.create({
      data: {
        teamId: existingShift.teamId,
        userId: existingShift.userId,
        type: 'SHIFT_UPDATED',
        title: updateTitle,
        message: updateMessage,
      },
    })
    void deliverNotificationToChannels({
      userId: existingShift.userId,
      teamId: existingShift.teamId,
      type: 'SHIFT_UPDATED',
      title: updateTitle,
      message: updateMessage,
    })

    return NextResponse.json(shift)
  } catch (error) {
    console.error('Error updating shift:', error)
    return NextResponse.json({ error: 'Failed to update shift' }, { status: 500 })
  }
}

/** Delete a shift by id and notify the affected user. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.shiftWrite)
    if (limited) return limited

    const shift = await prisma.shift.findUnique({
      where: { id: params.id },
      include: { user: true },
    })

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    const auth = await requireTeamMembership(request, shift.teamId, ['ADMIN', 'LEADER'])
    if ('error' in auth) return auth.error

    await prisma.shift.delete({
      where: { id: params.id },
    })

    // Create notification
    const delTitle = 'Vakt slettet'
    const delMessage = `Vakt slettet for ${shift.user.name} på ${shift.date}`
    await prisma.notification.create({
      data: {
        teamId: shift.teamId,
        userId: shift.userId,
        type: 'SHIFT_DELETED',
        title: delTitle,
        message: delMessage,
      },
    })
    void deliverNotificationToChannels({
      userId: shift.userId,
      teamId: shift.teamId,
      type: 'SHIFT_DELETED',
      title: delTitle,
      message: delMessage,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting shift:', error)
    return NextResponse.json({ error: 'Failed to delete shift' }, { status: 500 })
  }
}

