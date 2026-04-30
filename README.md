# HDO Turnusplan MVP

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

Åpne [http://localhost:3000](http://localhost:3000) i nettleseren.

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
│   │   ├── requireAdmin.ts # Admin-sjekk
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

