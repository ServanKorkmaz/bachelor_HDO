import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

/** Delete a team by id. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = await getCurrentUserId(request)
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

    await prisma.team.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting team:', error)
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
  }
}

