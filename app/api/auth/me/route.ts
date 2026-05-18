import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

/**
 * Lightweight current-user endpoint used by the header UserMenu and the
 * shared `useMe()` hook (so this is hit on nearly every page load). It skips
 * `withAuth` deliberately: the wrapper would do a redundant id+role lookup
 * just to call the same `findUnique` again here. Instead we use
 * `getCurrentUserId` (same session check the wrapper uses) and fold both
 * lookups into a single round-trip. Returns 401 without a valid session and
 * 404 if the user row disappeared since the cookie was issued.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = await getCurrentUserId(request)
  if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, teamId: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}
