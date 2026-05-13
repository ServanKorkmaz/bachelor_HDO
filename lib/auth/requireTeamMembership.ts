import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from './getCurrentUserId'

export type TeamAuth = { userId: string; role: 'ADMIN' | 'LEADER' | 'EMPLOYEE' }

/**
 * Require the current user to have active membership in the given team.
 * Admins bypass the membership check (can read any team). Optionally also
 * restrict to a set of system roles (e.g. only ADMIN/LEADER may write).
 */
export async function requireTeamMembership(
  request: Request,
  teamId: string,
  allowedRoles?: TeamAuth['role'][]
): Promise<{ error: NextResponse } | TeamAuth> {
  const userId = await getCurrentUserId(request)
  if (!userId) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 401 }) }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, teamId: true },
  })
  if (!user) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 401 }) }
  }

  if (allowedRoles && !allowedRoles.includes(user.role as TeamAuth['role'])) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  if (user.role === 'ADMIN') {
    return { userId: user.id, role: user.role }
  }

  if (user.teamId === teamId) {
    return { userId: user.id, role: user.role as TeamAuth['role'] }
  }

  const membership = await prisma.teamMembership.findFirst({
    where: { userId: user.id, teamId, status: 'active' },
    select: { id: true },
  })
  if (!membership) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { userId: user.id, role: user.role as TeamAuth['role'] }
}
