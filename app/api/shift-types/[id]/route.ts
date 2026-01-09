import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { code, label, color, defaultStartTime, defaultEndTime, crossesMidnight } = body

    const shiftType = await prisma.shiftType.update({
      where: { id: params.id },
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
    console.error('Error updating shift type:', error)
    return NextResponse.json({ error: 'Failed to update shift type' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.shiftType.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting shift type:', error)
    return NextResponse.json({ error: 'Failed to delete shift type' }, { status: 500 })
  }
}

