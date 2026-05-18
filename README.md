# HDO Turnusplan

[![CI](https://github.com/ServanKorkmaz/bachelor_HDO/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ServanKorkmaz/bachelor_HDO/actions/workflows/ci.yml)

Webbasert vaktplanleggingssystem (turnusplan) for **Helsetjenestens
driftsorganisasjon for nødnett HF (HDO)**. Bygget som bacheloroppgave med
HDO-grade krav til sikkerhet, sporbarhet og universell utforming.

---

## Teknologier

| Lag | Valg |
|---|---|
| Rammeverk | Next.js 14 (App Router) |
| Språk | TypeScript (strict) |
| UI | TailwindCSS + shadcn/ui + Radix |
| Skjemaer | React Hook Form + Zod |
| Tabeller | TanStack Table |
| Klient-state | Zustand + TanStack Query |
| ORM | Prisma |
| Database | PostgreSQL (Neon, Frankfurt/EU) |
| Autentisering | Microsoft Entra ID (OAuth 2.0 + PKCE via `@azure/msal-node`) |
| Sesjoner | `iron-session` (signerte cookies) |
| PDF-eksport | `pdfmake` |
| Unit-/route-tester | Vitest |
| E2E-tester | Playwright + `@axe-core/playwright` |
| Container | Multi-stage Dockerfile + docker-compose |
| CI | GitHub Actions (lint + typecheck + tester + Next-bygg) |

---

## Funksjoner

### Kjernefunksjoner

1. **Standard plan** — ukesvis grid-visning, ansatte som rader og dager som kolonner
2. **Måned** — kalender-visning med aggregert informasjon
3. **Agenda** — kronologisk liste over vakter og notater
4. **Vaktbytter** — forespørsel → aksept → leder-godkjenning → utførelse
5. **Ferie- og fraværsforespørsler** — egne flyt for ferie, sykdom og annet fravær
6. **Notater** — ukenotater (per ansatt per ISO-uke) og hendelsesnotater med synlighetsvalg
7. **Admin** — administrasjon av team, brukere, vakttyper, varslingsinnstillinger og revisjonslogg

### Avanserte funksjoner

8. **Bulk vaktendringer** — masseredigering av vakter på tvers av brukere og datoer
9. **Varslingssystem** — e-post og SMS (SMS er stub) med team- og bruker-preferanser
10. **Revisjonslogg (AuditLog)** — alle sikkerhetshendelser og admin-handlinger logges udelelig

### Roller

- **`ADMIN`** — full systemtilgang, kan administrere team, brukere og vakttyper
- **`LEADER`** — kan opprette/redigere vakter, godkjenne vaktbytter og fravær for eget team
- **`EMPLOYEE`** — kan se planer, be om vaktbytter og fravær

Team-medlemskap er en separat tabell (`TeamMembership`); en bruker kan tilhøre
flere team uavhengig av systemrollen.

---

## Kom i gang lokalt

### Forutsetninger

- Node.js 18+ og npm
- Git
- En PostgreSQL-database (vi bruker Neon serverless, men hvilken som helst
  Postgres 14+ fungerer)
- En Microsoft Entra ID app-registrering (se egen seksjon under)

### Steg 1 — Installer avhengigheter

```bash
npm install
```

`postinstall` kjører `prisma generate` automatisk.

### Steg 2 — Konfigurer miljøvariabler

Kopier malen og fyll inn ekte verdier:

```bash
cp .env.example .env.local
```

Påkrevde variabler:

| Variabel | Beskrivelse |
|---|---|
| `DATABASE_URL` | Postgres-connection-string (Prisma-format) |
| `AZURE_TENANT_ID` | Directory (tenant) ID fra Entra |
| `AZURE_CLIENT_ID` | Application (client) ID fra app-registreringen |
| `AZURE_CLIENT_SECRET` | Client-secret-verdi (ikke secret-ID) |
| `AZURE_REDIRECT_URI` | `http://localhost:4000/auth/azure/callback` for lokal kjøring |
| `SESSION_COOKIE_SECRET` | 32+ tegn tilfeldig (generer med `openssl rand -base64 32`) |

`SESSION_COOKIE_SECRET` under 32 tegn gir bevisst oppstartsfeil — se
`lib/auth/session.ts`.

### Steg 3 — Kjør migrasjoner og seed

```bash
npx prisma migrate deploy   # kjør alle migrasjoner
npm run db:seed             # legg inn demodata
```

Seed oppretter ett team (`HDO – Turnus`), åtte brukere (1 admin, 1 leder, 6
ansatte), et sett vakttyper og noen ukers eksempelvakter. Den inkluderer også
HDOs Entra-testkonto (`bach-turnus@hdono.onmicrosoft.com`) som `ADMIN` slik at
sensor kan logge inn via Microsoft direkte.

### Steg 4 — Start utviklingsserveren

```bash
npm run dev
```

Åpne [http://localhost:4000](http://localhost:4000). Du sendes til `/login` →
"Logg inn med Microsoft" → Microsoft-pålogging → tilbake til `/standard`.

---

## Microsoft Entra ID — app-registrering

For en fullstendig gjennomgang av design og krav, se
[`specs/2026-05-17-azure-ad-auth-design.md`](specs/2026-05-17-azure-ad-auth-design.md).
Oppsummert trenger app-registreringen i Entra:

- **Redirect URI (Web)**: `<https://din-host>/auth/azure/callback`
  (merk: `/auth/...`, *ikke* `/api/auth/...`)
- **Implisitt flow**: deaktivert (vi bruker Authorization Code + PKCE)
- **Client secret**: opprett og kopier verdien (ikke secret-ID) til
  `AZURE_CLIENT_SECRET`
- **API-tillatelser**: kun `openid`, `profile`, `email` (delegated)

Påloggingsflyten:

```
/login
  → /api/auth/azure/login   (PKCE-verifier + state genereres)
  → Microsoft
  → /auth/azure/callback    (validerer state, exchanger code, sjekker tid===tenant)
  → /standard
```

**Provisjoneringsmodell:** ukjente Microsoft-kontoer avvises
(`LOGIN_UNKNOWN_USER`). Admin må opprette `User`-rad på forhånd. Første
pålogging matches på e-post, og `azureOid` persisteres. Påfølgende pålogginger
matches på `azureOid`.

---

## Kjøre med Docker

Containerisert kjøring er deployment-modellen for produksjon (se
[`SECURITY.md`](SECURITY.md)) og gir et reproduserbart miljø uten lokal
Node-installasjon.

### Forutsetninger

- Docker Desktop (Windows/Mac) eller Docker Engine (Linux)
- `.env.local` med ekte verdier

### Bygg image

```bash
docker build -t hdo-turnusplan .
```

Resultatet er et ~200 MB Alpine-basert image med kun det som trengs for å kjøre
appen (ingen kildekode, ingen dev-avhengigheter, ingen tester). Multi-stage
build sikrer at TypeScript, ESLint og build-tid-avhengigheter aldri havner i
det endelige imaget.

### Kjør container

```bash
docker run --rm -p 4000:4000 --env-file .env.local hdo-turnusplan
```

Containeren kjører `prisma migrate deploy` ved oppstart, og starter deretter
Next.js sin standalone-server. Den kjører som ikke-privilegert bruker
(`nextjs`, UID 1001).

### Lokal stack med docker-compose

For utviklere som vil ha hele stacken (app + Postgres) i containere:

```bash
docker compose up --build
```

Dette bygger app-imaget ved å stoppe på `builder`-stadiet (full kildekode +
hot reload), starter en Postgres 16-container med fersk database `hdo_dev`, og
kobler appen til den. `DATABASE_URL` overstyres av compose. Krever fortsatt
`AZURE_*` + `SESSION_COOKIE_SECRET` i `.env.local`.

Første gang — seed databasen i et annet shell:

```bash
docker compose exec app npm run db:seed
```

Stopp med `docker compose down` (data beholdes) eller `docker compose down -v`
(sletter også Postgres-volumet).

### VS Code dev container

`.devcontainer/devcontainer.json` er inkludert. Med "Dev Containers"-utvidelsen:
åpne repoet → `Reopen in Container`. VS Code starter compose-stacken og kobler
editoren til app-containeren med forhåndsinstallerte utvidelser (ESLint,
Prettier, Prisma, Tailwind, Playwright).

---

## Testing

| Kommando | Hva |
|---|---|
| `npm run lint` | ESLint (Next-konfig) |
| `npm test` | Vitest unit + route-tester |
| `npm run test:watch` | Vitest i watch-modus |
| `npm run test:coverage` | Vitest med dekningsrapport |
| `npm run test:e2e` | Playwright E2E (inkluderer axe-core a11y) |
| `npm run test:e2e:ui` | Playwright i UI-modus |

Testpyramide-status ved siste verifisering:

- **Vitest**: 315 / 315 passerer (unit + route-tester for API-handlere)
- **Playwright**: 17 / 18 passerer (én kjent flaky `create-shift`)
- **axe-core**: 0 WCAG 2.1 AA-brudd på alle 7 hovedsider — ingen regler er
  deaktivert. Se `tests/e2e/accessibility.spec.ts`.

CI kjører lint + typecheck + Vitest + `next build` på hver push og PR til
`main`. Se `.github/workflows/ci.yml`.

---

## Prosjektstruktur

```
bachelor_HDO/
├── app/
│   ├── (app)/                # Autentiserte ruter under app-layout
│   │   ├── standard/         # Standard plan (uke-grid)
│   │   ├── month/            # Månedsvisning
│   │   ├── agenda/           # Agenda-liste
│   │   ├── swap/             # Vaktbytter
│   │   ├── holiday-requests/ # Ferie-/fraværsforespørsler
│   │   ├── settings/         # Brukerinnstillinger
│   │   └── admin/            # Admin (audit, brukere, team, vakttyper, ferie)
│   ├── api/                  # API-route-handlere (se egen seksjon)
│   ├── auth/azure/callback/  # OAuth-callback fra Microsoft (utenfor /api/)
│   └── login/                # Innloggingsside
├── components/
│   ├── ui/                   # shadcn/ui-primitiver
│   ├── layout/               # Navigasjon, varselpanel
│   ├── auth/                 # Profil og brukerlenke (UserMenu)
│   ├── brand/                # HDO-merkevareelementer
│   ├── schedule/             # Vaktplan-komponenter
│   ├── Providers/            # React-providers (QueryClient m.fl.)
│   └── BulkShiftModal.tsx
├── lib/
│   ├── auth/                 # withAuth, session, Azure MSAL, getCurrentUserId
│   ├── admin/                # AuditLog + valideringsskjemaer
│   ├── domain/               # Domeneberegninger (timer, lønn etc.)
│   ├── services/             # Domenetjenester (swap, holiday, notification)
│   ├── notifications/        # Multi-kanal levering (email + sms-stub)
│   ├── security/             # Rate limiting, cookie-config
│   ├── shifts/               # Vaktoperasjoner (bulk, validering)
│   ├── validation/           # Zod-skjemaer (dato, ID, payloads)
│   ├── export/               # PDF-eksport
│   ├── i18n.ts               # Norske etiketter
│   ├── date-utils.ts         # Dato-/tidshjelpere
│   ├── prisma.ts             # Delt Prisma-klient
│   └── utils.ts              # Tailwind class-merge
├── prisma/
│   ├── schema.prisma         # Database-skjema
│   ├── migrations/           # Migrasjonshistorikk
│   └── seed.ts               # Seed-script
├── tests/
│   ├── lib/                  # Unit-tester
│   ├── api/                  # Route-tester
│   └── e2e/                  # Playwright + axe-core
├── specs/                    # Designspecs (historikk, frosset)
├── plans/                    # Implementeringsplaner (historikk, frosset)
├── Dockerfile                # Multi-stage produksjonsbygg
├── docker-compose.yml        # Lokal stack (app + Postgres)
├── .devcontainer/            # VS Code dev container
└── .github/workflows/ci.yml  # GitHub Actions CI
```

---

## API-ruter

Alle `/api/*`-ruter går gjennom tre lag autorisasjon (edge middleware →
`withAuth`-wrapper → `assertTeamMember` per ressurs). Se [`SECURITY.md`](SECURITY.md)
for detaljer.

### Auth

- `GET /api/auth/azure/login` — start OAuth-flow (PKCE + state)
- `GET /auth/azure/callback` — Entra-callback (utenfor `/api/`)
- `GET /api/auth/me` — hent gjeldende bruker
- `POST /api/auth/logout`

### Vakter

- `GET|POST /api/shifts`
- `PUT|DELETE /api/shifts/[id]`
- `POST /api/shifts/bulk`
- `GET|POST /api/shift-types`
- `PUT|DELETE /api/shift-types/[id]`

### Vaktbytter

- `GET|POST /api/swap-requests`
- `PATCH|DELETE /api/swap-requests/[id]`
- `POST /api/swap-requests/[id]/{accept,approve,decline,execute,reject,revoke}`

### Notater, ukenotater og fravær

- `GET|POST /api/notes`
- `POST /api/notes/[id]/approve`
- `GET|PUT /api/week-notes` — PUT er upsert (tom kropp sletter)
- `GET|POST /api/holiday-requests`
- `GET|PATCH|PUT|DELETE /api/holiday-requests/[id]`
- `POST /api/holiday-requests/[id]/revoke`

### Brukere og team

- `GET /api/users` — kun lesning (oppretting via `/api/admin/users`)
- `GET|PUT /api/users/[id]` — PUT oppdaterer rolle (admin)
- `GET|PUT /api/users/[id]/notification-preferences`
- `GET|POST /api/teams`
- `DELETE /api/teams/[id]`

### Varsler og innstillinger

- `GET /api/notifications`
- `POST /api/notifications/[id]/read`
- `GET|PUT /api/notification-settings`

### Admin

- `GET /api/admin/audit` — revisjonslogg
- `GET|POST /api/admin/users`
- `PATCH /api/admin/users/[id]`
- `POST /api/admin/teams/[teamId]/members`
- `PATCH|DELETE /api/admin/teams/[teamId]/members/[membershipId]`

---

## Database

Systemet bruker **PostgreSQL** hostet på **Neon** (Frankfurt / EU-region,
serverless). Tilkobling konfigureres via `DATABASE_URL` og deles via en
singleton Prisma-klient (`lib/prisma.ts`).

### Hovedmodeller

| Modell | Beskrivelse |
|---|---|
| `Team` | Organisasjonsteam |
| `User` | Brukere med systemrolle (`ADMIN`/`LEADER`/`EMPLOYEE`) og `azureOid` |
| `TeamMembership` | Mange-til-mange mellom bruker og team, med per-team-rolle |
| `ShiftType` | Vakttyper med farger og standardtider |
| `Shift` | Planlagte vakter (dato lagret som streng for tidssone-stabilitet) |
| `SwapRequest` | Vaktbytteforespørsler |
| `Note` | Notater (generelle, fravær, sykdom) |
| `WeekNote` | Ukenotater (per ansatt per ISO-uke) |
| `HolidayRequest` | Ferie- og fraværsforespørsler |
| `Notification` | Per-bruker varselinnboks |
| `NotificationSettings` | Per-team varselskonfigurasjon |
| `NotificationDeliveryLog` | Leveringshistorikk for e-post/SMS |
| `UserNotificationPreference` | Per-bruker kanalvalg |
| `AuditLog` | Udelelig logg for sikkerhets- og admin-hendelser |

Se `prisma/schema.prisma` for fullt skjema og kommentarer på ikke-trivielle
felter.

---

## Dokumentasjon

- **[`README.md`](README.md)** — denne filen
- **[`SECURITY.md`](SECURITY.md)** — sikkerhetsmodell, GDPR/personvern, kjente gap
- **[`specs/`](specs/)** — designspecs (frosset historikk)
- **[`plans/`](plans/)** — implementeringsplaner (frosset historikk)
- **TypeDoc** — generer API-dokumentasjon med `npm run docs` (output i
  `docs/`, gitignored)

---

## Kontekst

Bygget som bacheloroppgave for **Helsetjenestens driftsorganisasjon for
nødnett HF (HDO)**. HDO drifter kritisk helseinfrastruktur, så all
implementasjon er gjort etter HDO-grade vendor-standarder for sikkerhet,
sporbarhet (AuditLog), universell utforming (WCAG 2.1 AA / Forskrift om
universell utforming) og norsk brukergrensesnitt.
