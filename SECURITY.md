# Security model

This document describes the security posture of the HDO Turnusplan MVP, the
threats it defends against, and the trade-offs that exist because the app is
currently a demo using mock authentication. It is meant to be read by reviewers
who want to understand *why* the code looks the way it does.

## Authentication (mock)

The MVP uses a mock authentication system based on a custom HTTP header,
`x-current-user-id`, set by an Axios interceptor that reads the active user
from the Zustand store populated by the `RoleSwitcher` component.

In production this is replaced by **Azure AD / Entra ID via
[passport-microsoft](https://www.passportjs.org/packages/passport-microsoft/)**.
The placeholder scaffolding lives in `lib/auth/azure-ad-placeholder.ts`. See
"Migration to passport-microsoft" below for what flips over.

## Authorisation — three-layer defense-in-depth

Every `/api/*` route passes through three independent layers. The wrapper
layer (layer 2) is the source of truth; the others are belt-and-braces.

### Layer 1 — Edge middleware (`middleware.ts`)

A thin Next.js Edge-runtime gate that runs *before* the route handler is even
loaded. It rejects requests that have no session marker at all, so the cheap
unauthenticated case never touches Prisma. Public routes (e.g. the
RoleSwitcher's `GET /api/users` bootstrap) are explicitly whitelisted.

The middleware does **not** do DB lookups, role checks, or team-membership
checks — those would either pull Prisma into the Edge Runtime or duplicate
logic that belongs closer to the handler. Its single job is "is there any
session marker on this request?".

### Layer 2 — Route-handler wrappers (`lib/auth/withAuth.ts`)

Every route handler is exported through `withAuth` (or its `withAdmin`
shorthand). The wrapper:

- Reads the current user id from the request.
- Loads the user from the database, rejecting if missing.
- Optionally narrows by system role.
- Passes a typed `ctx: { userId, role, params }` to the inner handler.

This is the *load-bearing* check. Because the handler signature requires a
`ctx`, and `ctx` is only constructable by the wrapper, **forgetting the auth
check is a compile-time impossibility** for any route that uses the wrapper.
This is the structural fix for the "we forgot to call requireAuth on one route"
class of bugs.

### Layer 3 — Per-resource authorisation (`assertTeamMember`)

After the wrapper has confirmed *who* is calling, team-scoped routes call
`assertTeamMember(ctx, teamId, allowedRoles?)` to confirm *what* they may do.
Source of truth for team membership is the `TeamMembership` table — never the
cached `User.teamId` column. ADMIN bypasses the membership lookup so the same
function supports cross-team admin reads.

For routes where authorisation is by ownership (e.g. "you can only mark *your*
notifications as read"), the handler compares `ctx.userId` to the resource's
owner directly.

### Identity propagation

For routes where the caller's identity is also the actor (notes creator, swap
requester, holiday-request submitter), the server **always** derives the actor
id from `ctx.userId` and ignores any value passed in the request body. This
prevents impersonation even by an authenticated team member.

## Migration to passport-microsoft

The app will run in a Docker container with a Node.js runtime, using
`passport-microsoft` for the Microsoft OAuth 2.0 flow. The migration touches a
single seam:

1. `app/api/auth/microsoft` and `app/api/auth/microsoft/callback` route
   handlers (Node.js runtime) run the OAuth flow and set a **signed session
   cookie** on success. Server-side sessions managed via `iron-session` or
   `cookie-session`.
2. `lib/auth/getCurrentUserId.ts` switches from reading the
   `x-current-user-id` header to reading the signed cookie and extracting the
   user id from its claims.
3. `middleware.ts` switches from checking for the header to verifying the
   signed cookie's signature in the Edge Runtime (works because signature
   verification is pure crypto — no DB required).

The route handlers, `withAuth` / `withAdmin` wrappers, `assertTeamMember`, and
every business-logic file stay unchanged. That is the whole point of the
wrapper pattern: the auth implementation is one swappable seam.

## CSRF

Cookie-based sessions are vulnerable to CSRF because browsers attach cookies
automatically to cross-origin requests. The mock auth uses a **custom request
header**, not a cookie:

- A cross-origin attacker cannot set `x-current-user-id` from a malicious site
  without a CORS preflight, which would fail because the route does not opt in
  to cross-origin credentials.
- Simple form submissions cannot carry custom headers, so classic CSRF GET/POST
  attacks cannot reach our mutation endpoints with valid auth.

No CSRF token machinery is needed for the mock model. When passport-microsoft
lands, CSRF protection is reintroduced via `SameSite=Lax` on the session cookie
plus a double-submit token pattern for mutating endpoints.

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
share state across replicas. When the Docker deployment scales beyond one
container, the bucket should move to Redis (the keying scheme is unchanged;
only the store swaps).

## Database

- All Prisma queries use parameterised arguments — SQL injection is not
  possible through the ORM surface.
- The connection string is supplied via `DATABASE_URL` (Neon, EU region) and
  uses TLS (`sslmode=require`).

### DB-level invariants

Defense-in-depth: the API does validation, but the database also refuses
invalid state so writes that bypass the API (seed scripts, manual SQL, future
ETL, concurrent races) cannot leave the schema in an impossible shape.

- `shifts(userId, date)` is `@@unique` — concurrent inserts cannot produce two
  shifts on the same calendar day for the same user. Closes the
  shift-creation race that motivated commit `aa4b251`.
- `shift_types.color` has a `CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$')` constraint.
  The Zod schema enforces this at the API too; the CHECK exists so seed/SQL
  paths can't sneak past it.
- `holiday_requests` has an `EXCLUDE USING gist` constraint over
  `(userId WITH =, daterange(dateFrom, dateTo) WITH &&)` scoped to
  `WHERE (status <> 'REJECTED')`. Two concurrent submissions for an
  overlapping period for the same user cannot both succeed; one fails with a
  Postgres exclusion violation that `lib/services/holiday-service.ts`
  translates to a 409. Requires the `btree_gist` extension (enabled by the
  migration).

## Data minimisation

`GET /api/users` returns only `id`, `name`, `role`, and `teamId` — never
`email`, `azureOid`, or `lastLoginAt`. This endpoint is intentionally
unauthenticated because the mock `RoleSwitcher` needs it to bootstrap on
first load (and is explicitly whitelisted in `middleware.ts`); in production
the user directory would be served from Azure AD and gated by auth.

## Audit logging

Privileged actions (user creation/status changes, membership changes, swap
decisions, holiday decisions) are recorded in the `AuditLog` table via
`createAuditLog` inside the same Prisma transaction as the underlying
mutation, so audit entries cannot disappear if the mutation succeeds.

## Notification events

`lib/notifications/events.ts` defines a `DomainEvent` discriminated union
covering every notification the system produces (shift lifecycle, swap
workflow, holiday decisions, note decisions). Services emit events through a
typed `withEvents((tx, emit) => …)` helper that:

1. Runs the domain operation inside a Prisma transaction.
2. Persists each emitted notification's row **inside that same transaction**,
   so a notification cannot survive a write that ultimately rolled back, and
   a write cannot produce orphan state if the notification insert fails.
3. Fans out to email/SMS channels **after the transaction commits**, so
   external recipients never hear about a write that didn't happen.

Title/message text for every event lives in one `render()` switch — sensor
and future developers see "this is what the system communicates" in one
place. Adding a new notification = one variant in the union + one `case` in
`render()` + one `emit()` call from a service.

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

- Mock auth — production must replace with passport-microsoft (see above).
- Rate limit is process-local — needs Redis when running more than one
  container.
- No CSP, HSTS, or other response headers are configured yet. These should be
  added via `next.config.js` headers before going live.
