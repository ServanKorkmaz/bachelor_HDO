import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/auth/withAuth'

/**
 * Lightweight current-user endpoint used by the header UserMenu. Wrapped with
 * withAuth so it returns 401 without a valid session and 404 if the user row
 * disappeared since the cookie was issued.
 */
export const GET = withAuth(async (_req, ctx) => {
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, name: true, email: true, role: true, teamId: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
})
