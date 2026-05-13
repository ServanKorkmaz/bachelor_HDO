import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { userRoleUpdateSchema } from '@/lib/validation/schemas'

/** Get a user by id. Any authenticated user can look up another user's basic profile. */
export const GET = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: ctx.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        team: { select: { name: true } },
      },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json(user)
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
})

/** Update a user's role by id. Admin only. */
export const PUT = withAdmin<{ id: string }>(async (request, ctx) => {
  try {
    const parsed = await parseJsonBody(request, userRoleUpdateSchema)
    if ('error' in parsed) return parsed.error
    const { role } = parsed.data

    const user = await prisma.user.update({
      where: { id: ctx.params.id },
      data: { role },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
})
