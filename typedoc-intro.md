Shift scheduling system (turnusplan) built for **Helsetjenestens driftsorganisasjon for nødnett HF (HDO)**.

This page is the auto-generated API reference. For setup, the full feature list and the security model, see the project [`README.md`](https://github.com/ServanKorkmaz/bachelor_HDO/blob/main/README.md) and [`SECURITY.md`](https://github.com/ServanKorkmaz/bachelor_HDO/blob/main/SECURITY.md) in the repo.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| UI | Tailwind CSS + shadcn/ui |
| Forms | React Hook Form + Zod |
| Client state | Zustand + TanStack Query |
| ORM | Prisma |
| Database | PostgreSQL (Neon, Frankfurt / EU) |
| Auth | Microsoft Entra ID (OAuth 2.0 + PKCE via `@azure/msal-node`) + `iron-session` |
| Tests | Vitest (unit + route) + Playwright (E2E + axe-core) |

---

## Database

PostgreSQL hosted on **[Neon](https://neon.tech)** (Frankfurt / EU region, serverless). Connection is configured via `DATABASE_URL` and shared through a singleton Prisma client (`lib/prisma.ts`).

### Models

| Model | Description |
|---|---|
| `Team` | Organisation team |
| `User` | Users with a system role (`ADMIN` / `LEADER` / `EMPLOYEE`) and `azureOid` |
| `TeamMembership` | Many-to-many between user and team, with a per-team role |
| `ShiftType` | Shift types with colours and default times |
| `Shift` | Scheduled shifts (date stored as a string for timezone stability) |
| `SwapRequest` | Shift swap requests |
| `Note` | Notes (general, absence, sickness) with visibility scope |
| `WeekNote` | Week notes (per employee per ISO-week) |
| `HolidayRequest` | Holiday and absence requests |
| `Notification` | Per-user notification inbox |
| `NotificationSettings` | Per-team notification config |
| `NotificationDeliveryLog` | Delivery history for email / SMS |
| `UserNotificationPreference` | Per-user channel choice |
| `AuditLog` | Immutable log for security and admin events |

See `prisma/schema.prisma` for the full schema.

---

## Project layout

- **`app/`**
  - `(app)/` — authenticated routes under the app layout (standard, month, agenda, swap, holiday, settings, admin)
  - `api/` — API route handlers
  - `auth/azure/callback/` — OAuth callback from Microsoft (outside `/api/`)
- **`components/`** — React components (`ui/`, `layout/`, `auth/`, `schedule/`, `brand/`, `Providers/`)
- **`lib/`**
  - `auth/` — `withAuth`, session, MSAL helpers, `getCurrentUserId`
  - `admin/` — audit log + validation schemas
  - `services/` — domain services (swap, holiday, notification)
  - `domain/` — domain calculations (hours, AML compliance)
  - `notifications/` — multi-channel delivery (email + SMS stubs)
  - `security/` — rate limiting, cookie config
  - `shifts/` — shift operations
  - `validation/` — Zod schemas
  - `export/` — PDF and CSV export
  - `i18n.ts` — Norwegian labels
  - `prisma.ts` — shared Prisma client
- **`prisma/`** — schema, migrations, seed
- **`tests/`** — `lib/` (unit), `api/` (route), `e2e/` (Playwright + axe-core)

---

## Running the project

```sh
npm install       # install dependencies
npm run dev       # start the dev server
npm test          # run vitest
npm run test:e2e  # run playwright
npm run docs      # regenerate this documentation
```

---

## Roles

| Role | Permissions |
|---|---|
| `ADMIN` | Full access — manage teams, users and shift types |
| `LEADER` | Create / edit shifts, approve absence and swap requests |
| `EMPLOYEE` | View schedules, request absence and shift swaps |
