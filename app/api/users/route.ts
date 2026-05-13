import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * List users. Returns only non-sensitive fields (id, name, role, teamId) so the
 * mock-auth RoleSwitcher can bootstrap on first load without exposing emails,
 * Azure OIDs, login timestamps or other PII. In production this endpoint would
 * be replaced by the Azure AD / Entra ID directory and gated by authentication.
 * Optional teamId: only users with active TeamMembership in that team.
 */
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

