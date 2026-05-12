import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { teamCreateSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/** List all teams. */
export async function GET() {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(teams)
  } catch (error) {
    console.error('Error fetching teams:', error)
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }
}

/** Create a team and default notification settings. */
export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, teamCreateSchema)
    if ('error' in parsed) return parsed.error
    const { name, currentUserId } = parsed.data

    if (!currentUserId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    })

    if (!currentUser || currentUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const team = await prisma.team.create({
      data: { name },
    })

    // Create default notification settings
    await prisma.notificationSettings.create({
      data: {
        teamId: team.id,
        emailEnabled: true,
        smsEndpoint: null,
      },
    })

    return NextResponse.json(team)
  } catch (error) {
    console.error('Error creating team:', error)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}

