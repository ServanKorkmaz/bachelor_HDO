import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/** Delete a team by id. Admin only. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authResult: { currentUser?: { id: string; role: string } } = {}
  const err = await requireAdmin(request, authResult)
  if (err) return err

  try {
    await prisma.team.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting team:', error)
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
  }
}
