import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
const ALLOWED_ROLES = ['ADMIN', 'LEADER', 'EMPLOYEE'] as const

/** Update a user's role by id. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { role } = body

    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
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

