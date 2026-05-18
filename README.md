# HDO Turnusplan MVP

[![CI](https://github.com/ServanKorkmaz/bachelor_HDO/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ServanKorkmaz/bachelor_HDO/actions/workflows/ci.yml)

En moderne web-basert vaktplanleggingssystem (turnusplan) for Helsetjenestens driftsorganisasjon for nødnett HF (HDO). 

## Teknologier

- **Next.js 14+** med App Router
- **TypeScript**
- **TailwindCSS** for styling
- **shadcn/ui** komponenter
- **React Hook Form + Zod** for skjemaer og validering
- **TanStack Table** for tabeller
- **date-fns** for dato-håndtering
- **Zustand** for klient-tilstand
- **Prisma + SQLite** for database (kan enkelt byttes til Postgres)

## Funksjoner

### Kjernefunksjoner

1. **Standard plan** - Ukesvis grid-visning med ansatte som rader og dager som kolonner
2. **Måned** - Kalender-visning med aggregert informasjon
3. **Agenda** - Liste over kommende vakter og notater
4. **Vaktbytter** - Ansatte kan be om vaktbytter, ledere kan godkjenne/utføre
5. **Admin** - Administrasjon av team, brukere, vakttyper og innstillinger

### Avanserte funksjoner

6. **Bulk vaktendringer** - Masseredigering av vakter for flere brukere og datoer
7. **Varslingssystem** - E-post og SMS-varsler med brukerpreferanser
8. **Revisjonslogg** - Sporbarhet av endringer i brukere, tilgang og vaktbytter

### Roller

- **Admin**: Kan administrere team, brukere, vakttyper
- **Leader**: Kan opprette/redigere vakter, utføre vaktbytter, godkjenne fravær/sykdom
- **Employee**: Kan se alle planer, be om fravær/sykdom, be om vaktbytter

### Notater og fravær

- Ansatte kan opprette notater for fravær eller sykdom
- Disse markeres som "pending" og må godkjennes av leder
- Leder kan godkjenne eller avvise forespørsler

### Varslingssystem

Systemet støtter varsler via e-post og SMS (SMS er placeholder):

- **Team-innstillinger**: Aktiver/deaktiver e-postvarsler per team
- **Brukerpreferanser**: Individuelle preferanser for hvilke varsler brukeren vil motta
- **Varseltyper**: Vaktendringer, vaktbytter, notater (fravær/sykdom)
- **Varselpanel**: Viser uleste varsler i navigasjonsbaren med automatisk polling

## Installasjon og oppsett

### Forutsetninger

- Node.js 18+ og npm
- Git

### Steg 1: Installer avhengigheter

```bash
npm install
```

### Steg 2: Sett opp database

```bash
# Opprett database og kjør migrasjoner
npx prisma db push

# Seed database med demo-data
npm run db:seed
```

### Steg 3: Start utviklingsserveren

```bash
npm run dev
```

Åpne [http://localhost:4000](http://localhost:4000) i nettleseren.

## Kjøre med Docker

Applikasjonen kan også bygges og kjøres som en Docker-container. Dette er
deployment-modellen for produksjon (se `SECURITY.md`) og gir et reproduserbart
miljø uten lokal Node-installasjon.

### Forutsetninger

- Docker Desktop (Windows/Mac) eller Docker Engine (Linux)
- En `.env.local` med ekte verdier (se [`.env.example`](./.env.example))

### Bygg image

```bash
docker build -t hdo-turnusplan .
```

Første gang tar ~2 minutter (npm install + `next build`). Påfølgende bygg er
sekunder takket være lag-caching — kun lag som faktisk er endret bygges på nytt.

Resultatet er et ~200 MB Alpine-basert image med kun det som trengs for å
kjøre appen (ingen kildekode, ingen dev-avhengigheter, ingen tester).

### Kjør container

```bash
docker run --rm -p 4000:4000 --env-file .env.local hdo-turnusplan
```

`-p 4000:4000` mapper containerens port til vertens port 4000. `--env-file`
laster env-variabler ved oppstart — secrets bakes aldri inn i imaget.
`--rm` fjerner containeren etter stopp. Åpne deretter
[http://localhost:4000](http://localhost:4000).

Containeren kjører `prisma migrate deploy` ved oppstart for å sikre at
databasen er oppdatert, og starter deretter Next.js sin standalone-server.

### Påkrevde env-variabler

Containeren krever de samme variablene som lokal kjøring. Se
[`.env.example`](./.env.example) for navn og beskrivelser:

- `DATABASE_URL`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_REDIRECT_URI`
- `SESSION_COOKIE_SECRET`

Manglende eller for kort `SESSION_COOKIE_SECRET` (under 32 tegn) gir
oppstartsfeil — det er en bevisst fail-fast-sjekk i `lib/auth/session.ts`.

### Sikkerhetsnotater

- Containeren kjører som en **ikke-privilegert bruker** (`nextjs`, UID 1001).
- `.dockerignore` ekskluderer `.env*.local`, `.git`, tester og dev-artefakter
  fra build-konteksten — secrets havner aldri inn i imaget.
- Multi-stage build betyr at byggetidens avhengigheter (TypeScript,
  ESLint, kildekode) ikke finnes i det endelige imaget — kun runtime-koden.

### Lokal utvikling med docker-compose

For utviklere som vil ha hele stacken (app + Postgres) i containere — uten
å installere Node eller en lokal database:

```bash
docker compose up --build
```

Dette gjør tre ting:

1. Bygger app-imaget ved å stoppe ved `builder`-stadiet i `Dockerfile`
   (har full kildekode + dev-avhengigheter, kjører `next dev` med hot
   reload — *ikke* den slanke produksjons-runneren)
2. Starter en Postgres 16-container med fersk database `hdo_dev`
3. Kobler appen til Postgres-containeren via `DATABASE_URL`-overstyring
   (Neon-URL-en i `.env.local` shadowes for compose-bruk)

Krever en `.env.local` med ekte `AZURE_*` + `SESSION_COOKIE_SECRET`.
`DATABASE_URL` overstyres av compose, så det du har der spiller ingen rolle.

Første gang: seed databasen i et annet shell:

```bash
docker compose exec app npm run db:seed
```

Åpne deretter [http://localhost:4000](http://localhost:4000). Endringer i
kildekoden hot-reloader inn i containeren via volume-mount.

Stopp alt med `docker compose down` (data beholdes), eller
`docker compose down -v` (sletter også Postgres-volumet).

### VS Code dev container

En `.devcontainer/devcontainer.json` er inkludert. Med "Dev Containers"-
utvidelsen i VS Code: åpne repoet → `Reopen in Container`. VS Code starter
compose-stacken og kobler editoren til app-containeren med ESLint,
Prettier, Prisma, Tailwind og Playwright-utvidelsene forhåndsinstallert.
Du redigerer kode på din vert; den kjøres i containeren. Null lokalt
Node-oppsett kreves.

## Testing

This project uses **Vitest** for fast unit and API route tests.

### Run tests

```bash
npm test
```

### Watch mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:coverage
```

### Current test scope

- `tests/lib/*`: unit tests for utility and validation modules
- `tests/api/shifts-bulk.route.test.ts`: API tests for bulk shift operations

## Demo-guide

### Rollebytte

Systemet bruker mock-autentisering for demo-formål. I navigasjonsbaren (øverst til høyre) finner du en dropdown for å bytte mellom brukere med forskjellige roller:

1. **Admin User** - Full tilgang til alt
2. **Leader User** - Kan administrere vakter og godkjenne forespørsler
3. **Ansatte** - Kan se planer og be om fravær/vaktbytter

### Demo-data

Seed-scriptet oppretter:
- 1 team: "HDO - Turnus"
- 8 brukere: 1 admin, 1 leader, 6 ansatte
- Flere vakttyper: Fri, Dag, N1, N2, K1, D2
- 4 uker med eksempelvakter

### Teste funksjoner

1. **Se vaktplan**: Gå til "Standard plan" og naviger mellom uker
2. **Opprett vakt**: Klikk på en tom celle og opprett en vakt (kun Leader/Admin)
3. **Be om vaktbytte**: Gå til "Vaktbytter" som ansatt og opprett en forespørsel
4. **Godkjenn vaktbytte**: Bytt til Leader-rolle og godkjenn/utfør vaktbytter
5. **Administrer**: Gå til "Admin" for å administrere team, brukere og vakttyper
6. **Se revisjonslogg**: Gå til "Admin" og åpne "Revisjonslogg"
7. **Varsler**: Åpne varselpanelet og marker varsler som lest

## Prosjektstruktur

```
bachelor_HDO/
├── app/
│   ├── (app)/              # App-ruter med layout
│   │   ├── standard/       # Standard plan visning
│   │   ├── month/          # Månedsvisning
│   │   ├── agenda/         # Agenda-liste
│   │   ├── swap/           # Vaktbytter
│   │   └── admin/          # Admin-seksjoner
│   └── api/                # API-ruter
├── components/
│   ├── ui/                 # shadcn/ui komponenter
│   ├── layout/             # Navigasjon og varsler
│   ├── auth/               # Rollebytter og auth UI
│   └── schedule/           # Vaktplan-komponenter
├── lib/
│   ├── prisma.ts           # Prisma-klient
│   ├── auth/               # Autentisering og autorisasjon
│   │   ├── withAuth.ts     # Wrapper-pattern + assertTeamMember
│   │   └── getCurrentUserId.ts
│   ├── admin/              # Admin-verktøy
│   │   ├── audit.ts        # Revisjonslogg
│   │   └── schemas.ts      # Valideringsskjemaer
│   ├── date-utils.ts       # Dato-hjelpefunksjoner
│   └── notifications/      # Varslingssystem
│       ├── deliver.ts      # Multi-kanal levering
│       ├── sendEmail.ts    # E-post-sender
│       └── sendSms.ts      # SMS-sender (stub)
├── scripts/
│   └── generate-overview-pdf.js  # PDF-generering
└── prisma/
    ├── schema.prisma       # Database-skjema
    └── seed.ts             # Seed-script
```

## API Endpoints

### Bulk-operasjoner

- `POST /api/shifts/bulk` - Bulk create/update/delete shifts

### Admin

- `GET /api/admin/audit` - Hent revisjonslogg
- `GET|POST /api/admin/users` - Administrer brukere
- `PATCH /api/admin/users/[id]` - Oppdater bruker
- `POST /api/admin/teams/[teamId]/members` - Legg til teammedlemmer
- `PATCH|DELETE /api/admin/teams/[teamId]/members/[membershipId]` - Oppdater/fjern medlem

### Varsler og innstillinger

- `GET /api/notifications` - Hent varsler
- `POST /api/notifications/[id]/read` - Marker varsel som lest
- `GET|PUT /api/notification-settings` - Team-varslingsinnstillinger
- `GET|PUT /api/users/[id]/notification-preferences` - Brukerpreferanser

## Database

Systemet bruker **PostgreSQL** hostet på **Neon** (Frankfurt / EU-region, serverless). Tilkoblingen konfigureres via `DATABASE_URL` i `.env`.

### Viktige modeller

- **Team**: Organisasjonsteam
- **User**: Brukere med roller (ADMIN, LEADER, EMPLOYEE)
- **ShiftType**: Vakttyper med farger og standardtider
- **Shift**: Planlagte vakter
- **Note**: Notater (generelle, fravær, sykdom) med status
- **SwapRequest**: Vaktbytteforespørsler med status
- **Notification**: Varsler for brukere
- **AuditLog**: Revisjonslogg for endringer
- **NotificationSettings**: Varslingsinnstillinger per team
- **UserNotificationPreference**: Brukerpreferanser for varsler

## Videre utvikling

### Planlagte forbedringer

1. **Azure AD-integrasjon**: Erstatt mock-auth med ekte Azure AD (Entra ID)
2. **Postgres-migrering**: Bytt fra SQLite til Postgres for produksjon
3. **Forbedrede e-postvarsler**: Bedre maler og leveringslogg
4. **SMS-integrasjon**: Koble til eksisterende SMS-endpoint
5. **Avansert planlegging**: Automatisk vaktplanlegging, konfliktdeteksjon
6. **Mobilapp**: React Native-app for mobil

## Lisens

Dette prosjektet er bygget som en del av en bacheloroppgave.

## Kontakt

For spørsmål eller tilbakemeldinger, kontakt prosjekteier.

