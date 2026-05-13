import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/auth/withAuth'

/** Mark a notification as read. Only the recipient (or an admin) can do this. */
export const POST = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const existing = await prisma.notification.findUnique({
      where: { id: ctx.params.id },
      select: { id: true, userId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    if (existing.userId !== ctx.userId && ctx.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const notification = await prisma.notification.update({
      where: { id: ctx.params.id },
      data: { read: true },
    })

    return NextResponse.json(notification)
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 })
  }
})
