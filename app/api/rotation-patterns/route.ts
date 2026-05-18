import { NextResponse } from 'next/server'
import { assertTeamMember, withAuth, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { rotationPatternCreateSchema } from '@/lib/validation/rotation-schemas'
import { createPattern, listPatterns } from '@/lib/services/rotation-service'
import { ServiceError } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request, ctx) => {
  const { searchParams } = new URL(request.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
  }

  const forbidden = await assertTeamMember(ctx, teamId)
  if (forbidden) return forbidden

  const patterns = await listPatterns(teamId)
  return NextResponse.json(patterns)
})

export const POST = withLeaderOrAdmin(async (request, ctx) => {
  const parsed = await parseJsonBody(request, rotationPatternCreateSchema)
  if ('error' in parsed) return parsed.error

  const forbidden = await assertTeamMember(ctx, parsed.data.teamId, ['ADMIN', 'LEADER'])
  if (forbidden) return forbidden

  try {
    const pattern = await createPattern({ ...parsed.data, actorUserId: ctx.userId })
    return NextResponse.json(pattern)
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})
