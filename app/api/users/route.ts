import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * List users. Returns only non-sensitive fields (id, name, role, teamId) so the
 * schedule UI can populate dropdowns without exposing emails, Azure OIDs,
 * login timestamps or other PII. Gated by cookie-based session auth.
 * Optional teamId: only users with active TeamMembership in that team.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    // Source of truth for team membership is the TeamMembership table.
    // User.teamId is kept only as a display-level "home team" reference.
    const users = await prisma.user.findMany({
      where: teamId
        ? { teamMemberships: { some: { teamId, status: 'active' } } }
        : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        role: true,
        teamId: true,
      },
    })

    return NextResponse.json(users)
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

