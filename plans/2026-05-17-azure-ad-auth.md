# Azure AD Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock authentication (`x-current-user-id` header + Zustand `RoleSwitcher`) with real Microsoft Entra ID single-sign-on using `@azure/msal-node` and `iron-session` cookies, without changing any route handler, `withAuth`, `assertTeamMember`, or business-logic file.

**Architecture:** OAuth 2.0 Authorization Code flow with PKCE (S256), single tenant. Three new auth library modules (session, pkceCookie, azureAd, audit), four new API route handlers (`login`, `callback`, `logout`, `me`), one new `/login` page. Modified: `middleware.ts` (verify cookie signature), `getCurrentUserId.ts` (read cookie; fall back to header in `NODE_ENV='test'`), `Navigation.tsx` (`UserMenu` replaces `RoleSwitcher`), `lib/axios.ts` (drop header interceptor), `package.json` (deps + port), `SECURITY.md` (update migration section). Deleted: `mockAuth.ts`, `azure-ad-placeholder.ts`, both `RoleSwitcher` files.

**Tech Stack:** Next.js 14 App Router (Node runtime), `@azure/msal-node` v3, `iron-session` v8, Prisma 5, Vitest 4, Playwright 1.60, TypeScript 5.5.

**Spec:** `specs/2026-05-17-azure-ad-auth-design.md`

---

## File structure

### New files

| File | Responsibility |
|---|---|
| `lib/auth/session.ts` | `iron-session` wrapper. Cookie `__hdo_session`. 8h rolling TTL. |
| `lib/auth/pkceCookie.ts` | Short-lived `__hdo_pkce` cookie carrying PKCE state between `/login` and `/callback`. |
| `lib/auth/azureAd.ts` | MSAL `ConfidentialClientApplication` singleton + `buildAuthCodeUrl`/`exchangeCodeForTokens` helpers. |
| `lib/auth/audit.ts` | `logAuthEvent` — writes auth-specific events to `AuditLog`. Never throws into auth flow. Sentinel `'anonymous'` for failed-lookup cases. |
| `lib/auth/safeRedirect.ts` | `isSafeInternalPath(from)` — open-redirect guard. |
| `app/api/auth/azure/login/route.ts` | GET — start OAuth flow. |
| `app/api/auth/azure/callback/route.ts` | GET — verify state, exchange code, look up user, set session. |
| `app/api/auth/logout/route.ts` | POST — destroy session, audit, redirect. |
| `app/api/auth/me/route.ts` | GET — return logged-in user shape. |
| `app/login/page.tsx` | Sign-in page with "Logg inn med Microsoft" button. |
| `components/auth/UserMenu.tsx` | Header chip: user name + role + logout button. |
| `tests/e2e/helpers/auth.ts` | Mint an `iron-session` cookie for a seeded user via the production code path. Used by all e2e tests. |
| `.env.example` | Documents required env vars without values. |

### Modified files

| File | Change |
|---|---|
| `middleware.ts` | Verify `__hdo_session` cookie signature; redirect pages to `/login?from=…`, return 401 for `/api/*`. |
| `lib/auth/getCurrentUserId.ts` | Read from session cookie; fall back to `x-current-user-id` header only when `NODE_ENV==='test'`. |
| `components/layout/Navigation.tsx` | Replace `<RoleSwitcher />` and standalone Logg ut button with `<UserMenu />`. Drop `useAuth` import; derive admin/leader from `/api/auth/me`. |
| `lib/axios.ts` | Remove `x-current-user-id` interceptor; drop `useAuth` import. |
| `package.json` | Add `@azure/msal-node`, `iron-session`. Change `dev` script to `next dev -p 4000`. |
| `playwright.config.ts` | Set webServer to `npm run dev` on `http://localhost:4000` with `NODE_ENV=test` env. `baseURL` matches. |
| `lib/i18n.ts` | Add Norwegian strings for the login page + error codes. |
| `SECURITY.md` | Replace "Migration to passport-microsoft" section with the MSAL Node reality. |
| Existing e2e specs (`create-shift.spec.ts`, `holiday-request.spec.ts`, `smoke.spec.ts`, `swap-request.spec.ts`) | Replace RoleSwitcher-based auth bootstrap with `helpers/auth.ts` cookie seeding. |

### Deleted files

- `lib/auth/mockAuth.ts`
- `lib/auth/azure-ad-placeholder.ts`
- `components/auth/RoleSwitcher.tsx`
- `components/RoleSwitcher.tsx`
- `tests/lib/get-current-user-id.test.ts` *(will be replaced with new cases against the new implementation; we delete and recreate rather than edit)*

### Test files

| Test file | Covers |
|---|---|
| `tests/lib/auth/session.test.ts` | seal/read round-trip, wrong secret rejected, expiry, rolling refresh |
| `tests/lib/auth/pkceCookie.test.ts` | round-trip, cleared after read, tampered → null, expired → null |
| `tests/lib/auth/azureAd.test.ts` | PKCE S256 challenge = base64url(sha256(verifier)), URL shape, env validation |
| `tests/lib/auth/audit.test.ts` | writes AuditLog row, scrubber drops sensitive keys, DB throw does not propagate |
| `tests/lib/auth/safeRedirect.test.ts` | accepts `/foo`, rejects `//evil.com`, `/\evil`, `https://evil`, whitespace, empty |
| `tests/lib/auth/getCurrentUserId.test.ts` | cookie returns userId; test-env header fallback; prod ignores header; null otherwise |
| `tests/middleware.test.ts` | valid cookie passes, tampered fails, public paths bypass, page vs API response shape |
| `tests/api/auth/login.route.test.ts` | redirect URL shape, pkce cookie flags, `from` allowlist, rate limit |
| `tests/api/auth/callback.route.test.ts` | one test per error-matrix row + happy path |
| `tests/api/auth/logout.route.test.ts` | GET → 405, POST destroys + audits, idempotent without session |
| `tests/api/auth/me.route.test.ts` | returns shape; 401 without session |
| `tests/e2e/auth.spec.ts` | Unauth redirect, sign-in button, axe-core, logout, user chip |

---

## Pre-work — operator steps (not code)

These are documented here because the plan is blocked without them. They are quick portal/CLI actions.

- [ ] **Rotate the leaked `AZURE_CLIENT_SECRET` in Entra.** The value shared during brainstorming is compromised. Generate a fresh secret value in the Azure portal under the app registration "Certificates & secrets".
- [ ] **Add a second redirect URI** to the Entra app registration: `http://localhost:4000/api/auth/azure/callback` (keep the existing `/auth/azure/callback` if desired).
- [ ] **Generate a 32-byte session secret** locally: `openssl rand -base64 32` (or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` on Windows).
- [ ] **Populate `.env.local`** in the project root with the values:
  ```
  AZURE_TENANT_ID=2fa3d13b-cb75-4f29-bf34-f17a7578c041
  AZURE_CLIENT_ID=bad829ef-851f-43e6-8d5b-55ae7b9106e8
  AZURE_CLIENT_SECRET=<freshly-rotated-secret>
  AZURE_REDIRECT_URI=http://localhost:4000/api/auth/azure/callback
  SESSION_COOKIE_SECRET=<output of openssl rand>
  ```

---

## Task 1: Install dependencies and update scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

Run: `npm install @azure/msal-node iron-session`

Expected: both packages added under `dependencies`. `iron-session` should be `^8.x` and `@azure/msal-node` `^3.x` (or whatever is current).

- [ ] **Step 2: Change the dev script port to 4000**

In `package.json`, change:
```json
"dev": "next dev",
```
to:
```json
"dev": "next dev -p 4000",
```

- [ ] **Step 3: Verify install**

Run: `npm run dev`
Expected: dev server starts on `http://localhost:4000`. `Ctrl-C` after confirming.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @azure/msal-node + iron-session, move dev to :4000"
```

---

## Task 2: Add .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create the file**

Write to `.env.example`:
```
# Postgres connection string (Prisma). See README for setup.
DATABASE_URL=

# Azure AD / Entra ID — see specs/2026-05-17-azure-ad-auth-design.md
# Tenant ID is a directory identifier (not secret).
AZURE_TENANT_ID=
# Application (client) ID from the Entra app registration (not secret).
AZURE_CLIENT_ID=
# Client secret value (NOT the secret ID). Rotate before sharing.
AZURE_CLIENT_SECRET=
# Must exactly match a registered redirect URI in Entra.
AZURE_REDIRECT_URI=http://localhost:4000/api/auth/azure/callback

# 32+ character random string. Generate with:
#   openssl rand -base64 32
SESSION_COOKIE_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "config: document required env vars in .env.example"
```

---

## Task 3: lib/auth/session.ts (iron-session wrapper)

**Files:**
- Create: `lib/auth/session.ts`
- Test: `tests/lib/auth/session.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/lib/auth/session.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const SECRET = 'a'.repeat(32)
const OTHER_SECRET = 'b'.repeat(32)

describe('lib/auth/session', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SESSION_COOKIE_SECRET = SECRET
    process.env.NODE_ENV = 'test'
  })

  it('round-trips a userId through seal and unseal', async () => {
    const { sealSession, unsealSession } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-1' })
    expect(typeof sealed).toBe('string')
    expect(sealed.length).toBeGreaterThan(0)
    const opened = await unsealSession(sealed)
    expect(opened).toEqual({ userId: 'user-1' })
  })

  it('returns null for a cookie sealed with a different secret', async () => {
    const { sealSession } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-1' })

    vi.resetModules()
    process.env.SESSION_COOKIE_SECRET = OTHER_SECRET
    const { unsealSession } = await import('@/lib/auth/session')
    const opened = await unsealSession(sealed)
    expect(opened).toBeNull()
  })

  it('returns null for a tampered cookie value', async () => {
    const { sealSession, unsealSession } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-1' })
    const tampered = sealed.slice(0, -2) + 'xx'
    const opened = await unsealSession(tampered)
    expect(opened).toBeNull()
  })

  it('throws at import-time when SESSION_COOKIE_SECRET is missing', async () => {
    vi.resetModules()
    delete process.env.SESSION_COOKIE_SECRET
    await expect(import('@/lib/auth/session')).rejects.toThrow(/SESSION_COOKIE_SECRET/)
  })

  it('throws at import-time when SESSION_COOKIE_SECRET is too short', async () => {
    vi.resetModules()
    process.env.SESSION_COOKIE_SECRET = 'short'
    await expect(import('@/lib/auth/session')).rejects.toThrow(/at least 32/)
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/lib/auth/session.test.ts`
Expected: FAIL with "Failed to resolve import @/lib/auth/session" or similar.

- [ ] **Step 3: Implement lib/auth/session.ts**

Write to `lib/auth/session.ts`:
```ts
import { sealData, unsealData } from 'iron-session'

const SESSION_COOKIE_NAME = '__hdo_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8 // 8 hours, rolling

function loadSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET
  if (!secret) {
    throw new Error('SESSION_COOKIE_SECRET environment variable is required')
  }
  if (secret.length < 32) {
    throw new Error('SESSION_COOKIE_SECRET must be at least 32 characters long')
  }
  return secret
}

const SECRET = loadSecret()

export interface SessionData {
  userId: string
}

/** Cookie name; exported so middleware and route handlers stay consistent. */
export const sessionCookieName = SESSION_COOKIE_NAME

/** Cookie options used everywhere we set or clear __hdo_session. */
export function sessionCookieOptions(maxAgeSeconds: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

/** Seal data into a base64url string suitable for a cookie value. */
export async function sealSession(data: SessionData): Promise<string> {
  return sealData(data, { password: SECRET, ttl: SESSION_TTL_SECONDS })
}

/** Unseal a cookie value; returns null on signature mismatch, tampering, or expiry. */
export async function unsealSession(value: string): Promise<SessionData | null> {
  try {
    const data = await unsealData<SessionData>(value, {
      password: SECRET,
      ttl: SESSION_TTL_SECONDS,
    })
    if (!data || typeof data.userId !== 'string') return null
    return data
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/lib/auth/session.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/session.ts tests/lib/auth/session.test.ts
git commit -m "auth: iron-session wrapper for __hdo_session cookie"
```

---

## Task 4: lib/auth/pkceCookie.ts (short-lived PKCE state cookie)

**Files:**
- Create: `lib/auth/pkceCookie.ts`
- Test: `tests/lib/auth/pkceCookie.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/lib/auth/pkceCookie.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'

const SECRET = 'a'.repeat(32)

describe('lib/auth/pkceCookie', () => {
  beforeEach(() => {
    process.env.SESSION_COOKIE_SECRET = SECRET
  })

  it('round-trips PKCE state through seal and unseal', async () => {
    const { sealPkce, unsealPkce } = await import('@/lib/auth/pkceCookie')
    const state = { verifier: 'v'.repeat(64), state: 's'.repeat(32), from: '/standard' }
    const sealed = await sealPkce(state)
    const opened = await unsealPkce(sealed)
    expect(opened).toEqual(state)
  })

  it('returns null when the cookie is tampered', async () => {
    const { sealPkce, unsealPkce } = await import('@/lib/auth/pkceCookie')
    const sealed = await sealPkce({ verifier: 'v', state: 's', from: '/' })
    const opened = await unsealPkce(sealed.slice(0, -2) + 'xx')
    expect(opened).toBeNull()
  })

  it('exports a cookie name and short max-age (<= 600s)', async () => {
    const { pkceCookieName, pkceCookieOptions } = await import('@/lib/auth/pkceCookie')
    expect(pkceCookieName).toBe('__hdo_pkce')
    expect(pkceCookieOptions().maxAge).toBeLessThanOrEqual(600)
    expect(pkceCookieOptions().httpOnly).toBe(true)
    expect(pkceCookieOptions().sameSite).toBe('lax')
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/lib/auth/pkceCookie.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement lib/auth/pkceCookie.ts**

Write to `lib/auth/pkceCookie.ts`:
```ts
import { sealData, unsealData } from 'iron-session'

const PKCE_COOKIE_NAME = '__hdo_pkce'
const PKCE_TTL_SECONDS = 600 // 10 minutes

function loadSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_COOKIE_SECRET must be a 32+ char string')
  }
  return secret
}

export interface PkceState {
  verifier: string
  state: string
  from: string
}

export const pkceCookieName = PKCE_COOKIE_NAME

export function pkceCookieOptions(maxAgeSeconds: number = PKCE_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

export async function sealPkce(state: PkceState): Promise<string> {
  return sealData(state, { password: loadSecret(), ttl: PKCE_TTL_SECONDS })
}

export async function unsealPkce(value: string): Promise<PkceState | null> {
  try {
    const data = await unsealData<PkceState>(value, { password: loadSecret(), ttl: PKCE_TTL_SECONDS })
    if (!data || typeof data.verifier !== 'string' || typeof data.state !== 'string') return null
    return data
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/lib/auth/pkceCookie.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/pkceCookie.ts tests/lib/auth/pkceCookie.test.ts
git commit -m "auth: short-lived PKCE state cookie wrapper"
```

---

## Task 5: lib/auth/safeRedirect.ts (open-redirect guard)

**Files:**
- Create: `lib/auth/safeRedirect.ts`
- Test: `tests/lib/auth/safeRedirect.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/lib/auth/safeRedirect.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isSafeInternalPath, safeFromOrDefault } from '@/lib/auth/safeRedirect'

describe('isSafeInternalPath', () => {
  it.each([
    ['/', true],
    ['/standard', true],
    ['/admin/users', true],
    ['/agenda?week=2026-W20', true],
    ['/foo#anchor', true],
  ])('accepts %s', (input, expected) => {
    expect(isSafeInternalPath(input)).toBe(expected)
  })

  it.each([
    ['//evil.com', false],
    ['/\\evil.com', false],
    ['https://evil.com', false],
    ['http://evil.com', false],
    ['javascript:alert(1)', false],
    ['', false],
    ['foo', false],
    ['/foo bar', false],
    ['/foo\nbar', false],
  ])('rejects %s', (input, expected) => {
    expect(isSafeInternalPath(input)).toBe(expected)
  })
})

describe('safeFromOrDefault', () => {
  it('returns the input when safe', () => {
    expect(safeFromOrDefault('/standard')).toBe('/standard')
  })
  it('falls back to / when unsafe', () => {
    expect(safeFromOrDefault('//evil.com')).toBe('/')
  })
  it('falls back to / when null or undefined', () => {
    expect(safeFromOrDefault(null)).toBe('/')
    expect(safeFromOrDefault(undefined)).toBe('/')
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/lib/auth/safeRedirect.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement lib/auth/safeRedirect.ts**

Write to `lib/auth/safeRedirect.ts`:
```ts
/**
 * Validate a redirect-target path supplied via query string or cookie.
 * Defense against open-redirect attacks: only same-origin relative paths
 * starting with a single slash are allowed.
 */
export function isSafeInternalPath(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value[0] !== '/') return false
  if (value.startsWith('//') || value.startsWith('/\\')) return false
  if (/\s/.test(value)) return false
  if (value.includes(':')) return false
  return true
}

export function safeFromOrDefault(value: string | null | undefined): string {
  if (typeof value === 'string' && isSafeInternalPath(value)) return value
  return '/'
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/lib/auth/safeRedirect.test.ts`
Expected: PASS for all rows.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/safeRedirect.ts tests/lib/auth/safeRedirect.test.ts
git commit -m "auth: open-redirect guard for ?from= params"
```

---

## Task 6: lib/auth/azureAd.ts (MSAL wrapper)

**Files:**
- Create: `lib/auth/azureAd.ts`
- Test: `tests/lib/auth/azureAd.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/lib/auth/azureAd.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'crypto'

describe('lib/auth/azureAd', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.AZURE_TENANT_ID = '2fa3d13b-cb75-4f29-bf34-f17a7578c041'
    process.env.AZURE_CLIENT_ID = 'bad829ef-851f-43e6-8d5b-55ae7b9106e8'
    process.env.AZURE_CLIENT_SECRET = 'test-secret-value'
    process.env.AZURE_REDIRECT_URI = 'http://localhost:4000/api/auth/azure/callback'
  })

  it('throws at import-time when AZURE_TENANT_ID is missing', async () => {
    vi.resetModules()
    delete process.env.AZURE_TENANT_ID
    await expect(import('@/lib/auth/azureAd')).rejects.toThrow(/AZURE_TENANT_ID/)
  })

  it('buildAuthCodeUrl returns a url + verifier + state', async () => {
    const { buildAuthCodeUrl } = await import('@/lib/auth/azureAd')
    const { url, verifier, state } = await buildAuthCodeUrl()
    expect(url).toMatch(/login\.microsoftonline\.com/)
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain(`client_id=${encodeURIComponent(process.env.AZURE_CLIENT_ID!)}`)
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(/^[A-Za-z0-9_-]+$/.test(verifier)).toBe(true)
    expect(state.length).toBeGreaterThanOrEqual(32)
    expect(/^[A-Za-z0-9_-]+$/.test(state)).toBe(true)
  })

  it('the generated code_challenge equals base64url(sha256(verifier))', async () => {
    const { buildAuthCodeUrl } = await import('@/lib/auth/azureAd')
    const { url, verifier } = await buildAuthCodeUrl()
    const parsed = new URL(url)
    const challenge = parsed.searchParams.get('code_challenge')!
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/lib/auth/azureAd.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement lib/auth/azureAd.ts**

Write to `lib/auth/azureAd.ts`:
```ts
import { ConfidentialClientApplication, type AuthenticationResult } from '@azure/msal-node'
import crypto from 'crypto'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} environment variable is required`)
  return v
}

const TENANT_ID = requireEnv('AZURE_TENANT_ID')
const CLIENT_ID = requireEnv('AZURE_CLIENT_ID')
const CLIENT_SECRET = requireEnv('AZURE_CLIENT_SECRET')
const REDIRECT_URI = requireEnv('AZURE_REDIRECT_URI')

const SCOPES = ['openid', 'profile', 'email']

let cachedClient: ConfidentialClientApplication | null = null

function getMsalClient(): ConfidentialClientApplication {
  if (cachedClient) return cachedClient
  cachedClient = new ConfidentialClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
      clientSecret: CLIENT_SECRET,
    },
  })
  return cachedClient
}

/** Tenant id that callback handlers must assert claims.tid matches. */
export const expectedTenantId = TENANT_ID

function generateVerifier(): string {
  // 32 random bytes → 43 base64url chars (within RFC 7636's 43-128 range).
  return crypto.randomBytes(32).toString('base64url')
}

function generateState(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function challengeFromVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export interface AuthCodeUrlResult {
  url: string
  verifier: string
  state: string
}

export async function buildAuthCodeUrl(): Promise<AuthCodeUrlResult> {
  const verifier = generateVerifier()
  const state = generateState()
  const url = await getMsalClient().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    state,
    codeChallenge: challengeFromVerifier(verifier),
    codeChallengeMethod: 'S256',
  })
  return { url, verifier, state }
}

export interface TokenExchangeInput {
  code: string
  codeVerifier: string
}

export async function exchangeCodeForTokens(input: TokenExchangeInput): Promise<AuthenticationResult> {
  const result = await getMsalClient().acquireTokenByCode({
    code: input.code,
    codeVerifier: input.codeVerifier,
    redirectUri: REDIRECT_URI,
    scopes: SCOPES,
  })
  if (!result) throw new Error('MSAL returned null AuthenticationResult')
  return result
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/lib/auth/azureAd.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/azureAd.ts tests/lib/auth/azureAd.test.ts
git commit -m "auth: MSAL ConfidentialClientApplication wrapper"
```

---

## Task 7: lib/auth/audit.ts (auth event logger)

**Files:**
- Create: `lib/auth/audit.ts`
- Test: `tests/lib/auth/audit.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/lib/auth/audit.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}))

import { prisma } from '@/lib/prisma'
import { logAuthEvent, AUTH_EVENT, scrubDetails } from '@/lib/auth/audit'

describe('logAuthEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a row with the given event as action and entityType "auth"', async () => {
    await logAuthEvent({ event: AUTH_EVENT.LOGIN_SUCCESS, actorUserId: 'user-1' })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'LOGIN_SUCCESS',
        entityType: 'auth',
        actorUserId: 'user-1',
      }),
    })
  })

  it('uses sentinel "anonymous" when actorUserId is omitted', async () => {
    await logAuthEvent({ event: AUTH_EVENT.LOGIN_UNKNOWN_USER, details: { email: 'a@b.no' } })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorUserId: 'anonymous' }),
    })
  })

  it('does not throw when prisma fails', async () => {
    ;(prisma.auditLog.create as any).mockRejectedValueOnce(new Error('db down'))
    await expect(logAuthEvent({ event: AUTH_EVENT.LOGIN_SUCCESS, actorUserId: 'u1' })).resolves.toBeUndefined()
  })
})

describe('scrubDetails', () => {
  it('drops keys matching token/secret/password/code (case-insensitive)', () => {
    const out = scrubDetails({
      tenant: 't',
      access_token: 'x',
      Secret: 'y',
      password: 'z',
      AUTH_CODE: 'c',
      kept: 'ok',
    })
    expect(out).toEqual({ tenant: 't', kept: 'ok' })
  })

  it('returns undefined for undefined input', () => {
    expect(scrubDetails(undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/lib/auth/audit.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement lib/auth/audit.ts**

Write to `lib/auth/audit.ts`:
```ts
import { prisma } from '@/lib/prisma'

export const AUTH_EVENT = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_UNKNOWN_USER: 'LOGIN_UNKNOWN_USER',
  LOGIN_INACTIVE_USER: 'LOGIN_INACTIVE_USER',
  LOGIN_STATE_MISMATCH: 'LOGIN_STATE_MISMATCH',
  LOGIN_WRONG_TENANT: 'LOGIN_WRONG_TENANT',
  LOGOUT: 'LOGOUT',
} as const

export type AuthEvent = (typeof AUTH_EVENT)[keyof typeof AUTH_EVENT]

const SENSITIVE_KEY_PATTERN = /token|secret|password|code/i

/** Drop keys whose name matches sensitive patterns. Shallow. */
export function scrubDetails(
  details: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!details) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) continue
    out[k] = v
  }
  return out
}

export interface LogAuthEventInput {
  event: AuthEvent
  /** Real user id when known; falls back to 'anonymous' sentinel when not. */
  actorUserId?: string
  /** Free-form context (tenant id, email attempted, etc.). Run through scrubber. */
  details?: Record<string, unknown>
}

/**
 * Best-effort audit write for auth events. Never throws — auth flow must not
 * be blocked by an audit failure, and the real error must surface instead.
 */
export async function logAuthEvent(input: LogAuthEventInput): Promise<void> {
  try {
    const scrubbed = scrubDetails(input.details)
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? 'anonymous',
        action: input.event,
        entityType: 'auth',
        entityId: input.actorUserId ?? 'anonymous',
        afterJson: scrubbed ? JSON.stringify(scrubbed) : null,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth.audit] failed to write audit log', err)
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/lib/auth/audit.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/audit.ts tests/lib/auth/audit.test.ts
git commit -m "auth: audit logger for LOGIN_*/LOGOUT events"
```

---

## Task 8: Swap getCurrentUserId to cookie + test-env header fallback

**Files:**
- Modify: `lib/auth/getCurrentUserId.ts`
- Delete + recreate: `tests/lib/get-current-user-id.test.ts`

- [ ] **Step 1: Replace the test file**

Delete `tests/lib/get-current-user-id.test.ts` and write a fresh one:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const SECRET = 'a'.repeat(32)

async function load() {
  vi.resetModules()
  process.env.SESSION_COOKIE_SECRET = SECRET
  return import('@/lib/auth/getCurrentUserId')
}

function reqWithCookie(cookieHeader: string, headers: Record<string, string> = {}): Request {
  return new Request('http://x/y', { headers: { cookie: cookieHeader, ...headers } })
}

describe('getCurrentUserId', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
  })

  it('returns the userId from a valid session cookie', async () => {
    const { getCurrentUserId } = await load()
    const { sealSession, sessionCookieName } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-42' })
    const req = reqWithCookie(`${sessionCookieName}=${sealed}`)
    expect(await getCurrentUserId(req)).toBe('user-42')
  })

  it('returns the x-current-user-id header when NODE_ENV=test and no cookie', async () => {
    process.env.NODE_ENV = 'test'
    const { getCurrentUserId } = await load()
    const req = new Request('http://x/y', { headers: { 'x-current-user-id': 'user-7' } })
    expect(await getCurrentUserId(req)).toBe('user-7')
  })

  it('IGNORES the x-current-user-id header in production', async () => {
    process.env.NODE_ENV = 'production'
    const { getCurrentUserId } = await load()
    const req = new Request('http://x/y', { headers: { 'x-current-user-id': 'user-7' } })
    expect(await getCurrentUserId(req)).toBeNull()
  })

  it('returns null when neither cookie nor (test) header present', async () => {
    const { getCurrentUserId } = await load()
    const req = new Request('http://x/y')
    expect(await getCurrentUserId(req)).toBeNull()
  })

  it('returns null for a tampered session cookie', async () => {
    const { getCurrentUserId } = await load()
    const { sealSession, sessionCookieName } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-1' })
    const tampered = sealed.slice(0, -2) + 'xx'
    const req = reqWithCookie(`${sessionCookieName}=${tampered}`)
    expect(await getCurrentUserId(req)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/lib/get-current-user-id.test.ts`
Expected: FAIL — current implementation reads from header only and ignores cookie.

- [ ] **Step 3: Replace lib/auth/getCurrentUserId.ts**

Overwrite `lib/auth/getCurrentUserId.ts` with:
```ts
import { sessionCookieName, unsealSession } from './session'

/**
 * Resolve the calling user's id. Production reads a signed iron-session cookie.
 * In NODE_ENV=test, falls back to the legacy `x-current-user-id` header so the
 * existing route-handler test suite continues to work without churn. The
 * fallback is structurally closed in production.
 */
export async function getCurrentUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const sealed = readCookie(cookieHeader, sessionCookieName)
  if (sealed) {
    const session = await unsealSession(sealed)
    if (session?.userId) return session.userId
  }

  if (process.env.NODE_ENV === 'test') {
    return request.headers.get('x-current-user-id')?.trim() || null
  }

  return null
}

function readCookie(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/lib/get-current-user-id.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Sanity check — run the full existing suite**

Run: `npm test`
Expected: existing route/api tests still pass (they all set `NODE_ENV=test` via Vitest defaults and use the header path).

- [ ] **Step 6: Commit**

```bash
git add lib/auth/getCurrentUserId.ts tests/lib/get-current-user-id.test.ts
git commit -m "auth: read session cookie; keep x-current-user-id only in NODE_ENV=test"
```

---

## Task 9: Swap middleware.ts to cookie verification

**Files:**
- Modify: `middleware.ts`
- Test: `tests/middleware.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/middleware.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const SECRET = 'a'.repeat(32)

async function loadMw() {
  vi.resetModules()
  process.env.SESSION_COOKIE_SECRET = SECRET
  return import('@/middleware')
}

function makeReq(url: string, cookie?: string): NextRequest {
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)
  return new NextRequest(new URL(url, 'http://localhost:4000'), { headers })
}

describe('middleware', () => {
  beforeEach(() => { process.env.NODE_ENV = 'test' })

  it('allows public paths through without a session', async () => {
    const { middleware } = await loadMw()
    for (const path of ['/login', '/api/auth/azure/login', '/api/auth/azure/callback', '/api/auth/logout']) {
      const res = await middleware(makeReq(path))
      expect(res.status).toBe(200)
    }
  })

  it('passes through with a valid session cookie', async () => {
    const { sealSession, sessionCookieName } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'u1' })
    const { middleware } = await loadMw()
    const res = await middleware(makeReq('/api/shifts', `${sessionCookieName}=${sealed}`))
    expect(res.status).toBe(200)
  })

  it('returns 401 JSON for unauthenticated /api/* requests', async () => {
    const { middleware } = await loadMw()
    const res = await middleware(makeReq('/api/shifts'))
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })

  it('redirects unauthenticated page requests to /login?from=…', async () => {
    const { middleware } = await loadMw()
    const res = await middleware(makeReq('/standard'))
    expect(res.status).toBe(307) // Next.js redirect uses 307 by default
    const loc = res.headers.get('location')!
    expect(loc).toContain('/login')
    expect(loc).toContain('from=%2Fstandard')
  })

  it('returns 401 for /api/* with a tampered cookie', async () => {
    const { sealSession, sessionCookieName } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'u1' })
    const tampered = sealed.slice(0, -2) + 'xx'
    const { middleware } = await loadMw()
    const res = await middleware(makeReq('/api/shifts', `${sessionCookieName}=${tampered}`))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Update the matcher**

The existing `middleware.ts` only matches `/api/:path*`. We need page-route protection too. Replace the entire `middleware.ts`:

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sessionCookieName, unsealSession } from '@/lib/auth/session'

/**
 * Edge-level auth gate. Verifies the __hdo_session cookie signature with pure
 * crypto (no DB lookup) so it stays Edge-runtime compatible. The wrapper
 * pattern in lib/auth/withAuth.ts remains the source of truth — this is
 * defense-in-depth that rejects unauthenticated requests early.
 */

const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/api/auth/azure/login',
  '/api/auth/azure/callback',
  '/api/auth/logout',
])

const PUBLIC_PREFIXES = ['/_next', '/favicon', '/assets']

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  const sealed = request.cookies.get(sessionCookieName)?.value
  const session = sealed ? await unsealSession(sealed) : null

  if (session?.userId) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = `?from=${encodeURIComponent(pathname + request.nextUrl.search)}`
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Match everything except Next.js internals and the public folder.
  matcher: ['/((?!_next|favicon|assets).*)'],
}
```

- [ ] **Step 3: Run tests, expect pass**

Run: `npx vitest run tests/middleware.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: still green (route-handler tests don't run through middleware).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts tests/middleware.test.ts
git commit -m "middleware: verify __hdo_session signature; redirect pages to /login"
```

---

## Task 10: /api/auth/me route

**Files:**
- Create: `app/api/auth/me/route.ts`
- Test: `tests/api/auth/me.route.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/api/auth/me.route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/auth/me/route'

describe('GET /api/auth/me', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.NODE_ENV = 'test' })

  it('returns 401 when no user is authenticated', async () => {
    const res = await GET(new Request('http://x/api/auth/me'))
    expect(res.status).toBe(401)
  })

  it('returns the user shape for an authenticated caller', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'u1', name: 'Kari', email: 'k@hdo.no', role: 'EMPLOYEE', teamId: 't1',
    })
    const res = await GET(new Request('http://x/api/auth/me', {
      headers: { 'x-current-user-id': 'u1' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: 'u1', name: 'Kari', email: 'k@hdo.no', role: 'EMPLOYEE', teamId: 't1' })
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/api/auth/me.route.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the route**

Write to `app/api/auth/me/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/auth/withAuth'

/**
 * Lightweight current-user endpoint used by the header UserMenu. Wrapped with
 * withAuth so it returns 401 without a valid session and 404 if the user row
 * disappeared since the cookie was issued.
 */
export const GET = withAuth(async (_req, ctx) => {
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, name: true, email: true, role: true, teamId: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
})
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/api/auth/me.route.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/me/route.ts tests/api/auth/me.route.test.ts
git commit -m "auth: GET /api/auth/me returns logged-in user shape"
```

---

## Task 11: /api/auth/azure/login route

**Files:**
- Create: `app/api/auth/azure/login/route.ts`
- Test: `tests/api/auth/login.route.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/api/auth/login.route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/azureAd', () => ({
  buildAuthCodeUrl: vi.fn(async () => ({
    url: 'https://login.microsoftonline.com/x/oauth2/v2.0/authorize?state=S&code_challenge=C',
    verifier: 'v'.repeat(64),
    state: 'S',
  })),
  expectedTenantId: 'tid',
}))

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimit: vi.fn(() => null),
}))

import { GET } from '@/app/api/auth/azure/login/route'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { pkceCookieName } from '@/lib/auth/pkceCookie'

const SECRET = 'a'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SESSION_COOKIE_SECRET = SECRET
  process.env.NODE_ENV = 'test'
})

describe('GET /api/auth/azure/login', () => {
  it('302-redirects to Microsoft and sets the __hdo_pkce cookie', async () => {
    const res = await GET(new Request('http://localhost:4000/api/auth/azure/login'))
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get('location')).toMatch(/login\.microsoftonline\.com/)
    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain(pkceCookieName + '=')
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
  })

  it('preserves a safe ?from= into the pkce cookie state', async () => {
    const res = await GET(new Request('http://localhost:4000/api/auth/azure/login?from=%2Fadmin'))
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get('set-cookie')).toContain(pkceCookieName + '=')
    // Detailed verification of the embedded `from` is covered by callback tests
    // (which read and assert on the unsealed PkceState).
  })

  it('falls back to "/" when ?from= is unsafe', async () => {
    // Just assert the route does not throw and still sets the cookie.
    const res = await GET(new Request('http://localhost:4000/api/auth/azure/login?from=%2F%2Fevil.com'))
    expect([302, 307]).toContain(res.status)
  })

  it('returns 429 when rate limit is exceeded', async () => {
    ;(applyRateLimit as any).mockReturnValueOnce(new Response('too many', { status: 429 }))
    const res = await GET(new Request('http://localhost:4000/api/auth/azure/login'))
    expect(res.status).toBe(429)
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/api/auth/login.route.test.ts`
Expected: FAIL (route not found).

- [ ] **Step 3: Implement the route**

Write to `app/api/auth/azure/login/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { buildAuthCodeUrl } from '@/lib/auth/azureAd'
import { pkceCookieName, pkceCookieOptions, sealPkce } from '@/lib/auth/pkceCookie'
import { safeFromOrDefault } from '@/lib/auth/safeRedirect'
import { applyRateLimit } from '@/lib/security/rateLimit'

export async function GET(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, {
    routeKey: 'auth.login',
    limit: 10,
    windowMs: 60_000,
  })
  if (limited) return limited

  const url = new URL(request.url)
  const from = safeFromOrDefault(url.searchParams.get('from'))

  const { url: authUrl, verifier, state } = await buildAuthCodeUrl()
  const pkce = await sealPkce({ verifier, state, from })

  const res = NextResponse.redirect(authUrl, 302)
  res.cookies.set(pkceCookieName, pkce, pkceCookieOptions())
  return res
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/api/auth/login.route.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/azure/login/route.ts tests/api/auth/login.route.test.ts
git commit -m "auth: GET /api/auth/azure/login starts the OAuth flow"
```

---

## Task 12: /api/auth/azure/callback route

**Files:**
- Create: `app/api/auth/azure/callback/route.ts`
- Test: `tests/api/auth/callback.route.test.ts`

This is the largest route. Tests cover the entire error-matrix table from the spec.

- [ ] **Step 1: Write the failing tests**

Write to `tests/api/auth/callback.route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/azureAd', () => ({
  exchangeCodeForTokens: vi.fn(),
  expectedTenantId: 'tenant-correct',
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('@/lib/auth/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/audit')>('@/lib/auth/audit')
  return {
    ...actual,
    logAuthEvent: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimit: vi.fn(() => null),
}))

import { GET } from '@/app/api/auth/azure/callback/route'
import { exchangeCodeForTokens } from '@/lib/auth/azureAd'
import { prisma } from '@/lib/prisma'
import { logAuthEvent, AUTH_EVENT } from '@/lib/auth/audit'
import { pkceCookieName, sealPkce } from '@/lib/auth/pkceCookie'
import { sessionCookieName, unsealSession } from '@/lib/auth/session'

const SECRET = 'a'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SESSION_COOKIE_SECRET = SECRET
  process.env.NODE_ENV = 'test'
})

async function reqWithPkce(opts: {
  code?: string
  state?: string
  pkceState?: { verifier: string; state: string; from: string } | null
}): Promise<Request> {
  const params = new URLSearchParams()
  if (opts.code) params.set('code', opts.code)
  if (opts.state) params.set('state', opts.state)
  const headers: Record<string, string> = {}
  if (opts.pkceState !== null) {
    const sealed = await sealPkce(opts.pkceState ?? { verifier: 'v'.repeat(64), state: 'S', from: '/' })
    headers['cookie'] = `${pkceCookieName}=${sealed}`
  }
  return new Request(`http://localhost:4000/api/auth/azure/callback?${params.toString()}`, { headers })
}

function redirectsTo(res: Response, fragment: string) {
  expect([302, 307]).toContain(res.status)
  expect(res.headers.get('location')).toContain(fragment)
}

describe('GET /api/auth/azure/callback', () => {
  it('redirects to /login?error=expired when pkce cookie is missing', async () => {
    const res = await GET(await reqWithPkce({ code: 'c', state: 'S', pkceState: null }))
    redirectsTo(res, '/login?error=expired')
  })

  it('redirects to /login?error=invalid + audits LOGIN_STATE_MISMATCH on state mismatch', async () => {
    const req = await reqWithPkce({ code: 'c', state: 'X', pkceState: { verifier: 'v', state: 'S', from: '/' } })
    const res = await GET(req)
    redirectsTo(res, '/login?error=invalid')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_STATE_MISMATCH }))
  })

  it('redirects to /login?error=failed when token exchange throws', async () => {
    ;(exchangeCodeForTokens as any).mockRejectedValueOnce(new Error('msal boom'))
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    const res = await GET(req)
    redirectsTo(res, '/login?error=failed')
  })

  it('redirects to /login?error=tenant + audits LOGIN_WRONG_TENANT when tid mismatches', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-wrong', email: 'x@y.no', preferred_username: 'x@y.no' },
    })
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    const res = await GET(req)
    redirectsTo(res, '/login?error=tenant')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_WRONG_TENANT }))
  })

  it('redirects to /login?error=unknown_user + audits LOGIN_UNKNOWN_USER when no DB match', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'unknown@hdo.no', preferred_username: 'unknown@hdo.no' },
    })
    ;(prisma.user.findUnique as any).mockResolvedValue(null) // both lookups
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    const res = await GET(req)
    redirectsTo(res, '/login?error=unknown_user')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_UNKNOWN_USER }))
  })

  it('writes azureOid when matching by email on first login', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'kari@hdo.no', preferred_username: 'kari@hdo.no' },
    })
    ;(prisma.user.findUnique as any)
      .mockResolvedValueOnce(null) // by azureOid
      .mockResolvedValueOnce({ id: 'u1', email: 'kari@hdo.no', status: 'active', azureOid: null })
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    await GET(req)
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ azureOid: 'o1' }),
    }))
  })

  it('redirects to /login?error=inactive + audits LOGIN_INACTIVE_USER when user.status=inactive', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'kari@hdo.no', preferred_username: 'kari@hdo.no' },
    })
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({ id: 'u1', email: 'kari@hdo.no', status: 'inactive', azureOid: 'o1' })
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    const res = await GET(req)
    redirectsTo(res, '/login?error=inactive')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_INACTIVE_USER }))
  })

  it('happy path: sets __hdo_session, updates lastLoginAt, audits LOGIN_SUCCESS, redirects to from', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'kari@hdo.no', preferred_username: 'kari@hdo.no' },
    })
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({ id: 'u1', email: 'kari@hdo.no', status: 'active', azureOid: 'o1' })

    const req = await reqWithPkce({ code: 'c', state: 'S', pkceState: { verifier: 'v', state: 'S', from: '/standard' } })
    const res = await GET(req)

    redirectsTo(res, '/standard')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_SUCCESS, actorUserId: 'u1' }))
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
    }))

    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain(sessionCookieName + '=')
    // Also clears pkce cookie:
    expect(setCookie.toLowerCase()).toContain('__hdo_pkce=;')

    // The sealed session value round-trips back to userId u1:
    const match = setCookie.match(new RegExp(`${sessionCookieName}=([^;]+)`))
    expect(match).not.toBeNull()
    const sealed = decodeURIComponent(match![1])
    const session = await unsealSession(sealed)
    expect(session).toEqual({ userId: 'u1' })
  })

  it('falls back to / when the from in pkce state is unsafe', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'k@hdo.no', preferred_username: 'k@hdo.no' },
    })
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({ id: 'u1', email: 'k@hdo.no', status: 'active', azureOid: 'o1' })
    const req = await reqWithPkce({ code: 'c', state: 'S', pkceState: { verifier: 'v', state: 'S', from: '//evil.com' } })
    const res = await GET(req)
    redirectsTo(res, '/')
    expect(res.headers.get('location')).not.toContain('evil.com')
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/api/auth/callback.route.test.ts`
Expected: FAIL (route not found).

- [ ] **Step 3: Implement the route**

Write to `app/api/auth/azure/callback/route.ts`:
```ts
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { exchangeCodeForTokens, expectedTenantId } from '@/lib/auth/azureAd'
import { pkceCookieName, unsealPkce, pkceCookieOptions } from '@/lib/auth/pkceCookie'
import { sessionCookieName, sealSession, sessionCookieOptions } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { AUTH_EVENT, logAuthEvent } from '@/lib/auth/audit'
import { safeFromOrDefault } from '@/lib/auth/safeRedirect'
import { applyRateLimit } from '@/lib/security/rateLimit'

function redirectToLogin(req: Request, errorCode: string): NextResponse {
  const url = new URL('/login', req.url)
  url.searchParams.set('error', errorCode)
  const res = NextResponse.redirect(url, 302)
  // Always clear the pkce cookie when leaving the callback, even on error.
  res.cookies.set(pkceCookieName, '', { ...pkceCookieOptions(), maxAge: 0 })
  return res
}

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function readCookieValue(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export async function GET(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, { routeKey: 'auth.callback', limit: 20, windowMs: 60_000 })
  if (limited) return limited

  const url = new URL(request.url)
  const code = url.searchParams.get('code') ?? ''
  const stateParam = url.searchParams.get('state') ?? ''

  // 1. PKCE cookie
  const sealedPkce = readCookieValue(request, pkceCookieName)
  const pkce = sealedPkce ? await unsealPkce(sealedPkce) : null
  if (!pkce) {
    return redirectToLogin(request, 'expired')
  }

  // 2. State match
  if (!stateParam || !constantTimeEqual(stateParam, pkce.state)) {
    await logAuthEvent({ event: AUTH_EVENT.LOGIN_STATE_MISMATCH })
    return redirectToLogin(request, 'invalid')
  }

  // 3. Token exchange
  let tokens
  try {
    tokens = await exchangeCodeForTokens({ code, codeVerifier: pkce.verifier })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth.callback] token exchange failed', err)
    return redirectToLogin(request, 'failed')
  }
  const claims = tokens.idTokenClaims as
    | { oid?: string; tid?: string; email?: string; preferred_username?: string; name?: string }
    | undefined
  if (!claims) return redirectToLogin(request, 'failed')

  // 4. Tenant check
  if (claims.tid !== expectedTenantId) {
    await logAuthEvent({
      event: AUTH_EVENT.LOGIN_WRONG_TENANT,
      details: { got: claims.tid, expected: expectedTenantId },
    })
    return redirectToLogin(request, 'tenant')
  }

  const oid = claims.oid
  const email = (claims.email ?? claims.preferred_username ?? '').toLowerCase().trim()
  if (!oid || !email) {
    return redirectToLogin(request, 'failed')
  }

  // 5. Lookup user (azureOid first, then email)
  let user = await prisma.user.findUnique({ where: { azureOid: oid } })
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email } })
    if (byEmail) {
      // First login: persist azureOid for future stable matching.
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { azureOid: oid },
      })
      user = { ...byEmail, azureOid: oid }
    }
  }
  if (!user) {
    await logAuthEvent({
      event: AUTH_EVENT.LOGIN_UNKNOWN_USER,
      details: { email, oid },
    })
    return redirectToLogin(request, 'unknown_user')
  }

  // 6. Status check
  if (user.status !== 'active') {
    await logAuthEvent({ event: AUTH_EVENT.LOGIN_INACTIVE_USER, actorUserId: user.id })
    return redirectToLogin(request, 'inactive')
  }

  // 7. Last-login + audit
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await logAuthEvent({ event: AUTH_EVENT.LOGIN_SUCCESS, actorUserId: user.id })

  // 8. Mint session + clear pkce + redirect
  const sealed = await sealSession({ userId: user.id })
  const destination = safeFromOrDefault(pkce.from)
  const res = NextResponse.redirect(new URL(destination, request.url), 302)
  res.cookies.set(sessionCookieName, sealed, sessionCookieOptions())
  res.cookies.set(pkceCookieName, '', { ...pkceCookieOptions(), maxAge: 0 })
  return res
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/api/auth/callback.route.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/azure/callback/route.ts tests/api/auth/callback.route.test.ts
git commit -m "auth: GET /api/auth/azure/callback verifies state, mints session"
```

---

## Task 13: /api/auth/logout route

**Files:**
- Create: `app/api/auth/logout/route.ts`
- Test: `tests/api/auth/logout.route.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `tests/api/auth/logout.route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/audit')>('@/lib/auth/audit')
  return { ...actual, logAuthEvent: vi.fn().mockResolvedValue(undefined) }
})

import { GET, POST } from '@/app/api/auth/logout/route'
import { logAuthEvent, AUTH_EVENT } from '@/lib/auth/audit'
import { sealSession, sessionCookieName } from '@/lib/auth/session'

const SECRET = 'a'.repeat(32)

beforeEach(() => { vi.clearAllMocks(); process.env.SESSION_COOKIE_SECRET = SECRET; process.env.NODE_ENV = 'test' })

describe('logout', () => {
  it('GET returns 405', async () => {
    const res = await GET()
    expect(res.status).toBe(405)
  })

  it('POST with valid session destroys cookie, audits LOGOUT, redirects to /login', async () => {
    const sealed = await sealSession({ userId: 'u1' })
    const req = new Request('http://localhost:4000/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `${sessionCookieName}=${sealed}` },
    })
    const res = await POST(req)
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get('location')).toContain('/login')

    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain(`${sessionCookieName}=;`)
    expect(setCookie.toLowerCase()).toContain('max-age=0')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGOUT, actorUserId: 'u1' }))
  })

  it('POST without session is idempotent (still redirects, no audit)', async () => {
    const req = new Request('http://localhost:4000/api/auth/logout', { method: 'POST' })
    const res = await POST(req)
    expect([302, 307]).toContain(res.status)
    expect(logAuthEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/api/auth/logout.route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

Write to `app/api/auth/logout/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { sessionCookieName, sessionCookieOptions, unsealSession } from '@/lib/auth/session'
import { AUTH_EVENT, logAuthEvent } from '@/lib/auth/audit'

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
}

export async function POST(request: Request): Promise<Response> {
  const sealed = readCookie(request, sessionCookieName)
  if (sealed) {
    const session = await unsealSession(sealed)
    if (session?.userId) {
      await logAuthEvent({ event: AUTH_EVENT.LOGOUT, actorUserId: session.userId })
    }
  }

  const res = NextResponse.redirect(new URL('/login', request.url), 302)
  res.cookies.set(sessionCookieName, '', { ...sessionCookieOptions(), maxAge: 0 })
  return res
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/api/auth/logout.route.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/logout/route.ts tests/api/auth/logout.route.test.ts
git commit -m "auth: POST /api/auth/logout destroys session + audits"
```

---

## Task 14: /login page

**Files:**
- Create: `app/login/page.tsx`

`lib/i18n.ts` is a utility-function file (not a strings object) — Norwegian text is kept inline at the call site throughout the codebase. We follow the existing pattern here too.

- [ ] **Step 1: Create the login page**

Write to `app/login/page.tsx`:
```tsx
import Link from 'next/link'

const ERROR_MESSAGES: Record<string, string> = {
  expired: 'Innloggingen utløp. Prøv på nytt.',
  invalid: 'Ugyldig innloggingsforespørsel.',
  tenant: 'Ikke autorisert tenant.',
  unknown_user: 'Ingen tilgang. Kontakt administrator.',
  inactive: 'Kontoen er deaktivert. Kontakt administrator.',
  failed: 'Microsoft-innlogging feilet. Prøv igjen.',
}

interface PageProps {
  searchParams: { error?: string; from?: string }
}

export default function LoginPage({ searchParams }: PageProps) {
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null
  const fromParam =
    typeof searchParams.from === 'string' && searchParams.from.startsWith('/')
      ? `?from=${encodeURIComponent(searchParams.from)}`
      : ''

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground mb-6 text-center">
          Logg inn
        </h1>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        )}

        <Link
          href={`/api/auth/azure/login${fromParam}`}
          className="block w-full rounded-md bg-primary px-4 py-3 text-center text-primary-foreground font-medium hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Logg inn med Microsoft
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Smoke-test locally**

Run: `npm run dev`
Open: `http://localhost:4000/login`
Expected: heading "Logg inn" + button "Logg inn med Microsoft". `Tab` focuses the button with a visible ring. `http://localhost:4000/login?error=unknown_user` shows the Norwegian error message.

`Ctrl-C` to stop.

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "ui: /login page with Norwegian copy + error mapping"
```

---

## Task 15: UserMenu component + Navigation swap

**Files:**
- Create: `components/auth/UserMenu.tsx`
- Modify: `components/layout/Navigation.tsx`

- [ ] **Step 1: Create UserMenu**

Write to `components/auth/UserMenu.tsx`:
```tsx
"use client"

import { useQuery } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { Button } from '../ui/button'

interface Me {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'LEADER' | 'EMPLOYEE'
  teamId: string
}

const ROLE_LABEL: Record<Me['role'], string> = {
  ADMIN: 'Admin',
  LEADER: 'Leder',
  EMPLOYEE: 'Ansatt',
}

async function fetchMe(): Promise<Me> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (!res.ok) throw new Error('failed to load user')
  return res.json()
}

export function UserMenu() {
  const { data: me, isLoading } = useQuery({ queryKey: ['auth', 'me'], queryFn: fetchMe })

  if (isLoading) {
    return <div className="h-9 w-32 animate-pulse rounded bg-muted" aria-hidden />
  }
  if (!me) return null

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-medium text-foreground">{me.name}</span>
        <span className="text-xs text-muted-foreground">{ROLE_LABEL[me.role]}</span>
      </div>
      <form action="/api/auth/logout" method="post">
        <Button type="submit" variant="ghost" size="icon" title="Logg ut">
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Logg ut</span>
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Replace RoleSwitcher in Navigation.tsx**

Edit `components/layout/Navigation.tsx`:
- Remove import: `import { RoleSwitcher } from '../auth/RoleSwitcher'`
- Remove import: `import { useAuth } from '@/lib/auth/mockAuth'`
- Add import: `import { UserMenu } from '../auth/UserMenu'`
- Add import: `import { useQuery } from '@tanstack/react-query'`

Replace the `useAuth` derivation block with a query-driven version. The settings link's destination depends on the current user's role; fetch it the same way `UserMenu` does (React Query dedupes the request, so this is a single network call):

```tsx
interface Me { role: 'ADMIN' | 'LEADER' | 'EMPLOYEE' }
async function fetchMe(): Promise<Me> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (!res.ok) throw new Error('failed to load user')
  return res.json()
}

export function Navigation() {
  const pathname = usePathname()
  const { data: me } = useQuery({ queryKey: ['auth', 'me'], queryFn: fetchMe })

  const isAdminOrLeader = me?.role === 'ADMIN' || me?.role === 'LEADER'
  const settingsHref = isAdminOrLeader ? '/admin' : '/settings'
  const settingsItem = { href: settingsHref, label: 'Innstillinger', icon: Settings }
  const navItems = [...baseNavItems, settingsItem]
  // …rest unchanged…
}
```

In the JSX, replace:
```tsx
<NotificationsPanel />
<RoleSwitcher />
<Button variant="ghost" size="icon" className="hidden sm:flex">
  <LogOut className="h-4 w-4" />
  <span className="sr-only">Logg ut</span>
</Button>
```
with:
```tsx
<NotificationsPanel />
<UserMenu />
```

Remove the now-unused `LogOut` import from `Navigation.tsx` if it's no longer referenced.

- [ ] **Step 3: Smoke-test**

Run: `npm run dev`
Without a session you should be redirected to `/login`. (Until the manual login flow is wired with the rotated secret, this is the limit of local smoke testing.)

`Ctrl-C` to stop.

- [ ] **Step 4: Commit**

```bash
git add components/auth/UserMenu.tsx components/layout/Navigation.tsx
git commit -m "ui: UserMenu replaces RoleSwitcher in top navigation"
```

---

## Task 16: Remove mock-auth code (axios interceptor, mockAuth, placeholder)

**Files:**
- Modify: `lib/axios.ts`
- Delete: `lib/auth/mockAuth.ts`
- Delete: `lib/auth/azure-ad-placeholder.ts`
- Delete: `components/auth/RoleSwitcher.tsx`
- Delete: `components/RoleSwitcher.tsx`
- Delete: `components/ShiftModal.tsx`, `components/WeekGrid.tsx`, `components/Navigation.tsx`, `components/NotificationsPanel.tsx`, `components/auth/ProfileSection.tsx` — *only if they still import `useAuth`/`mockAuth` and are unused duplicates of `components/layout/*` / `components/schedule/*`.*

Before deleting any "duplicate" component, grep for imports to confirm it is unused.

- [ ] **Step 1: Remove the axios interceptor**

Replace `lib/axios.ts` with:
```ts
import axios from 'axios'

/**
 * Shared axios instance for all API calls. Cookies are sent automatically
 * by the browser for same-origin requests, so no per-request interceptor
 * is needed for auth.
 */
export const axiosInstance = axios.create({
  baseURL: typeof window !== 'undefined' ? '' : process.env.NEXT_PUBLIC_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export default axiosInstance
```

- [ ] **Step 2: Find every importer of `mockAuth`**

Run: `npx grep -r "@/lib/auth/mockAuth" --include="*.ts" --include="*.tsx" .` (or use Grep tool with pattern `from .*mockAuth`).
Expected: a list of files. For each:

- If it's a UI page/component, replace `useAuth` usage with the `useQuery(['auth','me'])` pattern from Task 15.
- If it's a test file, delete the file *only if* it specifically tested the mock store (`tests/components/RoleSwitcher.test.tsx`, etc.); otherwise update the import.

This is the most invasive step in the plan. Treat each file individually; commit per file or per logical group.

- [ ] **Step 3: Delete the mock auth files**

```bash
git rm lib/auth/mockAuth.ts lib/auth/azure-ad-placeholder.ts
git rm components/auth/RoleSwitcher.tsx
[ -f components/RoleSwitcher.tsx ] && git rm components/RoleSwitcher.tsx
```

- [ ] **Step 4: Confirm clean**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "auth: remove mock auth (mockAuth store, RoleSwitcher, axios header interceptor)"
```

---

## Task 17: Update Playwright config + cookie helper + adapt existing e2e

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/helpers/auth.ts`
- Modify: `tests/e2e/create-shift.spec.ts`, `holiday-request.spec.ts`, `smoke.spec.ts`, `swap-request.spec.ts`

- [ ] **Step 1: Update playwright.config.ts for port 4000 + test env**

Edit `playwright.config.ts`:
- Change `baseURL` default from `'http://localhost:3000'` to `'http://localhost:4000'`.
- Change `webServer.command` to set the test env: on Windows PowerShell, `cross-env NODE_ENV=test npm run dev` (add `cross-env` as a devDependency if not present). Or use a small shell helper. The point is the dev server must start with `NODE_ENV=test` so the header fallback in `getCurrentUserId` activates.
- Change `webServer.url` to `'http://localhost:4000'`.

```ts
webServer: process.env.E2E_BASE_URL
  ? undefined
  : {
      command: 'npx cross-env NODE_ENV=test npm run dev',
      url: 'http://localhost:4000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
```

Install `cross-env` if missing:
```bash
npm install --save-dev cross-env
```

- [ ] **Step 2: Create the cookie helper**

Seed users get auto-generated cuid IDs that change on every re-seed. The helper looks up the user by email at call time instead of accepting a hard-coded id.

Write to `tests/e2e/helpers/auth.ts`:
```ts
import type { BrowserContext } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { sealSession, sessionCookieName } from '@/lib/auth/session'

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
  if (!user) throw new Error(`E2E auth helper: no user with email ${email}. Did you run npm run db:seed?`)

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
```

- [ ] **Step 3: Update existing e2e specs to use the helper**

For each of `create-shift.spec.ts`, `holiday-request.spec.ts`, `smoke.spec.ts`, `swap-request.spec.ts`:

1. Add at the top of the file:
```ts
import { signInAsEmail, SEED_ADMIN_EMAIL } from './helpers/auth'

test.beforeEach(async ({ context }) => {
  await signInAsEmail(context, SEED_ADMIN_EMAIL)
})
```

2. Remove any `RoleSwitcher` interactions / `waitForResponse('/api/users')` bootstraps that exist only because of the mock store.

3. Update any header-based identity assumptions to rely on the cookie.

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e`
Expected: all four existing e2e specs pass against the new auth.

If a spec needs further tweaks (selectors, timing), fix in this task — do not let the suite go red.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/helpers/auth.ts tests/e2e/*.spec.ts package.json package-lock.json
git commit -m "e2e: cookie-based sign-in helper + port 4000 + NODE_ENV=test"
```

---

## Task 18: New auth E2E spec (sign-in redirect + logout + a11y)

**Files:**
- Create: `tests/e2e/auth.spec.ts`

- [ ] **Step 1: Install axe-core for Playwright if not present**

Run: `npm ls @axe-core/playwright || npm install --save-dev @axe-core/playwright`

- [ ] **Step 2: Write the spec**

Write to `tests/e2e/auth.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signInAsEmail, SEED_ADMIN_EMAIL } from './helpers/auth'

test.describe('Authentication', () => {
  test('unauthenticated /standard redirects to /login with preserved from=', async ({ page }) => {
    const response = await page.goto('/standard')
    expect(page.url()).toContain('/login')
    expect(page.url()).toContain('from=%2Fstandard')
    void response
  })

  test('/login renders the sign-in button and is keyboard accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Logg inn' })).toBeVisible()
    const button = page.getByRole('link', { name: 'Logg inn med Microsoft' })
    await expect(button).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(button).toBeFocused()
  })

  test('/login passes axe-core with zero violations', async ({ page }) => {
    await page.goto('/login')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('clicking sign-in starts the OAuth flow (302 to Microsoft)', async ({ page }) => {
    await page.goto('/login')
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/auth/azure/login')),
      page.getByRole('link', { name: 'Logg inn med Microsoft' }).click(),
    ])
    expect([302, 307]).toContain(response.status())
    expect(response.headers()['location']).toContain('login.microsoftonline.com')
  })

  test('authenticated user sees the UserMenu and can log out', async ({ page, context }) => {
    await signInAsEmail(context, SEED_ADMIN_EMAIL)
    await page.goto('/standard')
    await expect(page.getByRole('heading', { name: 'Standard plan' })).toBeVisible()
    // Logg ut button is in the UserMenu form.
    const logoutButton = page.getByRole('button', { name: 'Logg ut' })
    await expect(logoutButton).toBeVisible()
    await logoutButton.click()
    await expect(page).toHaveURL(/\/login/)
  })
})
```

- [ ] **Step 3: Run the new spec**

Run: `npm run test:e2e -- tests/e2e/auth.spec.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/auth.spec.ts package.json package-lock.json
git commit -m "e2e: auth flow + a11y test for /login"
```

---

## Task 19: Update SECURITY.md

**Files:**
- Modify: `SECURITY.md`

- [ ] **Step 1: Replace the "Migration to passport-microsoft" section**

In `SECURITY.md`, find the heading `## Migration to passport-microsoft` and the section under it (down to but not including the next `##`). Replace it with:

```markdown
## Authentication: Microsoft Entra ID via MSAL Node

The production system runs in a Node.js Docker container and authenticates
users with **Microsoft Entra ID** using the OAuth 2.0 Authorization Code
flow with PKCE (S256), via [`@azure/msal-node`](https://learn.microsoft.com/en-us/javascript/api/@azure/msal-node).
Sessions are signed cookies managed by [`iron-session`](https://github.com/vvo/iron-session).

The integration touches a small set of seams; the wrapper pattern in
`lib/auth/withAuth.ts`, `assertTeamMember`, every route handler, and every
business-logic file stay untouched.

### Seams

1. **OAuth route handlers** under `app/api/auth/azure/*` and `app/api/auth/logout/`:
   - `GET /api/auth/azure/login` — generates PKCE verifier + state, sets a
     short-lived `__hdo_pkce` cookie, redirects to Microsoft.
   - `GET /api/auth/azure/callback` — verifies state (constant-time compare),
     exchanges code, asserts `tid === AZURE_TENANT_ID`, looks up the user
     (by `azureOid` then by email), persists `azureOid` on first login,
     checks `status==='active'`, updates `lastLoginAt`, audits, sets
     `__hdo_session` (8h rolling), clears `__hdo_pkce`, redirects to a safe
     internal path.
   - `POST /api/auth/logout` — audits `LOGOUT`, destroys `__hdo_session`,
     redirects to `/login`.

2. **`middleware.ts`** — verifies the `__hdo_session` signature with pure
   crypto (no DB lookup, Edge-runtime safe). Public paths: `/login`,
   `/api/auth/azure/*`, `/api/auth/logout`, Next.js internals.

3. **`lib/auth/getCurrentUserId.ts`** — reads the `__hdo_session` cookie.
   In `NODE_ENV==='test'`, falls back to the legacy `x-current-user-id`
   header so the existing Vitest route-handler suite continues to work
   without churn. The fallback is structurally closed in production.

### Audit events

All written to the `AuditLog` table with `entityType='auth'`:

- `LOGIN_SUCCESS`, `LOGIN_UNKNOWN_USER`, `LOGIN_INACTIVE_USER`,
  `LOGIN_STATE_MISMATCH`, `LOGIN_WRONG_TENANT`, `LOGOUT`.

Failed-lookup events use `actorUserId='anonymous'` as a sentinel.

### Env vars

See `.env.example`. The Client Secret must be rotated immediately if it
ever appears in chat, logs, or source control.

### Test setup

- Vitest route-handler tests use the `x-current-user-id` header path
  (Vitest sets `NODE_ENV=test` automatically).
- Playwright E2E tests start the dev server with `NODE_ENV=test` and use
  `tests/e2e/helpers/auth.ts` to mint a real `iron-session` cookie via the
  production code path. The cookie is added to the Playwright browser
  context. This exercises the cookie path end-to-end without round-tripping
  Microsoft.

### Release-gate smoke test

Before each release, perform one real end-to-end sign-in with the product
owner's test account against the deployed environment. This validates the
Entra registration, secret rotation, redirect URI configuration, and
network egress in a way no automated test can.

### Spec & plan

- `specs/2026-05-17-azure-ad-auth-design.md`
- `plans/2026-05-17-azure-ad-auth.md`
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs(SECURITY): document MSAL Node auth migration + audit events"
```

---

## Task 20: Manual end-to-end verification

**Files:** none (manual)

This task gates the merge. It cannot be automated because it requires the rotated Client Secret and a real Microsoft account.

- [ ] **Step 1: Confirm pre-work done**

Verify with `cat .env.local` that all five vars from the Pre-work section are populated with the rotated secret. (Never commit this file.)

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Expected: listens on `http://localhost:4000`.

- [ ] **Step 3: Walk the happy path**

In a private browser window:
1. Open `http://localhost:4000/standard` → expect redirect to `/login?from=%2Fstandard`.
2. Click "Logg inn med Microsoft" → expect redirect to `login.microsoftonline.com`.
3. Sign in with the product owner's test account.
4. Expect to land on `/standard` with the UserMenu showing the correct name + role.
5. Verify the AuditLog has a `LOGIN_SUCCESS` row for your user.
6. Click "Logg ut" → expect redirect to `/login`. Verify AuditLog has a `LOGOUT` row.

- [ ] **Step 4: Walk one error path**

In Prisma Studio (`npm run db:studio`), set your User row's `status` to `inactive`.
Repeat the sign-in. Expect to land on `/login?error=inactive` with the Norwegian message visible. Verify a `LOGIN_INACTIVE_USER` audit row. Reset `status` to `active`.

- [ ] **Step 5: Verify rate limiting**

Hit `http://localhost:4000/api/auth/azure/login` 11 times in 60 seconds (a small `for` loop in another shell). The 11th should return 429.

- [ ] **Step 6: Confirm middleware blocks tampered cookies**

In DevTools, edit the `__hdo_session` cookie value (change a character). Reload `/standard`. Expect redirect to `/login`.

- [ ] **Step 7: Document the verification in the PR description**

Note in the PR description which paths were verified, with a screenshot of the UserMenu and the AuditLog rows.

---

## Self-review checklist (run before handing off)

- [ ] Spec coverage:
  - [ ] OAuth flow with PKCE S256 — Tasks 6, 11, 12
  - [ ] Single-tenant assertion via `claims.tid` — Task 12
  - [ ] User matching by `azureOid` then email — Task 12
  - [ ] Reject unknown / inactive users — Task 12
  - [ ] Session cookie (iron-session, 8h rolling) — Task 3
  - [ ] PKCE cookie — Task 4
  - [ ] Audit events for all six event types — Tasks 7, 12, 13
  - [ ] `/login` page in Norwegian, WCAG-compliant — Task 14
  - [ ] UserMenu + Logout — Task 15
  - [ ] Middleware cookie verification — Task 9
  - [ ] `getCurrentUserId` test-env fallback — Task 8
  - [ ] Open-redirect guard — Task 5
  - [ ] Rate limiting on login + callback — Tasks 11, 12
  - [ ] Remove RoleSwitcher, mockAuth, axios interceptor — Task 16
  - [ ] Playwright cookie helper + E2E auth spec — Tasks 17, 18
  - [ ] Secret rotation documented — Pre-work + Task 19
  - [ ] SECURITY.md updated — Task 19
  - [ ] Manual release-gate smoke — Task 20
