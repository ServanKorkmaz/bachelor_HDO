import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { userRoleUpdateSchema } from '@/lib/validation/schemas'

/** Get a user by id. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
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
}

/** Update a user's role by id. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const parsed = await parseJsonBody(request, userRoleUpdateSchema)
    if ('error' in parsed) return parsed.error
    const { role, currentUserId } = parsed.data

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

    const user = await prisma.user.update({
      where: { id: params.id },
      data: { role },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

