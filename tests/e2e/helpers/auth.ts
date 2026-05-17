import type { BrowserContext } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { sealSession, sessionCookieName } from '../../../lib/auth/session'

const prisma = new PrismaClient()

/**
 * Seed a __hdo_session cookie into the browser context for a seeded user.
 * Looks up the user by email so it stays valid across re-seeds (cuids change).
 * Exercises the production cookie path end-to-end without round-tripping
 * Microsoft.
 */
export async function signInAsEmail(
  context: BrowserContext,
  email: string,
  baseUrl: string = 'http://localhost:4000'
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) {
    throw new Error(
      `E2E auth helper: no user with email ${email}. Did you run npm run db:seed?`
    )
  }

  const sealed = await sealSession({ userId: user.id })
  const url = new URL(baseUrl)
  await context.addCookies([
    {
      name: sessionCookieName,
      value: sealed,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ])
}

/** Seed admin email (created by prisma/seed.ts). Stable across re-seeds. */
export const SEED_ADMIN_EMAIL = 'admin@hdo.no'
