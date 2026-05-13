import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from './getCurrentUserId'
import type { TeamAuth } from './requireTeamMembership'

/**
 * Require an authenticated caller without any team scope. Returns the caller's
 * id and system role, or a 401 NextResponse if no valid session header is set.
 */
export async function requireAuth(
  request: Request,
  allowedRoles?: TeamAuth['role'][]
): Promise<{ error: NextResponse } | TeamAuth> {
  const userId = await getCurrentUserId(request)
  if (!userId) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 401 }) }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!user) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 401 }) }
  }

  if (allowedRoles && !allowedRoles.includes(user.role as TeamAuth['role'])) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { userId: user.id, role: user.role as TeamAuth['role'] }
}
