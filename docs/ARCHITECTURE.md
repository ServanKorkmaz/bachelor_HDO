# Arkitektur og datamodell

> Opprettet: januar–februar 2026  
> Sist oppdatert: mars 2026

---

## 1. Teknologivalg

| Lag | Teknologi |
|-----|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Backend / API | Next.js Route Handlers (REST) |
| Database | SQLite (utvikling), Prisma ORM |
| Autentisering | Azure AD (OIDC) via NextAuth (mock i utvikling) |
| Varsler | Intern varslingsmodul med støtte for e-post og SMS (fremtidig) |

---

## 2. Overordnet arkitektur

```
┌──────────────┐      ┌───────────────────┐      ┌────────────┐
│   Nettleser   │◄────►│  Next.js Server   │◄────►│  SQLite DB │
│  (React SPA)  │ HTTP │  (Route Handlers) │Prisma│            │
└──────────────┘      └───────────────────┘      └────────────┘
```

- **Klient** sender HTTP-forespørsler til Next.js Route Handlers (`/api/*`).
- **Server** bruker Prisma ORM for å lese/skrive til SQLite-databasen.
- **Prisma-skjemaet** (`prisma/schema.prisma`) definerer alle tabeller, felt og relasjoner.

---

## 3. Database-skjema (ER-oversikt)

Nedenfor er alle entiteter (tabeller) og deres relasjoner beskrevet.

### 3.1 Entiteter

#### Team (`teams`)

Et **team** representerer en avdeling eller arbeidsgruppe. Alt i systemet er team-scopet: vakter, notater, vaktbytter, varsler og fraværsforespørsler tilhører et team.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `name` | String | Teamets navn |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

---

#### User (`users`)

En **bruker** er en person som logger inn i systemet. Hver bruker tilhører ett primærteam og kan ha rollen `LEADER` (leder) eller `EMPLOYEE` (ansatt).

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `name` | String | Fullt navn |
| `email` | String (unik) | E-postadresse (brukes til innlogging) |
| `role` | String | Rolle: `LEADER` eller `EMPLOYEE` |
| `teamId` | String (FK → Team) | Primærteam brukeren tilhører |
| `azureOid` | String? (unik) | Azure AD object-ID for SSO-innlogging |
| `status` | String | Kontostatus: `active` / `inactive` |
| `lastLoginAt` | DateTime? | Siste innloggingstidspunkt |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

---

#### ShiftType (`shift_types`)

En **vakttype** definerer en mal for vakter, f.eks. «Dagvakt», «Kveldsvakt» eller «Nattevakt». Vakttyper har standard start-/sluttid og en fargekode for visning i kalenderen.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `code` | String (unik) | Kort kode, f.eks. `DAG`, `KVELD` |
| `label` | String | Visningsnavn, f.eks. «Dagvakt» |
| `color` | String | Hex-fargekode for kalendervisning |
| `defaultStartTime` | String | Standard starttid (HH:mm) |
| `defaultEndTime` | String | Standard sluttid (HH:mm) |
| `crossesMidnight` | Boolean | Om vakten krysser midnatt (f.eks. nattevakt) |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

---

#### Shift (`shifts`)

En **vakt** er en konkret tildelt arbeidsperiode for én bruker på én dato. Den refererer til en vakttype for å arve standardverdier.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `teamId` | String (FK → Team) | Teamet vakten tilhører |
| `userId` | String (FK → User) | Brukeren som er tildelt vakten |
| `date` | String | Dato i YYYY-MM-DD-format |
| `startDateTime` | DateTime | Faktisk starttidspunkt |
| `endDateTime` | DateTime | Faktisk sluttidspunkt |
| `shiftTypeId` | String (FK → ShiftType) | Hvilken vakttype dette er |
| `comment` | String? | Valgfri kommentar |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

Indekser: `[teamId, date]`, `[userId, date]` for rask oppslag.

---

#### Note (`notes`)

Et **notat** er en melding knyttet til en datoperiode innenfor et team. Notater brukes til generelle beskjeder, fraværsmeldinger og sykdomsregistreringer.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `teamId` | String (FK → Team) | Teamet notatet tilhører |
| `createdByUserId` | String (FK → User) | Brukeren som opprettet notatet |
| `type` | String | Type: `GENERAL`, `ABSENCE`, `SICKNESS` |
| `title` | String? | Valgfri tittel |
| `body` | String | Innhold / beskrivelse |
| `dateFrom` | String | Startdato (YYYY-MM-DD) |
| `dateTo` | String | Sluttdato (YYYY-MM-DD) |
| `visibility` | String | Synlighet: `ALL` (alle) eller begrenset |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

Indeks: `[teamId, dateFrom, dateTo]` for datobasert filtrering.

---

#### SwapRequest (`swap_requests`)

En **vaktbytteforespørsel** lar en ansatt be om å bytte en vakt med en annen ansatt. Forespørselen går gjennom en godkjenningsflyt der en leder kan godkjenne eller avvise.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `teamId` | String (FK → Team) | Teamet forespørselen gjelder |
| `requestedByUserId` | String (FK → User) | Brukeren som sendte forespørselen |
| `fromUserId` | String (FK → User) | Brukeren som gir fra seg vakten |
| `toUserId` | String (FK → User) | Brukeren som skal overta vakten |
| `shiftId` | String (FK → Shift) | Vakten det gjelder |
| `status` | String | Status: `PENDING`, `APPROVED`, `REJECTED` |
| `message` | String? | Valgfri melding/begrunnelse |
| `decidedBy` | String? (FK → User) | Lederen som tok beslutningen |
| `decidedAt` | DateTime? | Tidspunkt for beslutning |
| `createdAt` | DateTime | Opprettet-tidspunkt |

Indekser: `[teamId, status]`, `[requestedByUserId]`.

---

#### HolidayRequest (`holiday_requests`)

En **fraværsforespørsel** lar en ansatt be om ferie, fravær eller registrere sykdom. En leder vurderer forespørselen og godkjenner eller avviser den.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `teamId` | String (FK → Team) | Teamet forespørselen gjelder |
| `userId` | String (FK → User) | Brukeren som sendte forespørselen |
| `type` | String | Type: `HOLIDAY` (ferie), `ABSENCE` (fravær), `SICKNESS` (sykdom) |
| `status` | String | Status: `PENDING` (venter), `APPROVED` (godkjent), `REJECTED` (avvist) |
| `dateFrom` | String | Startdato (YYYY-MM-DD) |
| `dateTo` | String? | Valgfri sluttdato (YYYY-MM-DD) |
| `message` | String? | Valgfri melding/begrunnelse |
| `decidedBy` | String? (FK → User) | Lederen som tok beslutningen |
| `decidedAt` | DateTime? | Tidspunkt for beslutning |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

Indeks: `[teamId, status]`.

---

#### Notification (`notifications`)

Et **varsel** informerer en bruker (eller hele teamet) om hendelser, f.eks. nye vakter, vaktbytter eller fraværsbeslutninger.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `teamId` | String (FK → Team) | Teamet varselet tilhører |
| `userId` | String? (FK → User) | Mottaker (null = hele teamet) |
| `type` | String | Varseltype, f.eks. `SHIFT_CREATED`, `SWAP_EXECUTED`, `HOLIDAY_REQUESTED` |
| `title` | String | Overskrift |
| `message` | String | Varselmelding |
| `read` | Boolean | Om varselet er lest |
| `createdAt` | DateTime | Opprettet-tidspunkt |

Indeks: `[teamId, userId, read]`.

---

#### NotificationSettings (`notification_settings`)

**Varslingsinnstillinger** per team. Styrer om e-postvarsler er aktivert og eventuelt SMS-endepunkt.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `teamId` | String (unik, FK → Team) | Teamet innstillingene gjelder |
| `emailEnabled` | Boolean | Om e-postvarsler er aktivert |
| `smsEndpoint` | String? | Fremtidig SMS-integrasjon |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

---

#### UserNotificationPreference (`user_notification_preferences`)

**Brukerens varslingsvalg**: hvilke typer varsler brukeren vil motta, og via hvilken kanal (e-post / SMS).

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `userId` | String (unik, FK → User) | Brukeren preferansene gjelder |
| `shiftChangesEmail` | Boolean | Motta vaktendringer via e-post |
| `shiftChangesSms` | Boolean | Motta vaktendringer via SMS |
| `swapEmail` | Boolean | Motta vaktbyttevarsler via e-post |
| `swapSms` | Boolean | Motta vaktbyttevarsler via SMS |
| `noteEmail` | Boolean | Motta notatvarsler via e-post |
| `noteSms` | Boolean | Motta notatvarsler via SMS |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

---

#### TeamMembership (`team_memberships`)

Et **teammedlemskap** knytter en bruker til et team med en bestemt rolle. En bruker kan ha medlemskap i flere team (f.eks. vikar på tvers av avdelinger).

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `userId` | String (FK → User) | Brukeren |
| `teamId` | String (FK → Team) | Teamet |
| `role` | String | Rolle i teamet: `LEADER` eller `EMPLOYEE` |
| `status` | String | Medlemsstatus: `active` / `inactive` |
| `createdAt` | DateTime | Opprettet-tidspunkt |
| `updatedAt` | DateTime | Sist oppdatert |

Unik-constraint: `[userId, teamId]` — en bruker kan kun ha ett medlemskap per team.

---

#### AuditLog (`audit_logs`)

En **revisjonslogg** lagrer alle administrative handlinger (oppretting/endring av brukere, roller, godkjenninger) for sporbarhet og etterlevelse.

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `id` | String | Unik primærnøkkel |
| `actorUserId` | String | Brukeren som utførte handlingen |
| `action` | String | Handlingstype, f.eks. `USER_CREATED`, `HOLIDAY_APPROVED` |
| `entityType` | String | Hva som ble endret, f.eks. `user`, `holiday_request` |
| `entityId` | String | ID-en til entiteten som ble endret |
| `beforeJson` | String? | JSON-snapshot av tilstand FØR endring |
| `afterJson` | String? | JSON-snapshot av tilstand ETTER endring |
| `createdAt` | DateTime | Tidspunkt for handlingen |

Indekser: `[entityType, entityId]`, `[actorUserId]`.

---

## 4. Relasjoner (forklart)

Nedenfor er alle relasjoner mellom entitetene beskrevet med hva de betyr i praksis.

### 4.1 Team ↔ User (én-til-mange)

```
Team 1 ──── * User
```

**Hva det betyr:** Hvert team har mange brukere, men hver bruker har nøyaktig ett primærteam (`user.teamId → team.id`). Når et team slettes, slettes også alle tilknyttede brukere (`onDelete: Cascade`).

**Eksempel:** Team «Avdeling Nord» har 12 ansatte. Alle disse brukerne har `teamId` satt til ID-en for «Avdeling Nord».

---

### 4.2 Team ↔ User via TeamMembership (mange-til-mange)

```
Team * ──── TeamMembership ──── * User
```

**Hva det betyr:** I tillegg til primærteamet kan en bruker ha medlemskap i flere team gjennom `TeamMembership`-tabellen. Hvert medlemskap har en rolle (`LEADER` / `EMPLOYEE`) og en status (`active` / `inactive`). Én bruker kan altså være leder i ett team og ansatt i et annet.

**Eksempel:** Bruker «Kari» er leder i «Avdeling Nord» og vikar (employee) i «Avdeling Sør».

---

### 4.3 Team ↔ Shift (én-til-mange)

```
Team 1 ──── * Shift
```

**Hva det betyr:** Alle vakter tilhører et team. Når et team slettes, slettes alle vaktene. Dette sikrer at vaktplaner er team-isolerte.

---

### 4.4 User ↔ Shift (én-til-mange)

```
User 1 ──── * Shift
```

**Hva det betyr:** Hver vakt er tildelt én bruker. En bruker kan ha mange vakter (over tid). Når en bruker slettes, slettes alle vaktene deres (`onDelete: Cascade`).

---

### 4.5 ShiftType ↔ Shift (én-til-mange)

```
ShiftType 1 ──── * Shift
```

**Hva det betyr:** Hver vakt refererer til en vakttype som definerer standardverdier (start/slutt, farge). En vakttype kan ikke slettes hvis den fortsatt er i bruk (`onDelete: Restrict`). Dette forhindrer at man mister informasjon om hvilken type vakt det var.

**Eksempel:** Vakttypen «Dagvakt» (08:00–16:00, grønn) brukes av 50 vakter. Man kan ikke slette «Dagvakt» før alle disse vaktene er fjernet eller flyttet til en annen type.

---

### 4.6 Team ↔ Note (én-til-mange)

```
Team 1 ──── * Note
```

**Hva det betyr:** Notater (generelle, fravær, sykdom) tilhører et team og er synlige for teamets medlemmer.

---

### 4.7 User → Note (én-til-mange, navngitt relasjon «NoteCreator»)

```
User 1 ──── * Note   [NoteCreator]
```

**Hva det betyr:** Hver notat har en opprettet-av-bruker (`createdByUserId`). Den navngitte relasjonen «NoteCreator» skiller denne fra andre User-relasjoner, fordi User-modellen har mange ulike relasjoner.

---

### 4.8 SwapRequest — fire brukerrelasjoner

```
User ───┬── * SwapRequest  [SwapRequester]   (den som ba om bytte)
        ├── * SwapRequest  [SwapFromUser]     (den som gir fra seg vakten)
        ├── * SwapRequest  [SwapToUser]       (den som overtar vakten)
        └── * SwapRequest  [SwapDecider]      (lederen som godkjente/avslo)
```

**Hva det betyr:** Et vaktbytte involverer opptil fire ulike brukerroller:

| Relasjon | Felt | Forklaring |
|----------|------|------------|
| **SwapRequester** | `requestedByUserId` | Brukeren som sendte inn forespørselen om vaktbytte. |
| **SwapFromUser** | `fromUserId` | Brukeren som opprinnelig har vakten og gir den fra seg. |
| **SwapToUser** | `toUserId` | Brukeren som skal overta vakten. |
| **SwapDecider** | `decidedBy` | Lederen som godkjente eller avslo forespørselen. Kan være `null` hvis forespørselen fortsatt venter. |

**Eksempel:** Ansatt «Ola» (requester) ber om at «Kari» (fromUser) sin dagvakt byttes til «Per» (toUser). Leder «Anne» (decider) godkjenner byttet.

---

### 4.9 Shift ↔ SwapRequest (én-til-mange)

```
Shift 1 ──── * SwapRequest
```

**Hva det betyr:** En vakt kan ha flere vaktbytteforespørsler knyttet til seg (f.eks. én avvist og én ny). Når en vakt slettes, slettes alle tilknyttede forespørsler (`onDelete: Cascade`).

---

### 4.10 Team ↔ SwapRequest (én-til-mange)

```
Team 1 ──── * SwapRequest
```

**Hva det betyr:** Alle vaktbytter skjer innenfor et team. Ledere ser kun vaktbytter for sitt eget team.

---

### 4.11 HolidayRequest — to brukerrelasjoner

```
User 1 ──── * HolidayRequest              (den som søkte om fravær)
User 1 ──── * HolidayRequest  [HolidayDecider]  (lederen som godkjente/avslo)
```

**Hva det betyr:** En fraværsforespørsel har to brukerrelasjoner:

| Relasjon | Felt | Forklaring |
|----------|------|------------|
| **(standard)** | `userId` | Brukeren som sendte fraværsforespørselen (den ansatte). |
| **HolidayDecider** | `decidedBy` | Lederen som behandlet forespørselen (godkjente eller avslo). Kan være `null` hvis forespørselen fortsatt venter. |

**Eksempel:** Ansatt «Per» ber om ferie 15.–22. mars. Leder «Anne» godkjenner forespørselen → `decidedBy = Anne.id`.

---

### 4.12 Team ↔ HolidayRequest (én-til-mange)

```
Team 1 ──── * HolidayRequest
```

**Hva det betyr:** Fraværsforespørsler tilhører et team. Ledere ser kun forespørsler fra sitt eget team.

---

### 4.13 Team ↔ Notification (én-til-mange)

```
Team 1 ──── * Notification
```

**Hva det betyr:** Varsler er team-scopet. Et varsel sendes til et team, og eventuelt til én spesifikk bruker i teamet.

---

### 4.14 User ↔ Notification (én-til-mange, valgfri)

```
User 1 ──── * Notification   (userId kan være null)
```

**Hva det betyr:** Hvis `userId` er satt, er varselet rettet mot den spesifikke brukeren. Hvis `userId` er `null`, er det et team-bredt varsel synlig for alle i teamet. Når en bruker slettes, settes `userId` til `null` i stedet for å slette varselet (`onDelete: SetNull`).

---

### 4.15 Team ↔ NotificationSettings (én-til-én)

```
Team 1 ──── 1 NotificationSettings
```

**Hva det betyr:** Hvert team har maks én innstillingsrad for varsler. Innstillingen styrer om e-post er aktivert og eventuelt SMS-endepunkt.

---

### 4.16 User ↔ UserNotificationPreference (én-til-én)

```
User 1 ──── 1 UserNotificationPreference
```

**Hva det betyr:** Hver bruker har maks én rad med personlige varslingsvalg. Brukeren velger selv hvilke varseltyper de vil motta via e-post og/eller SMS.

---

## 5. ER-diagram (tekstbasert)

```
┌──────────────────┐       ┌────────────────────────┐
│      Team        │       │        User             │
│──────────────────│       │────────────────────────│
│ id          (PK) │◄──┐   │ id              (PK)   │
│ name             │   │   │ name                   │
│ createdAt        │   │   │ email           (UQ)   │
│ updatedAt        │   └───│ teamId          (FK)   │
│                  │       │ role                   │
│                  │       │ azureOid        (UQ)   │
│                  │       │ status                 │
└──────────────────┘       └────────────────────────┘
     │  │  │  │                │  │  │  │  │  │
     │  │  │  │                │  │  │  │  │  │
     ▼  ▼  ▼  ▼                ▼  ▼  ▼  ▼  ▼  ▼

┌──────────┐ ┌─────────┐ ┌──────────────┐ ┌────────────────┐
│  Shift   │ │  Note   │ │ SwapRequest  │ │HolidayRequest  │
│          │ │         │ │              │ │                │
│ teamId──►│ │teamId──►│ │ teamId──────►│ │ teamId────────►│
│ userId──►│ │creator─►│ │ requester──►│ │ userId───────►│
│ shiftType│ │         │ │ fromUser───►│ │ decidedBy────►│
│   Id──►  │ │         │ │ toUser────►│ │                │
│          │ │         │ │ shiftId───►│ │                │
│          │ │         │ │ decidedBy─►│ │                │
└──────────┘ └─────────┘ └──────────────┘ └────────────────┘

┌────────────────┐  ┌──────────────────────┐  ┌────────────────┐
│ Notification   │  │ NotificationSettings │  │ TeamMembership │
│                │  │                      │  │                │
│ teamId────────►│  │ teamId (1:1)────────►│  │ userId────────►│
│ userId────────►│  │                      │  │ teamId────────►│
└────────────────┘  └──────────────────────┘  └────────────────┘

┌────────────────────────────┐  ┌───────────┐
│ UserNotificationPreference │  │ AuditLog  │
│                            │  │           │
│ userId (1:1)──────────────►│  │ (frittstående; logger  │
└────────────────────────────┘  │  alle admin-handlinger)│
                                └───────────┘
```

---

## 6. Sletteoppførsel (Cascade-regler)

| Når dette slettes… | …skjer dette | Regel |
|---------------------|-------------|-------|
| Team | Alle brukere, vakter, notater, vaktbytter, varsler, fraværsforespørsler, medlemskap og innstillinger i teamet slettes | `Cascade` |
| User | Alle vakter, notater, vaktbytter (som requester/from/to), fraværsforespørsler og medlemskap slettes | `Cascade` |
| User (som decider) | `decidedBy`-feltet i SwapRequest/HolidayRequest settes til `null` | `SetNull` |
| User (som varselmottaker) | `userId` i Notification settes til `null` | `SetNull` |
| ShiftType | Kan **ikke** slettes hvis den er i bruk av vakter | `Restrict` |
| Shift | Alle vaktbytteforespørsler knyttet til vakten slettes | `Cascade` |

---

## 7. Statusflyter

### Fraværsforespørsel (HolidayRequest)

```
  Ansatt sender forespørsel
           │
           ▼
       ┌────────┐
       │PENDING │  (venter på godkjenning)
       └───┬────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌──────────┐ ┌──────────┐
│ APPROVED │ │ REJECTED │
│(godkjent)│ │ (avvist) │
└──────────┘ └──────────┘
```

### Vaktbytte (SwapRequest)

```
  Ansatt ber om bytte
           │
           ▼
       ┌────────┐
       │PENDING │
       └───┬────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌──────────┐ ┌──────────┐
│ APPROVED │ │ REJECTED │
└──────────┘ └──────────┘
```

---

## 8. Indekser

Indekser er definert for rask oppslag i de mest brukte spørringene:

| Tabell | Indeks | Bruksområde |
|--------|--------|-------------|
| `shifts` | `[teamId, date]` | Hente alle vakter for et team på en dato/periode |
| `shifts` | `[userId, date]` | Hente alle vakter for en bruker på en dato |
| `notes` | `[teamId, dateFrom, dateTo]` | Filtrere notater for et team innenfor en datoperiode |
| `swap_requests` | `[teamId, status]` | Liste vaktbytter per team filtrert på status |
| `swap_requests` | `[requestedByUserId]` | Hente brukerens egne vaktbytteforespørsler |
| `holiday_requests` | `[teamId, status]` | Liste fraværsforespørsler per team filtrert på status |
| `notifications` | `[teamId, userId, read]` | Hente uleste varsler for en bruker i et team |
| `team_memberships` | `[userId]`, `[teamId]` | Oppslag av medlemskap per bruker eller team |
| `audit_logs` | `[entityType, entityId]`, `[actorUserId]` | Søk i revisjonslogg per entitet eller aktør |
