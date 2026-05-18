import { NextResponse } from 'next/server'
import { assertTeamMember, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { rotationGenerateSchema } from '@/lib/validation/rotation-schemas'
import { generateShifts, getPattern } from '@/lib/services/rotation-service'
import { ServiceError } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

export const POST = withLeaderOrAdmin<{ id: string }>(async (request, ctx) => {
  const limited = applyRateLimit(request, RATE_LIMITS.rotationGenerate)
  if (limited) return limited

  const parsed = await parseJsonBody(request, rotationGenerateSchema)
  if ('error' in parsed) return parsed.error

  try {
    const pattern = await getPattern(ctx.params.id)
    const forbidden = await assertTeamMember(ctx, pattern.teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    const result = await generateShifts({
      patternId: ctx.params.id,
      startMonday: parsed.data.startMonday,
      weeks: parsed.data.weeks,
      actorUserId: ctx.userId,
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})
