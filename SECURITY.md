# Security model

This document describes the security posture of the HDO Turnusplan MVP, the
threats it defends against, and the trade-offs that exist because the app is
currently a demo using mock authentication. It is meant to be read by reviewers
who want to understand *why* the code looks the way it does.

## Authentication (mock)

The MVP uses a mock authentication system based on a custom HTTP header,
`x-current-user-id`, set by an Axios interceptor that reads the active user
from the Zustand store populated by the `RoleSwitcher` component. The header
is read by `getCurrentUserId` and consumed by `requireTeamMembership` and
`requireAuth` on the server.

In production this would be replaced by **Azure AD / Entra ID** (`NextAuth.js`
or MSAL) — the scaffolding is in `lib/auth/azure-ad-placeholder.ts`.

## Authorisation

All mutation endpoints and team-scoped reads pass through one of two helpers:

- `requireAuth(request, allowedRoles?)` — caller must be authenticated.
- `requireTeamMembership(request, teamId, allowedRoles?)` — caller must be a
  member of the team (ADMIN bypasses for cross-team reads).

Allowed roles narrow the access further. For example, `POST /api/shifts`
requires `ADMIN` or `LEADER` membership in the target team.

For routes where the caller's identity is also the actor (notes creator, swap
requester), the server **derives** the actor id from the authenticated session
and ignores any value passed in the request body. This prevents impersonation
even by an authenticated team member.

## CSRF

Cookie-based sessions are vulnerable to CSRF because browsers attach cookies
automatically to cross-origin requests. The mock auth uses a **custom request
header**, not a cookie:

- A cross-origin attacker cannot set `x-current-user-id` from a malicious site
  without a CORS preflight, which would fail because the route does not opt in
  to cross-origin credentials.
- Simple form submissions cannot carry custom headers, so classic CSRF GET/POST
  attacks cannot reach our mutation endpoints with valid auth.

No CSRF token machinery is needed for this auth model. When the production
deployment moves to Azure AD with cookie-based sessions, CSRF tokens (or the
`SameSite=Lax` default plus a double-submit cookie) should be reintroduced.

## XSS

All user-supplied text — note bodies, shift comments, holiday request messages
— is rendered through React's text-node escaping (`{value}`). The codebase
contains:

- **No** `dangerouslySetInnerHTML` usage.
- **No** Markdown rendering.
- **No** automatic link detection or autolinking.

This means a string like `<img src=x onerror=...>` lands as plain text on the
page; it is not executed. Length and basic shape of free-text fields are
enforced by Zod schemas (`lib/validation/schemas.ts`) — for example, shift
comments and note bodies are capped at 2000–5000 characters.

If we add a Markdown renderer in the future, it must be paired with DOMPurify
or a similar HTML sanitiser configured to strip `<script>`, `<iframe>`, event
handler attributes, and `javascript:` URLs.

## Rate limiting

`lib/security/rateLimit.ts` implements a per-identity in-memory token bucket
keyed by `routeKey + (authenticated user id || forwarded IP)`. It is applied
to all mutation endpoints, with stricter limits on
`POST /api/shifts/bulk` (5 calls / minute) which can accept up to 200 items
per call.

This is **process-local** — it works on a single Node instance but does not
share state across serverless replicas. A production deployment should
replace it with Upstash Redis (or any external store) so the limit holds
across cold starts and parallel function instances.

## Database

- All Prisma queries use parameterised arguments — SQL injection is not
  possible through the ORM surface.
- The `Shift.userId, date` composite is enforced as `@@unique` at the database
  level so concurrent inserts cannot create duplicates regardless of
  application-layer race conditions.
- The connection string is supplied via `DATABASE_URL` (Neon, EU region) and
  uses TLS (`sslmode=require`).

## Data minimisation

`GET /api/users` returns only `id`, `name`, `role`, and `teamId` — never
`email`, `azureOid`, or `lastLoginAt`. This endpoint is intentionally
unauthenticated because the mock `RoleSwitcher` needs it to bootstrap on
first load; in production the user directory would be served from Azure AD
and gated by auth.

## Audit logging

Privileged actions (user creation/status changes, membership changes, swap
decisions, holiday decisions) are recorded in the `AuditLog` table via
`createAuditLog` inside the same Prisma transaction as the underlying
mutation, so audit entries cannot disappear if the mutation succeeds.

## Calendar dates as strings

`Shift.date`, `Note.dateFrom/dateTo`, and `HolidayRequest.dateFrom/dateTo`
are stored as `String "YYYY-MM-DD"` rather than `@db.Date`. This is a
deliberate choice, not legacy debt:

- A "shift day" is a wall-clock calendar concept; it should not be
  re-interpreted across timezones. Storing as `DateTime` would mean Prisma
  returns a `Date` at midnight UTC, which becomes the previous or next
  calendar day in many user timezones once the browser parses it back.
- ISO 8601 date strings sort lexicographically the same way they sort
  chronologically, so DB queries (`gte`/`lte`) work without conversion.
- The Zod schemas validate both *format* (regex) and *validity* (refines
  via `date-fns.parse + isValid`), so impossible inputs like `2026-13-45`
  or `2026-02-30` are rejected at the API boundary, not at the DB.

## Known gaps

- Mock auth — production must replace with Azure AD.
- Rate limit is process-local (see above).
- No CSP, HSTS, or other response headers are configured. These should be
  added via `next.config.js` or Vercel `headers` config before going live.
