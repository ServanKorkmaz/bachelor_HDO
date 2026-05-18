import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { shiftTypeBodySchema } from '@/lib/validation/schemas'

/** Update a shift type by id. Admin only. */
export const PUT = withAdmin<{ id: string }>(async (request, ctx) => {
  try {
    const parsed = await parseJsonBody(request, shiftTypeBodySchema)
    if ('error' in parsed) return parsed.error
    const { code, label, color, defaultStartTime, defaultEndTime, crossesMidnight } = parsed.data

    const shiftType = await prisma.shiftType.update({
      where: { id: ctx.params.id },
      data: {
        code,
        label,
        color,
        defaultStartTime,
        defaultEndTime,
        crossesMidnight: crossesMidnight ?? false,
      },
    })

    return NextResponse.json(shiftType)
  } catch (error) {
    console.error('Error updating shift type:', error)
    return NextResponse.json({ error: 'Failed to update shift type' }, { status: 500 })
  }
})

/** Delete a shift type by id. Admin only. */
export const DELETE = withAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    await prisma.shiftType.delete({
      where: { id: ctx.params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting shift type:', error)
    return NextResponse.json({ error: 'Failed to delete shift type' }, { status: 500 })
  }
})
