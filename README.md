# HDO Turnusplan

[![CI](https://github.com/ServanKorkmaz/bachelor_HDO/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ServanKorkmaz/bachelor_HDO/actions/workflows/ci.yml)

Web-based shift planning system (turnusplan) for **Helsetjenestens
driftsorganisasjon for nødnett HF (HDO)**. Built as a bachelor's project with
HDO-grade requirements for security, traceability and universal design.

---

## Technologies

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| UI | TailwindCSS + shadcn/ui + Radix |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table |
| Client state | Zustand + TanStack Query |
| ORM | Prisma |
| Database | PostgreSQL (Neon, Frankfurt/EU) |
| Auth | Microsoft Entra ID (OAuth 2.0 + PKCE via `@azure/msal-node`) |
| Sessions | `iron-session` (signed cookies) |
| PDF export | `pdfmake` |
| Unit / route tests | Vitest |
| E2E tests | Playwright + `@axe-core/playwright` |
| Container | Multi-stage Dockerfile + docker-compose |
| CI | GitHub Actions (lint + typecheck + tests + Next build) |

---

## Features

### Core features

1. **Standard plan** — weekly grid view, employees as rows and days as columns
2. **Month** — calendar view with aggregated information
3. **Agenda** — chronological list of shifts and notes
4. **Shift swaps** — request → accept → leader approval → execution
5. **Holiday and absence requests** — separate flows for vacation, sickness and other absence
6. **Notes** — week notes (per employee per ISO-week) and event notes with visibility scope
7. **Admin** — administration of teams, users, shift types, notification settings and audit log

### Advanced features

8. **Bulk shift changes** — mass editing of shifts across users and dates
9. **Notification system** — email and SMS (both stubbed in this MVP — they log to the console, but are ready to be wired up to real providers) with team- and user-level preferences
10. **Audit log (AuditLog)** — every security event and admin action is logged immutably

### Roles

- **`ADMIN`** — full system access, can administer teams, users and shift types
- **`LEADER`** — can create and edit shifts, approve swaps and absences for their own team
- **`EMPLOYEE`** — can view plans, request swaps and absences

Team membership is a separate table (`TeamMembership`); a user can belong to
several teams independently of their system role.

---

## Getting started locally

### Prerequisites

- Node.js 18+ and npm
- Git
- A PostgreSQL database (we use Neon serverless, but any Postgres 14+ works)
- A Microsoft Entra ID app registration (see the section further down)

### Step 1 — Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate` automatically.

### Step 2 — Configure environment variables

Copy the template and fill in real values:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (Prisma format) |
| `AZURE_TENANT_ID` | Directory (tenant) ID from Entra |
| `AZURE_CLIENT_ID` | Application (client) ID from the app registration |
| `AZURE_CLIENT_SECRET` | Client secret *value* (not the secret ID) |
| `AZURE_REDIRECT_URI` | `http://localhost:4000/auth/azure/callback` for local runs |
| `SESSION_COOKIE_SECRET` | 32+ random characters (generate with `openssl rand -base64 32`) |

A `SESSION_COOKIE_SECRET` shorter than 32 characters intentionally throws on
startup — see `lib/auth/session.ts`.

### Step 3 — Run migrations and seed

```bash
npx prisma migrate deploy   # apply all migrations
npm run db:seed             # insert demo data
```

The seed creates one team (`HDO – Turnus`), eight users (1 admin, 1 leader,
6 employees), a set of shift types and a few weeks of example shifts. It also
includes HDO's Entra test account (`bach-turnus@hdono.onmicrosoft.com`) as
`ADMIN` so the examiner can sign in through Microsoft directly.

### Step 4 — Start the dev server

```bash
npm run dev
```

Open [http://localhost:4000](http://localhost:4000). You will be redirected
to `/login` → "Logg inn med Microsoft" → the Microsoft sign-in page → back
to `/standard`.

---

## Microsoft Entra ID — app registration

The app registration in Entra needs:

- **Redirect URI (Web)**: `<https://your-host>/auth/azure/callback`
  (note: `/auth/...`, *not* `/api/auth/...`)
- **Implicit flow**: disabled (we use Authorization Code + PKCE)
- **Client secret**: create one and copy the value (not the secret ID) into
  `AZURE_CLIENT_SECRET`
- **API permissions**: only `openid`, `profile`, `email` (delegated)

Sign-in flow:

```
/login
  → /api/auth/azure/login   (PKCE verifier + state are generated)
  → Microsoft
  → /auth/azure/callback    (validates state, exchanges code, checks tid===tenant)
  → /standard
```

**Provisioning model:** unknown Microsoft accounts are rejected
(`LOGIN_UNKNOWN_USER`). An admin has to create the `User` row up front. The
first sign-in matches on email, and `azureOid` is persisted. Subsequent
sign-ins match on `azureOid`.

---

## Running with Docker

Containerised execution is the production deployment model (see
[`SECURITY.md`](SECURITY.md)) and gives a reproducible environment without a
local Node install.

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- `.env.local` with real values

### Build the image

```bash
docker build -t hdo-turnusplan .
```

The result is a ~200 MB Alpine-based image with only what is needed to run
the app (no source code, no dev dependencies, no tests). The multi-stage
build keeps TypeScript, ESLint and other build-time dependencies out of the
final image.

### Run the container

```bash
docker run --rm -p 4000:4000 --env-file .env.local hdo-turnusplan
```

The container runs `prisma migrate deploy` on startup and then starts
Next.js' standalone server. It runs as a non-privileged user
(`nextjs`, UID 1001).

### Local stack with docker-compose

For developers who want the whole stack (app + Postgres) in containers:

```bash
docker compose up --build
```

This builds the app image by stopping at the `builder` stage (full source +
hot reload), starts a Postgres 16 container with a fresh `hdo_dev` database,
and connects the app to it. `DATABASE_URL` is overridden by compose. Still
requires `AZURE_*` + `SESSION_COOKIE_SECRET` in `.env.local`.

First time around — seed the database from a separate shell:

```bash
docker compose exec app npm run db:seed
```

Stop with `docker compose down` (data is kept) or `docker compose down -v`
(also wipes the Postgres volume).

### VS Code dev container

`.devcontainer/devcontainer.json` is included. With the "Dev Containers"
extension: open the repo → `Reopen in Container`. VS Code starts the compose
stack and attaches the editor to the app container with extensions
pre-installed (ESLint, Prettier, Prisma, Tailwind, Playwright).

---

## Testing

| Command | What it runs |
|---|---|
| `npm run lint` | ESLint (Next config) |
| `npm test` | Vitest unit + route tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with coverage report |
| `npm run test:e2e` | Playwright E2E (includes axe-core a11y) |
| `npm run test:e2e:ui` | Playwright in UI mode |

Test status at the last verification:

- **Vitest**: 340 / 340 passing (unit + route tests for API handlers)
- **Playwright**: 18 / 18 passing
- **axe-core**: 0 WCAG 2.1 AA violations on the 7 main pages — no rules
  disabled. See `tests/e2e/accessibility.spec.ts`.

CI runs lint + typecheck + Vitest + `next build` on every push and PR to
`main`. See `.github/workflows/ci.yml`.

---

## Project structure

```
bachelor_HDO/
├── app/
│   ├── (app)/                # Authenticated routes under app layout
│   │   ├── standard/         # Standard plan (week grid)
│   │   ├── month/            # Month view
│   │   ├── agenda/           # Agenda list
│   │   ├── swap/             # Shift swaps
│   │   ├── holiday-requests/ # Holiday / absence requests
│   │   ├── settings/         # User settings
│   │   └── admin/            # Admin (audit, users, teams, shift types, holidays)
│   ├── api/                  # API route handlers (see next section)
│   ├── auth/azure/callback/  # OAuth callback from Microsoft (outside /api/)
│   └── login/                # Login page
├── components/
│   ├── ui/                   # shadcn/ui primitives
│   ├── layout/               # Navigation, notification panel
│   ├── auth/                 # Profile and user menu
│   ├── brand/                # HDO brand elements
│   ├── schedule/             # Schedule components
│   ├── Providers/            # React providers (QueryClient and friends)
│   └── BulkShiftModal.tsx
├── lib/
│   ├── auth/                 # withAuth, session, Azure MSAL, getCurrentUserId
│   ├── admin/                # AuditLog + validation schemas
│   ├── domain/               # Domain calculations (hours, pay etc.)
│   ├── services/             # Domain services (swap, holiday, notification)
│   ├── notifications/        # Multi-channel delivery (email stub + sms stub)
│   ├── security/             # Rate limiting, cookie config
│   ├── shifts/               # Shift operations (bulk, validation)
│   ├── validation/           # Zod schemas (date, ID, payloads)
│   ├── export/               # PDF export
│   ├── i18n.ts               # Norwegian labels
│   ├── date-utils.ts         # Date / time helpers
│   ├── prisma.ts             # Shared Prisma client
│   └── utils.ts              # Tailwind class merge
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── migrations/           # Migration history
│   └── seed.ts               # Seed script
├── tests/
│   ├── lib/                  # Unit tests
│   ├── api/                  # Route tests
│   └── e2e/                  # Playwright + axe-core
├── Dockerfile                # Multi-stage production build
├── docker-compose.yml        # Local stack (app + Postgres)
├── .devcontainer/            # VS Code dev container
└── .github/workflows/ci.yml  # GitHub Actions CI
```

---

## API routes

Every `/api/*` route passes through three authorisation layers (edge
middleware → `withAuth` wrapper → `assertTeamMember` per resource). See
[`SECURITY.md`](SECURITY.md) for the details.

### Auth

- `GET /api/auth/azure/login` — start the OAuth flow (PKCE + state)
- `GET /auth/azure/callback` — Entra callback (lives outside `/api/`)
- `GET /api/auth/me` — fetch the current user
- `POST /api/auth/logout`

### Shifts

- `GET|POST /api/shifts`
- `PUT|DELETE /api/shifts/[id]`
- `POST /api/shifts/bulk`
- `GET|POST /api/shift-types`
- `PUT|DELETE /api/shift-types/[id]`

### Swaps

- `GET|POST /api/swap-requests`
- `PATCH|DELETE /api/swap-requests/[id]`
- `POST /api/swap-requests/[id]/{accept,approve,decline,execute,reject,revoke}`

### Notes, week notes and absence

- `GET|POST /api/notes`
- `POST /api/notes/[id]/approve`
- `GET|PUT /api/week-notes` — PUT is an upsert (an empty body deletes)
- `GET|POST /api/holiday-requests`
- `GET|PATCH|PUT|DELETE /api/holiday-requests/[id]`
- `POST /api/holiday-requests/[id]/revoke`

### Users and teams

- `GET /api/users` — read only (creation goes through `/api/admin/users`)
- `GET|PUT /api/users/[id]` — PUT updates the role (admin only)
- `GET|PUT /api/users/[id]/notification-preferences`
- `GET|POST /api/teams`
- `DELETE /api/teams/[id]`

### Notifications and settings

- `GET /api/notifications`
- `POST /api/notifications/[id]/read`
- `GET|PUT /api/notification-settings`

### Admin

- `GET /api/admin/audit` — audit log
- `GET|POST /api/admin/users`
- `PATCH /api/admin/users/[id]`
- `POST /api/admin/teams/[teamId]/members`
- `PATCH|DELETE /api/admin/teams/[teamId]/members/[membershipId]`

---

## Database

The system uses **PostgreSQL** hosted on **Neon** (Frankfurt / EU region,
serverless). The connection is configured via `DATABASE_URL` and shared
through a singleton Prisma client (`lib/prisma.ts`).

### Main models

| Model | Description |
|---|---|
| `Team` | Organisation team |
| `User` | Users with a system role (`ADMIN`/`LEADER`/`EMPLOYEE`) and `azureOid` |
| `TeamMembership` | Many-to-many between user and team, with a per-team role |
| `ShiftType` | Shift types with colours and default times |
| `Shift` | Scheduled shifts (date stored as a string for timezone stability) |
| `SwapRequest` | Shift swap requests |
| `Note` | Notes (general, absence, sickness) |
| `WeekNote` | Week notes (per employee per ISO-week) |
| `HolidayRequest` | Holiday and absence requests |
| `Notification` | Per-user notification inbox |
| `NotificationSettings` | Per-team notification config |
| `NotificationDeliveryLog` | Delivery history for email / SMS |
| `UserNotificationPreference` | Per-user channel choice |
| `AuditLog` | Immutable log for security and admin events |

See `prisma/schema.prisma` for the full schema and comments on the
non-trivial fields.

---

## Documentation

- **[`README.md`](README.md)** — this file
- **[`SECURITY.md`](SECURITY.md)** — security model, GDPR / privacy, known gaps
- **TypeDoc** — generate API documentation with `npm run docs` (output in
  `docs/`, gitignored)

---

## Context

Built as a bachelor's project for **Helsetjenestens driftsorganisasjon for
nødnett HF (HDO)**. HDO operates critical healthcare infrastructure, so the
implementation is done to HDO-grade vendor standards for security,
traceability (AuditLog), universal design (WCAG 2.1 AA / Forskrift om
universell utforming) and a Norwegian user interface.
