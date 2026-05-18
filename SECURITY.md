# Security model

This document describes the security posture of the HDO Turnusplan MVP, the
threats it defends against, and the trade-offs that exist. Authentication is
**Microsoft Entra ID** (OAuth Authorization Code + PKCE via `@azure/msal-node`
with `iron-session` signed cookies). The historical mock-auth design that
preceded it is retained only as a test-environment seam — see
"Authentication: Microsoft Entra ID via MSAL Node" for the current production
implementation. This document is meant to be read by reviewers who want to
understand *why* the code looks the way it does.

## Authentication (historical: mock system)

Earlier versions of the MVP used a mock authentication system based on a custom
HTTP header, `x-current-user-id`, set by an Axios interceptor that reads the
active user from the Zustand store populated by the `RoleSwitcher` component.

This has been replaced by **Microsoft Entra ID** (see below). The mock auth is
retained for test scenarios; see "Authentication: Microsoft Entra ID via MSAL
Node" for the current production implementation.

## Authorisation — three-layer defense-in-depth

Every `/api/*` route passes through three independent layers. The wrapper
layer (layer 2) is the source of truth; the others are belt-and-braces.

### Layer 1 — Edge middleware (`middleware.ts`)

A thin Next.js Edge-runtime gate that runs *before* the route handler is even
loaded. It rejects requests that have no session marker at all, so the cheap
unauthenticated case never touches Prisma. Public routes (e.g. `/login` and
the Azure auth callback) are explicitly whitelisted.

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
   - `GET /auth/azure/callback` — verifies state (constant-time compare),
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
  (Vitest sets `NODE_ENV=test` automatically). A global setup in
  `tests/setup.ts` provides a fixed `SESSION_COOKIE_SECRET` so modules
  that import the session wrapper can load without the production
  env-var check tripping.
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

## CSRF

Cookie-based sessions are vulnerable to CSRF because browsers attach cookies
automatically to cross-origin requests. The production model mitigates this
in two complementary ways:

- The `__hdo_session` cookie is set with `SameSite=Lax`, which causes browsers
  to omit it on cross-site sub-resource requests and on `<form>` POSTs initiated
  by a third-party page. This blocks the classic CSRF vector without requiring
  CSRF tokens on every mutation.
- The logout action is `POST /api/auth/logout` (not a `GET`). `SameSite=Lax`
  still allows top-level navigation GETs, but the logout handler enforces the
  POST method, so a malicious link cannot trigger silent sign-out.

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
`email`, `azureOid`, or `lastLoginAt`. This endpoint is **authenticated** —
it is no longer on the middleware public allowlist and requires a valid
`__hdo_session` cookie. (It was previously unauthenticated to support the
`RoleSwitcher` component, which has since been removed.)

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

## Privacy and GDPR (personvern)

HDO operates within the Norwegian healthcare sector and the application
processes personal data of employees. GDPR (operationalised in Norway via
*Personopplysningsloven*) applies. This section documents what we process,
why, where it lives, and what is — and is not — supported today.

### Categories of personal data processed

- **Identification:** name, email, Microsoft Entra Object ID (`azureOid`).
- **Employment/role context:** system role (ADMIN/LEADER/EMPLOYEE), home
  team, team memberships.
- **Operational data:** shifts, swap requests, holiday/absence requests,
  notification preferences.
- **Activity data:** `User.lastLoginAt`; `AuditLog` rows for privileged
  actions and authentication events.

We do **not** process special-category data under GDPR Art. 9 (no health
data, no diagnoses, no medical records). Sick-leave shifts are stored as
opaque shift-type codes (`"Sykdom"`) without any clinical detail.

### Legal basis (GDPR Art. 6)

- **Art. 6(1)(b)** — performance of a contract: shift planning, swap
  handling, and holiday requests are part of the employment relationship.
- **Art. 6(1)(f)** — legitimate interest: audit logging of privileged
  actions and authentication events, retained to investigate misuse and
  defend against unauthorised access. The interest is balanced against
  employees' expectation of routine workplace recordkeeping.

### Data minimisation by design

- **OAuth scopes:** `openid profile email` only — no Microsoft Graph,
  no `User.Read`, no calendar/mail access.
- **No token storage:** Microsoft access and refresh tokens are discarded
  immediately after the ID-token claims are extracted. Only `userId` lives
  in our session cookie.
- **No password storage:** authentication is delegated entirely to
  Microsoft Entra. The application never sees, transmits, or stores user
  passwords.
- **API responses are pruned:** `GET /api/users` returns only `id`, `name`,
  `role`, and `teamId` — not email or `azureOid` (see *Data minimisation*
  above).
- **Audit-log scrubber:** `lib/auth/audit.ts` drops any key matching
  `/token|secret|password|code/i` from event details before persisting,
  as defence in depth against accidental disclosure of sensitive values.

### Storage location and sub-processors

- **Database:** PostgreSQL hosted on Neon, EU region (Frankfurt). TLS in
  transit (`sslmode=require`). Encryption at rest is provided by Neon.
  Personal data does not leave the EEA via our application.
- **Identity provider:** Microsoft Entra ID (Azure AD). Authentication is
  delegated to Microsoft. Data shared with Microsoft is limited to what
  the OAuth flow inherently requires (the authorisation request itself).
- **Email/SMS delivery:** notification channels are pluggable; the choice
  of provider determines additional sub-processors and must be documented
  here before any provider goes live in production.

### Retention

- **User records:** retained while the account is active. The
  `User.status` column supports a soft-delete pattern (`inactive`)
  — inactive users are blocked from sign-in at the callback handler.
- **Audit log:** there is currently **no automated retention policy**.
  HDO should set one (recommended: minimum 12 months for security
  investigation, maximum aligned with internal policy and any applicable
  sector requirements). Implementation gap, not architectural barrier:
  a periodic job that deletes rows older than N days is a small follow-up.
- **Notifications and operational data:** retained indefinitely today.
  A retention policy for read notifications and historical shifts should
  be set by HDO based on operational need.

### Data subject rights

The application's architecture supports the data subject rights in GDPR
Arts. 15–22. Current implementation status:

| Right (Art.) | Supported in-app? | How |
|---|---|---|
| Access (15) | Partial | Users see their own data through the UI. A formal export endpoint is not yet implemented. |
| Rectification (16) | Yes | Users update their own profile fields; admins update other users. |
| Erasure (17) | Manual | Requires admin action through Prisma Studio or a SQL operation. There is no self-service "delete my account" flow. |
| Restriction (18) | Manual | Setting `User.status = 'inactive'` blocks all sign-in and effectively halts processing. |
| Portability (20) | Partial | Shift and audit data can be exported as CSV/PDF from the existing export endpoints; full user-data export is not yet implemented. |
| Object (21) | N/A | Processing is contract-based, not consent-based — Art. 21 does not apply to the primary processing. |

**Honesty on gaps:** the access, erasure, and portability rights require
manual administrator action today rather than a self-service flow. This
is acceptable for an internal-tool MVP for a small team, but should be
prioritised before any expansion to more users.

### Audit-trail of access to personal data

`AuditLog` captures every privileged write (user creation, status change,
team membership change, swap decision, holiday decision) and every
authentication event (`LOGIN_SUCCESS`, `LOGIN_UNKNOWN_USER`,
`LOGIN_INACTIVE_USER`, `LOGIN_STATE_MISMATCH`, `LOGIN_WRONG_TENANT`,
`LOGOUT`). This supports the GDPR Art. 5(2) accountability principle and
allows HDO to answer "who accessed or changed which record, when".

Reads of personal data are not currently audited. If HDO requires
read-side accountability (e.g. "who looked at this employee's shifts last
month"), that is a follow-up that fits within the existing wrapper-based
architecture without changes to route handlers.

### Breach response

In the event of a confirmed personal-data breach, GDPR Art. 33 requires
notification to *Datatilsynet* (the Norwegian Data Protection Authority)
within 72 hours, and notification to affected data subjects (Art. 34)
where the breach is likely to result in high risk. HDO's internal incident
response process owns this; this document does not duplicate it. The
auth audit-log table is the system-of-record for any post-incident
investigation of the authentication surface.

## Known gaps

- Rate limit is process-local — needs Redis when running more than one
  container.
- No CSP, HSTS, or other response headers are configured yet. These should be
  added via `next.config.js` headers before going live.
