import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const VALID_ROLES = ['ADMIN', 'LEADER', 'EMPLOYEE'] as const

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { role } = body

    if (!role || !VALID_ROLES.includes(role as any)) {
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

