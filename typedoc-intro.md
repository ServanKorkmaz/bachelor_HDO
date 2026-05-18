A modern shift scheduling system (turnusplan) built for **Helsetjenestens driftsorganisasjon for nødnett HF (HDO)**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Forms | React Hook Form + Zod |
| State | Zustand |
| ORM | Prisma |
| Database | PostgreSQL (Neon serverless) |
| Testing | Vitest |

---

## Database

The application uses **PostgreSQL** hosted on **[Neon](https://neon.tech)** (Frankfurt / EU region, serverless).

Connection is configured via the `DATABASE_URL` environment variable and accessed through a shared Prisma client (`lib/prisma.ts`).

### Core models

| Model | Description |
|---|---|
| `Team` | Organisation team |
| `User` | Users with roles: `ADMIN`, `LEADER`, `EMPLOYEE` |
| `ShiftType` | Shift templates with colours and default times |
| `Shift` | Scheduled shifts linked to a user and team |
| `Note` | Absence / sickness notes with approval status |
| `SwapRequest` | Shift swap requests between employees |
| `Notification` | Per-user notification inbox |
| `AuditLog` | Immutable change log for admin actions |
| `NotificationSettings` | Per-team notification configuration |
| `UserNotificationPreference` | Per-user channel preferences (email / SMS) |

---

## Architecture

- **`app/`**
  - `(app)/` — Next.js route groups (UI pages)
  - `api/` — API route handlers
- **`components/`** — React components
- **`lib/`**
  - `auth/` — Microsoft Entra (Azure AD) OAuth + session helpers
  - `admin/` — Audit logging and validation schemas
  - `notifications/` — Multi-channel notification delivery
  - `date-utils.ts` — Date/time utility functions
  - `i18n.ts` — Norwegian label translation helpers
  - `utils.ts` — Tailwind class merging utility
- **`prisma/`**
  - `schema.prisma` — Database schema
  - `seed.ts` — Demo seed data
- **`tests/`** — Vitest unit and route tests

---

## Running the project

```sh
npm install       # install dependencies
npm run dev       # start development server
npm test          # run all tests
npm run docs      # regenerate this documentation
```

---

## Roles

| Role | Permissions |
|---|---|
| `ADMIN` | Full access — manage teams, users, shift types |
| `LEADER` | Create/edit shifts, approve absence/swap requests |
| `EMPLOYEE` | View schedules, request absence, request shift swaps |
