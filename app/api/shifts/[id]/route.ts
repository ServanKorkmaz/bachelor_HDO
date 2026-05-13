import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { shiftUpdateSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { deleteShift, updateShift } from '@/lib/services/shift-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Update a shift by id and notify the affected user. */
export const PUT = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.shiftWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, shiftUpdateSchema)
    if ('error' in parsed) return parsed.error

    const existingShift = await prisma.shift.findUnique({
      where: { id: ctx.params.id },
    })

    if (!existingShift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    const forbidden = await assertTeamMember(ctx, existingShift.teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    const shift = await updateShift(existingShift, parsed.data)
    return NextResponse.json(shift)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error updating shift:', error)
    return NextResponse.json({ error: 'Failed to update shift' }, { status: 500 })
  }
})

/** Delete a shift by id and notify the affected user. */
export const DELETE = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.shiftWrite)
    if (limited) return limited

    const shift = await prisma.shift.findUnique({
      where: { id: ctx.params.id },
      include: { user: true },
    })

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    const forbidden = await assertTeamMember(ctx, shift.teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    await deleteShift(shift)
    return NextResponse.json({ success: true })
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error deleting shift:', error)
    return NextResponse.json({ error: 'Failed to delete shift' }, { status: 500 })
  }
})
