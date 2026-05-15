import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from './getCurrentUserId'

export type UserRole = 'ADMIN' | 'LEADER' | 'EMPLOYEE'

/**
 * Authenticated request context populated by `withAuth` / `withAdmin`. A
 * handler that receives this object is guaranteed to have run through the
 * auth gate — that is the whole point of the wrapper pattern.
 */
export interface AuthCtx {
  readonly userId: string
  readonly role: UserRole
}

/**
 * Next.js route handlers receive params synchronously in older versions and as
 * a Promise in 15+. Accept either so the wrapper works regardless of which
 * pattern a given route still uses, and so tests can pass plain objects.
 */
type RouteContext<TParams> = { params: TParams | Promise<TParams> }

type AuthedHandler<TParams> = (
  request: Request,
  ctx: AuthCtx & { params: TParams }
) => Promise<Response> | Response

interface WithAuthOptions {
  /** Allowed system roles. If omitted, any authenticated user is accepted. */
  roles?: UserRole[]
}

/**
 * Wrap a Next.js route handler so the auth check runs before the body — and
 * cannot be skipped by mistake. The handler receives a typed `ctx` that is
 * only constructable by this function, which makes "forgot auth check" a
 * compile-time impossibility for any route that uses the wrapper.
 *
 * The auth check itself mirrors the previous `requireAuth` helper: read the
 * mock session header (later: signed session cookie from passport-microsoft),
 * load the user, optionally narrow by system role.
 */
export function withAuth<TParams = Record<string, never>>(
  handler: AuthedHandler<TParams>,
  options: WithAuthOptions = {}
): (request: Request, route?: RouteContext<TParams>) => Promise<Response> {
  return async (request, route) => {
    const userId = await getCurrentUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    if (options.roles && !options.roles.includes(user.role as UserRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = (await route?.params) ?? ({} as TParams)
    return handler(request, {
      userId: user.id,
      role: user.role as UserRole,
      params,
    })
  }
}

/** Convenience wrapper for routes restricted to system ADMIN. */
export function withAdmin<TParams = Record<string, never>>(
  handler: AuthedHandler<TParams>
) {
  return withAuth<TParams>(handler, { roles: ['ADMIN'] })
}

/** Convenience wrapper for routes accessible to ADMIN or LEADER. */
export function withLeaderOrAdmin<TParams = Record<string, never>>(
  handler: AuthedHandler<TParams>
) {
  return withAuth<TParams>(handler, { roles: ['ADMIN', 'LEADER'] })
}

/**
 * Verify that an already-authenticated caller is a member of `teamId`. Returns
 * a forbidden response that the handler should return as-is, or `null` when
 * the check passes. ADMIN bypasses the membership lookup so the same code path
 * supports cross-team admin reads. Pass `allowedRoles` to narrow further.
 *
 * The source of truth for team membership is the TeamMembership table, not
 * the cached `User.teamId` column — see SECURITY.md.
 */
export async function assertTeamMember(
  ctx: AuthCtx,
  teamId: string,
  allowedRoles?: UserRole[]
): Promise<NextResponse | null> {
  if (allowedRoles && !allowedRoles.includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (ctx.role === 'ADMIN') return null

  const membership = await prisma.teamMembership.findFirst({
    where: { userId: ctx.userId, teamId, status: 'active' },
    select: { id: true },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
