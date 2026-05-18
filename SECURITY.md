# Security

This document covers the security measures in HDO Turnusplan and the gaps
that are still open. Authentication is handled by **Microsoft Entra ID**
(OAuth 2.0 Authorization Code + PKCE via `@azure/msal-node`) with signed
session cookies (`iron-session`).

---

## Authentication

Sign-in goes through Microsoft Entra ID using OAuth 2.0 Authorization Code
flow with PKCE (S256). We use `@azure/msal-node` directly so we control the
PKCE state, the tenant check, and the ID-token claim validation ourselves.
The Microsoft access and refresh tokens are discarded after the callback
runs; only the user id ends up in our session.

Sessions are signed cookies managed by `iron-session`. The cookie is
`HttpOnly`, `Secure` in production, and `SameSite=Lax`. The session secret
comes from `SESSION_COOKIE_SECRET` and must be at least 32 characters.
Shorter values throw on startup (see `lib/auth/session.ts`).

The callback at `/auth/azure/callback`:

- verifies the OAuth state with a constant-time compare,
- checks that `tid` in the ID token matches `AZURE_TENANT_ID`,
- looks up the user by `azureOid`, then by email, and persists `azureOid`
  on first sign-in,
- rejects users whose `status` is not `active`,
- updates `lastLoginAt`,
- writes an `AuditLog` entry, then sets the session cookie.

Unknown accounts are rejected with `LOGIN_UNKNOWN_USER`. Admins create
`User` rows up front; the system does not auto-provision.

### Auth events logged

`LOGIN_SUCCESS`, `LOGIN_UNKNOWN_USER`, `LOGIN_INACTIVE_USER`,
`LOGIN_STATE_MISMATCH`, `LOGIN_WRONG_TENANT`, `LOGOUT`. Failed lookups use
`actorUserId='anonymous'`.

---

## Authorisation

Three roles: `ADMIN`, `LEADER`, `EMPLOYEE`. Authorisation is enforced at
three points:

1. **Edge middleware** (`middleware.ts`) rejects requests with no session
   cookie before they reach a route handler. Public paths (`/login`, the
   Azure callback, Next internals) are whitelisted.
2. **`withAuth` wrappers** (`lib/auth/withAuth.ts`) load the user from
   the database, optionally narrow by system role, and pass a typed `ctx`
   to the handler. Handlers cannot construct `ctx` themselves, so every
   wrapped route runs through the auth check.
3. **`assertTeamMember(ctx, teamId)`** verifies team membership for
   team-scoped routes. The source of truth is the `TeamMembership` table,
   not the cached `User.teamId`. `ADMIN` bypasses this check.

For routes where the caller is also the actor (notes, swaps, holiday
requests), the actor id is read from `ctx.userId` and the corresponding
field in the request body is ignored. This prevents impersonation by an
authenticated team member.

---

## Input validation

All API routes validate the request body with **Zod schemas**
(`lib/validation/schemas.ts`). The same schemas are reused on the frontend
so format errors fail fast in the browser and again on the server. Free-text
fields are length-capped (shift comments at 2000 characters, note bodies at
5000) so the database cannot be filled with arbitrarily large strings.

---

## CSRF and XSS

**CSRF.** The session cookie is `SameSite=Lax`, which blocks the standard
CSRF vector (cross-site `<form>` POSTs and sub-resource requests). The
logout endpoint is `POST`, so a malicious link cannot trigger silent
sign-out.

**XSS.** All user-supplied text is rendered through React's text-node
escaping (`{value}`). The codebase has no `dangerouslySetInnerHTML`, no
Markdown rendering, and no autolinking. A string like
`<img src=x onerror=...>` ends up as plain text on the page.

---

## Rate limiting

`lib/security/rateLimit.ts` is a per-identity in-memory token bucket keyed
on `routeKey + (user id || forwarded IP)`. Stricter limits apply to
`POST /api/shifts/bulk` (5 calls / minute) since it accepts up to 200 items
per call. The bucket is process-local and would need to move to Redis for
a multi-container deploy (see **Known gaps**).

---

## Database

- All queries go through Prisma with parameterised arguments, so SQL
  injection is not reachable through the ORM.
- `DATABASE_URL` uses TLS (`sslmode=require`). Hosted on Neon, EU region.
- `shifts(userId, date)` has a unique constraint at the DB level, so two
  concurrent inserts cannot create two shifts on the same day for the same
  user.
- `shift_types.color` has a `CHECK` constraint matching `^#[0-9A-Fa-f]{6}$`,
  even though Zod already enforces the same thing at the API.

---

## Audit logging

Privileged actions are written to the `AuditLog` table inside the same
Prisma transaction as the underlying mutation, so an audit row cannot
disappear if the mutation succeeded. Covered actions:

- **Users and membership:** user create, status/role change, team-member
  add/remove.
- **Organisation:** team create/delete, shift-type create/update/delete.
- **Schedule:** shift create/update/delete (including bulk).
- **Notes:** create, approve, reject; week-note upsert/delete.
- **Swap requests:** request, approve, reject, revoke, execute.
- **Holiday requests:** request, approve, reject, revoke.
- **Auth:** all `LOGIN_*` events and `LOGOUT`.

`beforeJson` and `afterJson` capture the changed fields, so a reviewer can
answer "who changed what, when" without rebuilding history from scratch.

---

## Privacy and GDPR (personvern)

HDO processes personal data about its employees, so GDPR applies (through
Personopplysningsloven in Norway). The system does **not** process
special-category data under Art. 9. Sick-leave shifts are stored as
opaque shift-type codes (`Sykdom`) with no clinical detail.

**Legal basis:**

- **Art. 6(1)(b)**, performance of contract: scheduling and request
  handling are part of the employment relationship.
- **Art. 6(1)(f)**, legitimate interest: audit logging of privileged
  actions, kept so that misuse can be investigated.

**Data minimisation:**

- OAuth scopes are `openid profile email` only, with no Microsoft Graph,
  no calendar or mail access.
- Microsoft access and refresh tokens are discarded right after the
  callback.
- `GET /api/users` returns only `id`, `name`, `role`, `teamId` (no email
  or `azureOid`).
- The audit-log scrubber (`lib/auth/audit.ts`) drops keys matching
  `/token|secret|password|code/i` before writing.

**Storage:** PostgreSQL on Neon, Frankfurt (EU). TLS in transit; encryption
at rest is provided by Neon. Personal data does not leave the EEA through
this application.

**Data subject rights** (GDPR Arts. 15–22), current support:

| Right | In-app? | How |
|---|---|---|
| Access (15) | Partial | Users see their own data in the UI. No formal export endpoint yet. |
| Rectification (16) | Yes | Users edit their own profile; admins edit other users. |
| Erasure (17) | Manual | Admin action through Prisma Studio or SQL. No self-service deletion. |
| Restriction (18) | Manual | Setting `User.status='inactive'` blocks all sign-ins. |
| Portability (20) | Partial | CSV/PDF export of shift data; no full user-data export. |
| Object (21) | N/A | Processing is contract-based, not consent-based. |

For erasure, access, and portability the user has to ask an admin today.
That is acceptable for an internal-tool MVP for a small team but should be
prioritised before any wider rollout.

**Breach response:** Art. 33 (notify Datatilsynet within 72 h) and Art. 34
(notify the affected data subjects on high risk) are HDO's internal
incident-response process and are not duplicated here. The `AuditLog` is
the system-of-record for any post-incident investigation of the auth
surface.

---

## Known gaps

- **Rate limit is process-local.** Needs Redis (or similar) for a
  multi-container deploy.
- **No CSP, HSTS, or other response headers** are configured yet. They
  should be added via `next.config.js` headers before going live.
- **No audit-log retention policy.** Rows are kept indefinitely today.
  HDO should pick a retention window (recommended: minimum 12 months for
  security investigation).
- **Holiday-request overlap protection is application-level only.**
  `assertNoOverlap` in `lib/services/holiday-service.ts` runs a pre-check
  before insert, which catches the common case, but a TOCTOU race window
  exists between the pre-check and the insert. A DB-level
  `EXCLUDE USING gist` constraint (with the `btree_gist` extension) would
  close it.
- **Email and SMS are stubs.** They log to the console today and need a
  real provider before going live.
- **No formal penetration test** has been performed.

---

## Test environment note

In `NODE_ENV==='test'`, `lib/auth/getCurrentUserId.ts` accepts an
`x-current-user-id` header as a fallback. This lets the Vitest route
suite run without standing up the full MSAL flow. The fallback is
unreachable in production: `NODE_ENV` is `production` in the deployed
container, and the middleware enforces a valid session cookie before any
route handler runs.
