import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** List all shift types. */
export async function GET() {
  try {
    const shiftTypes = await prisma.shiftType.findMany({
      orderBy: { code: 'asc' },
    })

    return NextResponse.json(shiftTypes)
  } catch (error) {
    console.error('Error fetching shift types:', error)
    return NextResponse.json({ error: 'Failed to fetch shift types' }, { status: 500 })
  }
}

/** Create a new shift type. */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { code, label, color, defaultStartTime, defaultEndTime, crossesMidnight } = body

    if (!code || !label || !color || !defaultStartTime || !defaultEndTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const shiftType = await prisma.shiftType.create({
      data: {
        code,
        label,
        color,
        defaultStartTime,
        defaultEndTime,
        crossesMidnight: crossesMidnight || false,
      },
    })

    return NextResponse.json(shiftType)
  } catch (error) {
    console.error('Error creating shift type:', error)
    return NextResponse.json({ error: 'Failed to create shift type' }, { status: 500 })
  }
}

