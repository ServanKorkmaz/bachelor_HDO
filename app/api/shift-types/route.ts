import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withLeaderOrAdmin, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { shiftTypeBodySchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/** List all shift types. Any authenticated user can read these. */
export const GET = withAuth(async () => {
  try {
    const shiftTypes = await prisma.shiftType.findMany({
      orderBy: { code: 'asc' },
    })

    return NextResponse.json(shiftTypes)
  } catch (error) {
    console.error('Error fetching shift types:', error)
    return NextResponse.json({ error: 'Failed to fetch shift types' }, { status: 500 })
  }
})

/** Create a new shift type. Admin only. */
export const POST = withLeaderOrAdmin(async (request) => {
  try {
    const parsed = await parseJsonBody(request, shiftTypeBodySchema)
    if ('error' in parsed) return parsed.error
    const { code, label, color, defaultStartTime, defaultEndTime, crossesMidnight } = parsed.data

    const shiftType = await prisma.shiftType.create({
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
    console.error('Error creating shift type:', error)
    return NextResponse.json({ error: 'Failed to create shift type' }, { status: 500 })
  }
})
