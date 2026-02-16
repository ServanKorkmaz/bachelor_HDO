# HDO Turnusplan MVP

<!-- AUTO-GENERATED-ARCHITECTURE-START -->
## Application Architecture

```mermaid
flowchart TD
  subgraph "UI (App Router)"
    N1["app/(app)/admin/audit/page.tsx"]
    N2["app/(app)/admin/settings/page.tsx"]
    N3["app/(app)/admin/shift-types/page.tsx"]
    N4["app/(app)/admin/teams/page.tsx"]
    N5["app/(app)/admin/users/page.tsx"]
    N6["app/(app)/agenda/page.tsx"]
    N7["app/(app)/month/page.tsx"]
    N8["app/(app)/standard/page.tsx"]
    N9["app/(app)/swap/page.tsx"]
    N10["components/auth/RoleSwitcher.tsx"]
    N11["components/BulkShiftModal.tsx"]
    N12["components/layout/NotificationsPanel.tsx"]
    N13["components/schedule/ShiftModal.tsx"]
    N14["components/ShiftModal.tsx"]
  end
  subgraph "API Routes"
    N15["app/api/admin/audit/route.ts"]
    N16["app/api/admin/users/route.ts"]
    N17["app/api/teams/route.ts"]
    N18["app/api/notification-settings/route.ts"]
    N19["app/api/users/[id]/notification-preferences/route.ts"]
    N20["app/api/shift-types/[id]/route.ts"]
    N21["app/api/shift-types/route.ts"]
    N22["app/api/teams/[id]/route.ts"]
    N23["app/api/admin/teams/[teamId]/members/route.ts"]
    N24["app/api/admin/teams/[teamId]/members/[membershipId]/route.ts"]
    N25["app/api/admin/users/[id]/route.ts"]
    N26["app/api/shifts/route.ts"]
    N27["app/api/notes/route.ts"]
    N28["app/api/users/route.ts"]
    N29["app/api/swap-requests/route.ts"]
    N30["app/api/swap-requests/[id]/approve/route.ts"]
    N31["app/api/swap-requests/[id]/reject/route.ts"]
    N32["app/api/swap-requests/[id]/execute/route.ts"]
    N33["app/api/shifts/bulk/route.ts"]
    N34["app/api/notifications/route.ts"]
    N35["app/api/notifications/[id]/read/route.ts"]
    N36["app/api/notes/[id]/approve/route.ts"]
    N37["app/api/shifts/[id]/route.ts"]
    N38["app/api/users/[id]/route.ts"]
  end
  subgraph "Data Access"
    N39["lib/prisma.ts"]
  end
  N1 --> N15
  N1 --> N16
  N1 --> N17
  N2 --> N18
  N2 --> N19
  N2 --> N17
  N3 --> N20
  N3 --> N21
  N4 --> N22
  N4 --> N17
  N5 --> N16
  N5 --> N23
  N5 --> N24
  N5 --> N25
  N5 --> N17
  N6 --> N26
  N6 --> N27
  N6 --> N17
  N6 --> N28
  N7 --> N26
  N7 --> N17
  N8 --> N28
  N8 --> N26
  N8 --> N17
  N9 --> N28
  N9 --> N29
  N9 --> N26
  N9 --> N30
  N9 --> N31
  N9 --> N32
  N9 --> N17
  N10 --> N28
  N11 --> N26
  N11 --> N21
  N11 --> N28
  N11 --> N33
  N12 --> N34
  N12 --> N35
  N13 --> N33
  N13 --> N21
  N13 --> N28
  N14 --> N33
  N14 --> N21
  N14 --> N28
  N15 --> N39
  N23 --> N39
  N24 --> N39
  N16 --> N39
  N25 --> N39
  N27 --> N39
  N36 --> N39
  N18 --> N39
  N34 --> N39
  N35 --> N39
  N21 --> N39
  N20 --> N39
  N33 --> N39
  N26 --> N39
  N37 --> N39
  N29 --> N39
  N30 --> N39
  N32 --> N39
  N31 --> N39
  N17 --> N39
  N22 --> N39
  N28 --> N39
  N19 --> N39
  N38 --> N39
```

## Component Hierarchy

```mermaid
graph TD
  N1["app/(app)/admin/layout.tsx"]
  N2["app/(app)/layout.tsx"]
  N3["app/(app)/settings/layout.tsx"]
  N4["app/layout.tsx"]
  N5["app/(app)/admin/audit/page.tsx"]
  N6["app/(app)/admin/page.tsx"]
  N7["app/(app)/admin/settings/page.tsx"]
  N8["app/(app)/admin/shift-types/page.tsx"]
  N9["app/(app)/admin/teams/page.tsx"]
  N10["app/(app)/admin/users/page.tsx"]
  N11["app/(app)/agenda/page.tsx"]
  N12["app/(app)/month/page.tsx"]
  N13["app/(app)/page.tsx"]
  N14["app/(app)/settings/page.tsx"]
  N15["app/(app)/settings/users/page.tsx"]
  N16["app/(app)/standard/page.tsx"]
  N17["app/(app)/swap/page.tsx"]
  N18["app/page.tsx"]
  N19["components/ui/button.tsx"]
  N20["components/ui/dialog.tsx"]
  N21["components/ui/select.tsx"]
  N22["components/ui/input.tsx"]
  N23["components/ui/label.tsx"]
  N24["components/schedule/WeekGrid.tsx"]
  N25["components/BulkShiftModal.tsx"]
  N26["components/schedule/ShiftModal.tsx"]
  N27["components/layout/Navigation.tsx"]
  N28["components/ui/toaster.tsx"]
  N29["components/ui/toast.tsx"]
  N30["components/auth/RoleSwitcher.tsx"]
  N31["components/layout/NotificationsPanel.tsx"]
  N32["components/ui/dropdown-menu.tsx"]
  N2 --> N1
  N4 --> N2
  N2 --> N3
  N1 --> N5
  N1 --> N6
  N1 --> N7
  N1 --> N8
  N1 --> N9
  N1 --> N10
  N2 --> N11
  N2 --> N12
  N2 --> N13
  N3 --> N14
  N3 --> N15
  N2 --> N16
  N2 --> N17
  N4 --> N18
  N17 --> N19
  N17 --> N20
  N17 --> N21
  N17 --> N22
  N17 --> N23
  N16 --> N19
  N16 --> N24
  N16 --> N25
  N25 --> N19
  N25 --> N22
  N25 --> N23
  N25 --> N20
  N25 --> N21
  N24 --> N26
  N26 --> N20
  N26 --> N19
  N26 --> N22
  N26 --> N23
  N26 --> N21
  N12 --> N19
  N12 --> N26
  N11 --> N19
  N11 --> N21
  N10 --> N19
  N10 --> N22
  N10 --> N23
  N10 --> N20
  N10 --> N21
  N9 --> N19
  N9 --> N22
  N9 --> N23
  N9 --> N20
  N8 --> N19
  N8 --> N22
  N8 --> N23
  N8 --> N20
  N7 --> N19
  N7 --> N22
  N7 --> N23
  N7 --> N21
  N6 --> N19
  N5 --> N19
  N5 --> N21
  N2 --> N27
  N2 --> N28
  N28 --> N29
  N27 --> N19
  N27 --> N30
  N27 --> N31
  N31 --> N19
  N31 --> N20
  N30 --> N32
  N30 --> N19
```
<!-- AUTO-GENERATED-ARCHITECTURE-END -->


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

### Roller

- **Admin**: Kan administrere team, brukere, vakttyper
- **Leader**: Kan opprette/redigere vakter, utføre vaktbytter, godkjenne fravær/sykdom
- **Employee**: Kan se alle planer, be om fravær/sykdom, be om vaktbytter

### Notater og fravær

- Ansatte kan opprette notater for fravær eller sykdom
- Disse markeres som "pending" og må godkjennes av leder
- Leder kan godkjenne eller avvise forespørsler

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
│   ├── auth/               # Mock-autentisering
│   ├── date-utils.ts       # Dato-hjelpefunksjoner
│   └── notifications/      # Varslingsfunksjoner
└── prisma/
    ├── schema.prisma       # Database-skjema
    └── seed.ts             # Seed-script
```

## Database

Systemet bruker SQLite for MVP, men kan enkelt byttes til Postgres ved å endre `DATABASE_URL` i `.env` og oppdatere Prisma-schemaet.

### Viktige modeller

- **Team**: Organisasjonsteam
- **User**: Brukere med roller (ADMIN, LEADER, EMPLOYEE)
- **ShiftType**: Vakttyper med farger og standardtider
- **Shift**: Planlagte vakter
- **Note**: Notater (generelle, fravær, sykdom) med status
- **SwapRequest**: Vaktbytteforespørsler med status
- **Notification**: Varsler for brukere

## Videre utvikling

### Planlagte forbedringer

1. **Azure AD-integrasjon**: Erstatt mock-auth med ekte Azure AD (Entra ID)
2. **Postgres-migrering**: Bytt fra SQLite til Postgres for produksjon
3. **E-postvarsler**: Implementer ekte e-post-sending
4. **SMS-integrasjon**: Integrer med eksisterende SMS-endpoint
5. **Avansert planlegging**: Automatisk vaktplanlegging, konfliktdeteksjon
6. **Mobilapp**: React Native-app for mobil

## Lisens

Dette prosjektet er bygget som en del av en bacheloroppgave.

## Kontakt

For spørsmål eller tilbakemeldinger, kontakt prosjekteier.

