import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** List notifications for a user or team. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const teamId = searchParams.get('teamId')

    if (!userId && !teamId) {
      return NextResponse.json({ error: 'userId or teamId is required' }, { status: 400 })
    }

    const where: any = {}
    if (userId) {
      where.userId = userId
    }
    if (teamId) {
      where.teamId = teamId
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json(notifications)
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

