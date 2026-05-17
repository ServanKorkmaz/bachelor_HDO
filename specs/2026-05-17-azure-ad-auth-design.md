# Azure AD authentication — design

**Date:** 2026-05-17
**Status:** Draft — pending user review
**Replaces:** mock authentication (`x-current-user-id` header + Zustand `RoleSwitcher`)

## Summary

Replace the mock authentication system with real Microsoft Entra ID (Azure AD) single-sign-on, using the **OAuth 2.0 Authorization Code flow with PKCE** via `@azure/msal-node`. Sessions are managed by `iron-session` as HttpOnly signed cookies. The migration touches only the three seams already documented in `SECURITY.md`: the OAuth route handlers, `middleware.ts`, and `lib/auth/getCurrentUserId.ts`. All business logic, route handlers, `withAuth`, and `assertTeamMember` remain unchanged.

This is HDO-grade work: defense-in-depth security posture, full audit trail for security events, Norwegian-language UI, WCAG 2.1 AA compliance.

## Goals

- Replace mock auth with Microsoft Entra ID sign-in for the production deploy.
- Preserve the existing wrapper-based authorisation model (`withAuth`, `assertTeamMember`) so no route handler or business-logic file changes.
- Audit every security-relevant auth event.
- Keep the existing test suite (29 files using `x-current-user-id`) passing without modification, via a test-only seam gated by `NODE_ENV==='test'`.

## Non-goals

- Multi-tenant support. Single tenant only (`2fa3d13b-cb75-4f29-bf34-f17a7578c041`).
- Automatic user provisioning. Unknown Microsoft accounts are rejected; admin must pre-create the User row.
- Microsoft Graph integration. Scopes limited to `openid profile email`.
- Impersonation / "view as". The mock `RoleSwitcher` is removed entirely.
- Refresh-token handling beyond initial exchange. Sessions expire on cookie TTL (8h rolling); user re-signs-in.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| OAuth library | `@azure/msal-node` | Microsoft's official library, designed for Node web servers; clean fit with Next.js App Router; no Express adapter needed. |
| Session storage | `iron-session` signed cookie | Edge-runtime-compatible verification (pure crypto, no DB); already named in `SECURITY.md`. |
| Dev server port | 4000 (`next dev -p 4000`) | Matches Entra-registered redirect URI; no portal changes needed for development. |
| User provisioning | Reject unknown accounts | Small team / bachelor's project scope — admin pre-creates users with explicit role + team. |
| User matching | Email on first login, then `azureOid` | Schema already has `azureOid String? @unique`; admin only needs email when creating users. |
| RoleSwitcher | Remove entirely | Real auth replaces it. Simpler, no impersonation footgun. |
| Test auth | Header seam, `NODE_ENV==='test'` only | Avoids churning 29 existing test files; production code path closed. |
| Session TTL | 8 hours, rolling | Workday balance — doesn't kick users out mid-shift, doesn't leave forgotten laptops logged in. |
| Redirect URI | `http://localhost:4000/api/auth/azure/callback` (add to Entra) | Keeps OAuth routes under `/api/*` where middleware applies; no special-case matchers. |

## Architecture

### Auth flow (Authorization Code + PKCE, single-tenant)

```
1. Unauthenticated user → middleware → 302 /login?from=<path>
2. /login page → "Logg inn med Microsoft" → GET /api/auth/azure/login?from=<path>
3. Login route:
   - Generate PKCE verifier (43-128 char) + challenge (S256)
   - Generate state (32 bytes random)
   - Set __hdo_pkce cookie { verifier, state, from } (HttpOnly, Secure in prod, SameSite=Lax, 10 min TTL)
   - msal.getAuthCodeUrl({ scopes:['openid','profile','email'], state, codeChallenge, codeChallengeMethod:'S256' })
   - 302 → login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize
4. User authenticates at Microsoft (MFA, conditional access handled there)
5. Microsoft → 302 http://localhost:4000/api/auth/azure/callback?code=…&state=…
6. Callback route — chained verification:
   a. Read __hdo_pkce cookie; if missing → 400 "Innloggingen utløp"
   b. timingSafeEqual(query.state, cookie.state); mismatch → 400 + audit LOGIN_STATE_MISMATCH
   c. msal.acquireTokenByCode({ code, codeVerifier }) → idTokenClaims { oid, tid, email, name }
   d. claims.tid === AZURE_TENANT_ID; mismatch → 403 + audit LOGIN_WRONG_TENANT
   e. Lookup user: by azureOid; fallback by email (then set azureOid); not found → 403 + audit LOGIN_UNKNOWN_USER
   f. user.status === 'active'; inactive → 403 + audit LOGIN_INACTIVE_USER
   g. Update lastLoginAt; audit LOGIN_SUCCESS
   h. iron-session cookie { userId } (HttpOnly, Secure in prod, SameSite=Lax, 8h rolling)
   i. Clear __hdo_pkce cookie
   j. 302 → validated `from` path (allowlist: starts with /, not //, no scheme)
7. Subsequent requests:
   - middleware verifies __hdo_session signature (Edge-safe, pure crypto)
   - getCurrentUserId reads cookie → userId
   - withAuth loads User from DB → ctx → handler
8. POST /api/auth/logout:
   - audit LOGOUT
   - destroy session cookie
   - 302 → /login
```

### Audit events

All written to existing `AuditLog` table:

- `LOGIN_SUCCESS`
- `LOGIN_UNKNOWN_USER`
- `LOGIN_INACTIVE_USER`
- `LOGIN_STATE_MISMATCH`
- `LOGIN_WRONG_TENANT`
- `LOGOUT`

HDO can answer "who logged in when, and why did anyone fail."

## File-by-file changes

### New files

| File | Purpose | ~LOC |
|---|---|---|
| `lib/auth/azureAd.ts` | MSAL `ConfidentialClientApplication` singleton + `buildAuthCodeUrl`/`exchangeCodeForTokens` helpers. Throws at import-time on missing env. | 60 |
| `lib/auth/session.ts` | `iron-session` wrapper. Cookie `__hdo_session`, password from `SESSION_COOKIE_SECRET`, 8h rolling. Exports `getSession`/`saveSession`/`destroySession`. | 40 |
| `lib/auth/pkceCookie.ts` | Short-lived `__hdo_pkce` cookie for PKCE state between login + callback. 10 min TTL, cleared on read. | 30 |
| `lib/auth/audit.ts` | `logAuthEvent({ event, actorUserId?, details? })` — never throws into auth flow. Includes shallow scrubber dropping keys matching `/token\|secret\|password\|code/i`. | 30 |
| `app/api/auth/azure/login/route.ts` | GET — generates PKCE, sets cookie, redirects to Microsoft. | 30 |
| `app/api/auth/azure/callback/route.ts` | GET — runs full verification chain from step 6. Generic Norwegian errors to user; specific reasons server-side. | 80 |
| `app/api/auth/logout/route.ts` | POST only (CSRF guard) — destroys session, audits, redirects. | 20 |
| `app/api/auth/me/route.ts` | GET — returns `{ id, name, email, role, teamId }` for logged-in user. Wrapped with `withAuth`. | 20 |
| `app/login/page.tsx` | Single "Logg inn med Microsoft" button. Reads `?error=…`, maps to Norwegian messages via `lib/i18n.ts`. WCAG compliant. | 50 |
| `.env.example` | Documents required vars without values. Committed. | 10 |

### Modified files

| File | Change |
|---|---|
| `middleware.ts` | Swap header check for `iron-session` cookie verify. Public paths: `/login`, `/api/auth/azure/*`, `/api/auth/logout`, `/_next`, `/favicon.ico`. Page routes redirect to `/login?from=…`; API routes return 401. |
| `lib/auth/getCurrentUserId.ts` | Read from session cookie. If `NODE_ENV==='test'`, fall back to `x-current-user-id` header. Production path closed to the header. |
| `components/layout/Navigation.tsx` | Replace `<RoleSwitcher />` with `<UserMenu />` — fetches `/api/auth/me`, shows `{user.name}` + role chip + Logout button (form POST). |
| `lib/axios.ts` | Remove `x-current-user-id` interceptor. Cookies sent automatically same-origin. |
| `package.json` | Add `@azure/msal-node`, `iron-session`. Change `dev` script to `next dev -p 4000`. |
| `SECURITY.md` | Update "Migration to passport-microsoft" section: MSAL Node, redirect URI path, test-env header seam, five audit events. |

### Deleted files

- `lib/auth/mockAuth.ts`
- `lib/auth/azure-ad-placeholder.ts`
- `components/auth/RoleSwitcher.tsx`
- `components/RoleSwitcher.tsx`

**Totals:** 10 new, 6 modified, 4 deleted. No schema changes. No business-logic changes.

## Security hardening

### Cookies

- `__hdo_session`: `HttpOnly`, `Secure` (prod only), `SameSite=Lax`, `Path=/`, AEAD-sealed by `iron-session`.
- `__hdo_pkce`: same flags, plus `Max-Age=600`. Cleared on first read.
- Logout clears with `Max-Age=0` + matching attributes (required for browser deletion).

### OAuth correctness

- **PKCE S256** mandatory. Verifier from `crypto.randomBytes(32).toString('base64url')`. Defends against authorization-code interception.
- **State parameter** 32 random bytes. Verified with `crypto.timingSafeEqual` against cookie value.
- **Scopes** `openid profile email` only. No Graph, no `User.Read`. Minimum claim surface.
- **Token validation** MSAL Node verifies signature/issuer/audience/expiry via JWKS. Additional explicit assertion: `claims.tid === AZURE_TENANT_ID` (defense in depth).
- **No token storage** access + refresh tokens discarded after claims extraction. Only `userId` in session.

### Open-redirect prevention

`?from=…` validated against allowlist: starts with `/`, not `//`, not `/\`, no `:`, no whitespace. Otherwise default to `/`.

### CSRF

- Login is GET (safe — only triggers redirect; no state change until callback).
- Logout is POST only. SameSite=Lax blocks cross-origin form submission with cookies.
- All other state-changing routes use `withAuth` + same-origin model (existing pattern).

### Rate limiting

Using existing `lib/security/rateLimit.ts`:

- `/api/auth/azure/login`: 10/min per IP.
- `/api/auth/azure/callback`: 20/min per IP.

### Secret hygiene

- `AZURE_CLIENT_SECRET`, `SESSION_COOKIE_SECRET` never logged, never in error messages, never sent to client.
- `.env*` already gitignored. `.env.example` committed with empty values.
- **Action item before merge:** rotate the Client Secret in Entra (the one shared during brainstorming is compromised). Generate a fresh one for `.env.local`.

### Session fixation

`iron-session` regenerates seal on every save. Fresh save after login mints a new sealed cookie — pre-login state cannot be carried forward.

### Logging discipline

`lib/auth/audit.ts` includes a shallow scrubber that drops keys matching `/token|secret|password|code/i` from `details`. Belt-and-braces.

### WCAG / Norwegian Universal Design (`/login`)

- `<main>` landmark, `<h1>` "Logg inn", semantic `<button>` (not styled link).
- Focus visible, contrast ≥4.5:1.
- Error region `role="alert"` for `?error=…` text.
- Keyboard-only and screen reader verified before merge.
- `axe-core` zero violations in E2E suite.

## Error-handling matrix

| Failure | User sees (Norwegian) | Status | Audit | Server log |
|---|---|---|---|---|
| Missing PKCE cookie | "Innloggingen utløp. Prøv på nytt." | 400 | — | `WARN pkce_cookie_missing` |
| State mismatch | "Ugyldig innloggingsforespørsel." | 400 | `LOGIN_STATE_MISMATCH` | `ERROR state_mismatch` (values logged) |
| Token exchange fails | "Microsoft-innlogging feilet." | 502 | — | `ERROR token_exchange` (msal code only, no tokens) |
| Wrong tenant `tid` | "Ikke autorisert tenant." | 403 | `LOGIN_WRONG_TENANT` | `WARN wrong_tenant got=… expected=…` |
| Unknown user | "Ingen tilgang. Kontakt administrator." | 403 | `LOGIN_UNKNOWN_USER` | `INFO unknown_user email=… oid=…` |
| Inactive user | "Kontoen er deaktivert. Kontakt administrator." | 403 | `LOGIN_INACTIVE_USER` | `INFO inactive_user userId=…` |
| Internal exception | "Det oppstod en feil. Prøv igjen." | 500 | — | `ERROR auth_callback_exception` + stack |

User-visible response never contains claim values, OIDs, or tenant IDs. Errors surface as `/login?error=<code>` where `<code>` is from a small enum (`expired`, `invalid`, `unknown_user`, `inactive`, `tenant`, `failed`).

## Testing strategy

### Unit tests (Vitest)

- `tests/lib/auth/session.test.ts` — seal/read round-trip, wrong secret rejected, expiry, rolling refresh.
- `tests/lib/auth/pkceCookie.test.ts` — round-trip, cleared after read, tampered → null, expired → null.
- `tests/lib/auth/azureAd.test.ts` — PKCE S256 in URL, verifier length + base64url format, challenge = sha256(verifier), throws on missing env.
- `tests/lib/auth/audit.test.ts` — writes row, scrubber drops sensitive keys, DB throw does not propagate.
- `tests/lib/auth/getCurrentUserId.test.ts` *(update)* — cookie returns userId; in test env header fallback works; in prod header ignored; null when neither.

### Route handler tests (Vitest, MSAL mocked)

- `tests/api/auth/login.route.test.ts` — redirects to Microsoft URL; sets pkce cookie with correct flags; `from=//evil` rejected; rate limit returns 429.
- `tests/api/auth/callback.route.test.ts` — one test per error matrix row, plus happy path (session set, lastLoginAt updated, audit LOGIN_SUCCESS, redirect to `from`).
- `tests/api/auth/logout.route.test.ts` — GET → 405; POST destroys cookie + audits; idempotent without session.
- `tests/api/auth/me.route.test.ts` — returns user shape; 401 without session.

### Middleware tests

- `tests/middleware.test.ts` *(create if missing)* — valid cookie passes; tampered/expired → 401 for API, 302 for pages; public paths bypass.

### Regression — existing suite

Acceptance: **`npm test` passes with zero changes to the 29 files using `x-current-user-id`**, except tests that explicitly tested mock auth itself (e.g. `tests/lib/get-current-user-id.test.ts` gets new cases added rather than rewritten).

### E2E (Playwright)

`tests/e2e/auth.spec.ts`:

- Unauth visit to `/standard` → redirected to `/login`.
- `/login` renders sign-in button, focusable via keyboard, axe-core zero violations.
- Click button → 302 to `login.microsoftonline.com` (assert header, don't follow).
- Authenticated flows: a `tests/e2e/helpers/auth.ts` helper mints an `iron-session` cookie for a seeded test user using the same `lib/auth/session.ts` code paths, then `context.addCookies(...)` seeds it into the browser context. This exercises the production cookie path end-to-end without round-tripping Microsoft and without adding any production code conditional.
- Logout button → POST → `/login`.
- User chip shows correct name + role.

### Manual release-gate smoke test

One real end-to-end test with the product owner's test account before each release. Documented in `SECURITY.md`. Not in CI (depends on live Microsoft account).

### Explicitly NOT tested

- Token signature validation (MSAL Node does it).
- Microsoft's authorization endpoint behavior.
- Real network calls to `login.microsoftonline.com` (flaky; stubbed via MSAL mock).

## Environment variables

`.env.example` (committed):

```
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_REDIRECT_URI=http://localhost:4000/api/auth/azure/callback
SESSION_COOKIE_SECRET=     # 32+ char random; generate with `openssl rand -base64 32`
```

`.env.local` (gitignored): actual secrets, populated after Client Secret rotation.

## Open action items (not part of code work)

1. **Rotate** the leaked `AZURE_CLIENT_SECRET` in Entra; populate `.env.local` with the fresh value.
2. **Add** `http://localhost:4000/api/auth/azure/callback` to the Entra app registration's redirect URIs.
3. **Generate** `SESSION_COOKIE_SECRET` locally and add to `.env.local`.

## Rollback

The migration touches three seams; rolling back is the reverse:

1. Revert `middleware.ts` to header check.
2. Revert `getCurrentUserId.ts` to header read.
3. Restore `lib/auth/mockAuth.ts` + `RoleSwitcher` + axios interceptor.

Route handlers, `withAuth`, `assertTeamMember`, and business logic are unchanged, so rollback is a contained git revert of the auth seam commits.
