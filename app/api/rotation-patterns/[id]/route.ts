import { NextResponse } from 'next/server'
import { assertTeamMember, withAuth, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { rotationPatternUpdateSchema } from '@/lib/validation/rotation-schemas'
import {
  deletePattern,
  getPattern,
  updatePattern,
} from '@/lib/services/rotation-service'
import { ServiceError } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

export const GET = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const pattern = await getPattern(ctx.params.id)
    const forbidden = await assertTeamMember(ctx, pattern.teamId)
    if (forbidden) return forbidden
    return NextResponse.json(pattern)
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})

export const PUT = withLeaderOrAdmin<{ id: string }>(async (request, ctx) => {
  const parsed = await parseJsonBody(request, rotationPatternUpdateSchema)
  if ('error' in parsed) return parsed.error

  const forbidden = await assertTeamMember(ctx, parsed.data.teamId, ['ADMIN', 'LEADER'])
  if (forbidden) return forbidden

  try {
    const updated = await updatePattern(ctx.params.id, { ...parsed.data, actorUserId: ctx.userId })
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})

export const DELETE = withLeaderOrAdmin<{ id: string }>(async (request, ctx) => {
  try {
    const pattern = await getPattern(ctx.params.id)
    const forbidden = await assertTeamMember(ctx, pattern.teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden
    await deletePattern(ctx.params.id, ctx.userId)
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})
