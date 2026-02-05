import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** List users. Optional teamId: only users with active TeamMembership in that team. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    const users = await prisma.user.findMany({
      where: teamId
        ? {
            OR: [
              { teamMemberships: { some: { teamId, status: 'active' } } },
              { teamId }, // fallback: brukere med teamId før TeamMembership
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(users)
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

