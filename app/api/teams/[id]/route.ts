import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/auth/withAuth'

/** Delete a team by id. Admin only. */
export const DELETE = withAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    await prisma.team.delete({
      where: { id: ctx.params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting team:', error)
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
  }
})
