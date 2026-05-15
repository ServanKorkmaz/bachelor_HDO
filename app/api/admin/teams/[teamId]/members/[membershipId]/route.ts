import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'
import { patchMembershipSchema } from '@/lib/admin/schemas'

/** PATCH /api/admin/teams/:teamId/members/:membershipId - Update role/status. Admin or leader only. */
export const PATCH = withLeaderOrAdmin<{ teamId: string; membershipId: string }>(async (request, ctx) => {
  try {
    const { teamId, membershipId } = ctx.params
    const body = await request.json().catch(() => ({}))
    const parsed = patchMembershipSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    const updateData: Prisma.TeamMembershipUpdateInput = {}
    if (data.role !== undefined) updateData.role = data.role
    if (data.status !== undefined) updateData.status = data.status
    if (Object.keys(updateData).length === 0) {
      const current = await prisma.teamMembership.findFirst({
        where: { id: membershipId, teamId },
        include: { team: { select: { id: true, name: true } } },
      })
      if (!current) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
      return NextResponse.json(current)
    }

    const existing = await prisma.teamMembership.findFirst({
      where: { id: membershipId, teamId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    }

    const beforeJson = JSON.stringify({
      role: existing.role,
      status: existing.status,
    })
    const updated = await prisma.$transaction(async (tx) => {
      const m = await tx.teamMembership.update({
        where: { id: membershipId },
        data: updateData,
        include: { team: { select: { id: true, name: true } } },
      })
      await createAuditLog(tx, {
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.MEMBERSHIP_UPDATED,
        entityType: AUDIT_ENTITY_TYPE.TEAM_MEMBERSHIP,
        entityId: membershipId,
        beforeJson,
        afterJson: JSON.stringify(updateData),
      })
      return m
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('PATCH /api/admin/teams/.../members/[membershipId]', e)
    return NextResponse.json(
      { error: 'Failed to update membership' },
      { status: 500 }
    )
  }
})

/** DELETE /api/admin/teams/:teamId/members/:membershipId - Soft remove (set status inactive). Admin or leader only. */
export const DELETE = withLeaderOrAdmin<{ teamId: string; membershipId: string }>(async (_request, ctx) => {
  try {
    const { teamId, membershipId } = ctx.params

    const existing = await prisma.teamMembership.findFirst({
      where: { id: membershipId, teamId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    }
    if (existing.status === 'inactive') {
      return NextResponse.json(existing)
    }

    const beforeJson = JSON.stringify({ status: existing.status })
    const afterJson = JSON.stringify({ status: 'inactive' })

    const updated = await prisma.$transaction(async (tx) => {
      const m = await tx.teamMembership.update({
        where: { id: membershipId },
        data: { status: 'inactive' },
        include: { team: { select: { id: true, name: true } } },
      })
      await createAuditLog(tx, {
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.MEMBER_REMOVED,
        entityType: AUDIT_ENTITY_TYPE.TEAM_MEMBERSHIP,
        entityId: membershipId,
        beforeJson,
        afterJson,
      })
      return m
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('DELETE /api/admin/teams/.../members/[membershipId]', e)
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    )
  }
})
