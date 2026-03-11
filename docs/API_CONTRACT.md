# API-kontrakt – HDO Vaktplanlegger

> Fullstendig oversikt over alle REST API-endepunkter i applikasjonen.
> Alle endepunkter returnerer JSON og bruker standard HTTP-statuskoder.
> Autentisering skjer via `x-current-user-id`-header eller `currentUserId` i request body (mock-auth).

---

## Innholdsfortegnelse

1. [Brukere (Users)](#1-brukere)
2. [Team](#2-team)
3. [Vakttyper (Shift Types)](#3-vakttyper)
4. [Vakter (Shifts)](#4-vakter)
5. [Vakter – Masseoperasjon (Bulk)](#5-vakter--masseoperasjon)
6. [Vaktbytteforespørsler (Swap Requests)](#6-vaktbytteforespørsler)
7. [Notater (Notes)](#7-notater)
8. [Varsler (Notifications)](#8-varsler)
9. [Varslingsinnstillinger per team](#9-varslingsinnstillinger-per-team)
10. [Varslingsinnstillinger per bruker](#10-varslingsinnstillinger-per-bruker)
11. [Admin – Brukere](#11-admin--brukere)
12. [Admin – Teammedlemskap](#12-admin--teammedlemskap)
13. [Admin – Revisjonslogg (Audit)](#13-admin--revisjonslogg)
14. [Feilhåndtering](#14-feilhåndtering)
15. [Autentisering og autorisasjon](#15-autentisering-og-autorisasjon)

---

## 1. Brukere

### `GET /api/users`

Hent liste over brukere. Valgfri filtrering på team.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `teamId`  | query     | Nei     | Filtrer brukere med aktivt TeamMembership i dette teamet |

**Respons `200`:**
```json
[
  {
    "id": "string",
    "name": "string",
    "email": "string",
    "role": "ADMIN | LEADER | EMPLOYEE",
    "teamId": "string",
    "status": "active | inactive",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
  }
]
```

---

### `PUT /api/users/:id`

Oppdater rolle for en bruker. Kun ADMIN.

| Parameter       | Plassering | Påkrevd | Beskrivelse |
|-----------------|-----------|---------|-------------|
| `id`            | path      | Ja      | Bruker-ID |
| `role`          | body      | Ja      | Ny rolle: `ADMIN`, `LEADER` eller `EMPLOYEE` |
| `currentUserId` | body      | Ja      | ID til innlogget bruker (må ha ADMIN-rolle) |

**Respons `200`:** Oppdatert brukerobjekt.

**Feilkoder:** `401` – mangler currentUserId · `403` – ikke ADMIN · `400` – ugyldig rolle.

---

## 2. Team

### `GET /api/teams`

Hent alle team, sortert alfabetisk.

**Respons `200`:**
```json
[
  {
    "id": "string",
    "name": "string",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
  }
]
```

---

### `POST /api/teams`

Opprett nytt team med standard varslingsinnstillinger. Kun ADMIN.

| Parameter       | Plassering | Påkrevd | Beskrivelse |
|-----------------|-----------|---------|-------------|
| `name`          | body      | Ja      | Teamnavn |
| `currentUserId` | body      | Ja      | ID til innlogget ADMIN-bruker |

**Respons `200`:** Opprettet teamobjekt.

**Sideeffekt:** Oppretter `NotificationSettings` med `emailEnabled: true`.

---

### `DELETE /api/teams/:id`

Slett et team. Kun ADMIN.

| Parameter       | Plassering | Påkrevd | Beskrivelse |
|-----------------|-----------|---------|-------------|
| `id`            | path      | Ja      | Team-ID |
| `currentUserId` | body      | Ja      | ID til innlogget ADMIN-bruker |

**Respons `200`:** `{ "success": true }`

---

## 3. Vakttyper

### `GET /api/shift-types`

Hent alle vakttyper, sortert på `code`.

**Respons `200`:**
```json
[
  {
    "id": "string",
    "code": "string",
    "label": "string",
    "color": "#hex",
    "defaultStartTime": "HH:mm",
    "defaultEndTime": "HH:mm",
    "crossesMidnight": false,
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
  }
]
```

---

### `POST /api/shift-types`

Opprett en ny vakttype.

| Parameter          | Plassering | Påkrevd | Beskrivelse |
|--------------------|-----------|---------|-------------|
| `code`             | body      | Ja      | Unik kode, f.eks. `D`, `A`, `N` |
| `label`            | body      | Ja      | Visningsnavn, f.eks. "Dagvakt" |
| `color`            | body      | Ja      | Hex-farge, f.eks. `#22c55e` |
| `defaultStartTime` | body      | Ja      | Standardstart `HH:mm` |
| `defaultEndTime`   | body      | Ja      | Standardslutt `HH:mm` |
| `crossesMidnight`  | body      | Nei     | Vakttypen krysser midnatt (default `false`) |

**Respons `200`:** Opprettet vakttypeobjekt.

---

### `PUT /api/shift-types/:id`

Oppdater en vakttype.

| Parameter          | Plassering | Påkrevd | Beskrivelse |
|--------------------|-----------|---------|-------------|
| `id`               | path      | Ja      | Vakttype-ID |
| `code`             | body      | Ja      | Unik kode |
| `label`            | body      | Ja      | Visningsnavn |
| `color`            | body      | Ja      | Hex-farge |
| `defaultStartTime` | body      | Ja      | Standardstart |
| `defaultEndTime`   | body      | Ja      | Standardslutt |
| `crossesMidnight`  | body      | Nei     | Krysser midnatt |

**Respons `200`:** Oppdatert vakttypeobjekt.

---

### `DELETE /api/shift-types/:id`

Slett en vakttype. Feiler dersom vakttypen er knyttet til eksisterende vakter (`onDelete: Restrict`).

**Respons `200`:** `{ "success": true }`

---

## 4. Vakter

### `GET /api/shifts`

Hent vakter for et team med valgfri filtrering.

| Parameter  | Plassering | Påkrevd | Beskrivelse |
|------------|-----------|---------|-------------|
| `teamId`   | query     | Ja      | Team-ID |
| `dateFrom` | query     | Nei     | Startdato `YYYY-MM-DD` (inklusiv) |
| `dateTo`   | query     | Nei     | Sluttdato `YYYY-MM-DD` (inklusiv) |
| `userId`   | query     | Nei     | Filtrer på spesifikk bruker |

**Respons `200`:**
```json
[
  {
    "id": "string",
    "teamId": "string",
    "userId": "string",
    "date": "YYYY-MM-DD",
    "startDateTime": "ISO 8601",
    "endDateTime": "ISO 8601",
    "shiftTypeId": "string",
    "comment": "string | null",
    "shiftType": { "id": "...", "code": "...", "label": "...", "color": "..." },
    "user": { "id": "...", "name": "..." }
  }
]
```

---

### `POST /api/shifts`

Opprett en vakt. Sender varsel til den berørte brukeren.

| Parameter     | Plassering | Påkrevd | Beskrivelse |
|---------------|-----------|---------|-------------|
| `date`        | body      | Ja      | Dato `YYYY-MM-DD` |
| `userId`      | body      | Ja      | Bruker-ID |
| `shiftTypeId` | body      | Ja      | Vakttype-ID |
| `startTime`   | body      | Ja      | Starttid `HH:mm` |
| `endTime`     | body      | Ja      | Sluttid `HH:mm` |
| `teamId`      | body      | Nei     | Team-ID (hentes fra bruker hvis utelatt) |
| `comment`     | body      | Nei     | Valgfri kommentar |

**Respons `200`:** Opprettet vaktobjekt med `shiftType` og `user` inkludert.

**Sideeffekter:**
- Oppretter `Notification` av type `SHIFT_CREATED`.
- Leverer varsel via konfigurerte kanaler (e-post/SMS).
- Håndterer automatisk natt-vakter som krysser midnatt.

---

### `PUT /api/shifts/:id`

Oppdater en eksisterende vakt. Sender varsel til den berørte brukeren.

| Parameter     | Plassering | Påkrevd | Beskrivelse |
|---------------|-----------|---------|-------------|
| `id`          | path      | Ja      | Vakt-ID |
| `date`        | body      | Ja      | Dato `YYYY-MM-DD` |
| `userId`      | body      | Ja      | Bruker-ID |
| `shiftTypeId` | body      | Ja      | Vakttype-ID |
| `startTime`   | body      | Ja      | Starttid `HH:mm` |
| `endTime`     | body      | Ja      | Sluttid `HH:mm` |
| `comment`     | body      | Nei     | Valgfri kommentar |

**Respons `200`:** Oppdatert vaktobjekt.

**Sideeffekter:** Varsel `SHIFT_UPDATED` til opprinnelig bruker.

---

### `DELETE /api/shifts/:id`

Slett en vakt. Sender varsel til den berørte brukeren.

**Respons `200`:** `{ "success": true }`

**Sideeffekter:** Varsel `SHIFT_DELETED` til brukeren.

---

## 5. Vakter – Masseoperasjon

### `POST /api/shifts/bulk`

Utfør masseoperasjoner (opprett, oppdater eller slett) på vakter. Kun ADMIN og LEADER.

| Parameter       | Plassering | Påkrevd | Beskrivelse |
|-----------------|-----------|---------|-------------|
| `action`        | body      | Ja      | `create`, `update` eller `delete` |
| `teamId`        | body      | Nei     | Team-ID (hentes fra innlogget bruker hvis utelatt) |
| `currentUserId` | body      | Ja      | ID til innlogget bruker |
| `items`         | body      | Ja      | Array med operasjoner (maks 200 elementer) |

**Hvert element i `items`:**

| Felt          | Påkrevd (create) | Påkrevd (update) | Påkrevd (delete) | Beskrivelse |
|---------------|-------------------|-------------------|-------------------|-------------|
| `shiftId`     | Nei               | Ja*               | Ja*               | Eksisterende vakt-ID |
| `userId`      | Ja                | Nei               | Nei               | Bruker-ID |
| `date`        | Ja                | Nei               | Nei               | Dato `YYYY-MM-DD` |
| `shiftTypeId` | Ja                | Ja                | Nei               | Vakttype-ID |
| `startTime`   | Ja                | Ja                | Nei               | Starttid `HH:mm` |
| `endTime`     | Ja                | Ja                | Nei               | Sluttid `HH:mm` |
| `comment`     | Nei               | Nei               | Nei               | Kommentar |

*Dersom `shiftId` mangler, forsøker systemet å finne vakt via `userId`+`date`+`teamId`.

**Respons `200`:**
```json
{
  "successes": [{ "userId": "...", "date": "...", "shiftId": "..." }],
  "failures": [{ "userId": "...", "date": "...", "error": "..." }]
}
```

**Validering:**
- Maksimalt 200 elementer per forespørsel.
- Prosesserer i batches à 20 for ytelse.
- Sender individuelle varsler per opprettet/oppdatert/slettet vakt.

---

## 6. Vaktbytteforespørsler

### `GET /api/swap-requests`

Hent vaktbytteforespørsler for et team.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `teamId`  | query     | Ja      | Team-ID |

**Respons `200`:**
```json
[
  {
    "id": "string",
    "teamId": "string",
    "requestedByUserId": "string",
    "fromUserId": "string",
    "toUserId": "string",
    "shiftId": "string",
    "status": "PENDING | APPROVED | REJECTED | EXECUTED",
    "message": "string | null",
    "createdAt": "ISO 8601",
    "decidedBy": "string | null",
    "decidedAt": "ISO 8601 | null",
    "requestedBy": { "id": "...", "name": "..." },
    "fromUser": { "id": "...", "name": "..." },
    "toUser": { "id": "...", "name": "..." },
    "shift": { "id": "...", "date": "...", "shiftType": { ... } }
  }
]
```

---

### `POST /api/swap-requests`

Opprett en vaktbytteforespørsel. Oppretter varsel og revisjonslogg.

| Parameter           | Plassering | Påkrevd | Beskrivelse |
|---------------------|-----------|---------|-------------|
| `teamId`            | body      | Ja      | Team-ID |
| `requestedByUserId` | body      | Ja      | Bruker som oppretter forespørselen |
| `shiftId`           | body      | Ja      | Vakt-ID som skal byttes |
| `toUserId`          | body      | Ja      | Bruker som skal overta vakten |
| `message`           | body      | Nei     | Valgfri melding |

**Respons `200`:** Opprettet SwapRequest med relasjoner inkludert.

**Sideeffekter:**
- Varsel `SWAP_REQUESTED` til teamet.
- Revisjonslogg med `SWAP_REQUESTED`-handling.
- `fromUserId` settes automatisk basert på hvem som eier vakten.

---

### `POST /api/swap-requests/:id/approve`

Godkjenn en ventende vaktbytteforespørsel.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `id`      | path      | Ja      | SwapRequest-ID |

**Autentisering:** `x-current-user-id` header.

**Respons `200`:** Oppdatert SwapRequest med `status: "APPROVED"`.

**Forutsetning:** Status må være `PENDING`.

**Sideeffekter:**
- Varsel `SWAP_APPROVED` til den som opprettet forespørselen.
- Revisjonslogg med `SWAP_APPROVED`-handling.

---

### `POST /api/swap-requests/:id/reject`

Avvis en ventende vaktbytteforespørsel.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `id`      | path      | Ja      | SwapRequest-ID |

**Autentisering:** `x-current-user-id` header.

**Respons `200`:** Oppdatert SwapRequest med `status: "REJECTED"`.

**Forutsetning:** Status må være `PENDING`.

**Sideeffekter:**
- Varsel `SWAP_REJECTED` til den som opprettet forespørselen.
- Revisjonslogg med `SWAP_REJECTED`-handling.

---

### `POST /api/swap-requests/:id/execute`

Utfør et godkjent vaktbytte. Overfører vakten til den nye brukeren.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `id`      | path      | Ja      | SwapRequest-ID |

**Autentisering:** `x-current-user-id` header.

**Respons `200`:** Oppdatert SwapRequest med `status: "EXECUTED"`.

**Forutsetning:** Status må være `APPROVED`.

**Sideeffekter:**
- Oppdaterer `Shift.userId` til `toUserId` (selve vaktbyttet).
- Varsel `SWAP_EXECUTED` til begge brukere (fra og til).
- Revisjonslogg med `SWAP_EXECUTED`-handling.

---

### Statusflyt for vaktbytte

```
PENDING → APPROVED → EXECUTED
PENDING → REJECTED
```

---

## 7. Notater

### `GET /api/notes`

Hent notater for et team, valgfri filtrering på datoperiode.

| Parameter  | Plassering | Påkrevd | Beskrivelse |
|------------|-----------|---------|-------------|
| `teamId`   | query     | Ja      | Team-ID |
| `dateFrom` | query     | Nei     | Startdato (inklusiv) |
| `dateTo`   | query     | Nei     | Sluttdato (inklusiv) |

**Filtrering:** Notater med overlappende datoperiode returneres (`dateFrom ≤ dateTo` OG `dateTo ≥ dateFrom`).

**Respons `200`:**
```json
[
  {
    "id": "string",
    "teamId": "string",
    "createdByUserId": "string",
    "type": "string",
    "status": "PENDING | APPROVED | REJECTED",
    "title": "string | null",
    "body": "string",
    "dateFrom": "YYYY-MM-DD",
    "dateTo": "YYYY-MM-DD",
    "visibility": "ALL",
    "createdBy": { "id": "...", "name": "..." }
  }
]
```

---

### `POST /api/notes`

Opprett et notat.

| Parameter         | Plassering | Påkrevd | Beskrivelse |
|-------------------|-----------|---------|-------------|
| `teamId`          | body      | Ja      | Team-ID |
| `createdByUserId` | body      | Ja      | Bruker-ID |
| `type`            | body      | Ja      | Notattype (f.eks. `INFO`, `WARNING`) |
| `status`          | body      | Nei     | Status (default `PENDING`) |
| `title`           | body      | Nei     | Tittel |
| `body`            | body      | Ja      | Innhold |
| `dateFrom`        | body      | Ja      | Startdato `YYYY-MM-DD` |
| `dateTo`          | body      | Ja      | Sluttdato `YYYY-MM-DD` |

**Respons `200`:** Opprettet notatobjekt med `createdBy` inkludert.

**Sideeffekter:** Varsel `NOTE_CREATED` til oppretteren.

---

### `POST /api/notes/:id/approve`

Endre status på et notat (godkjenn eller avvis).

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `id`      | path      | Ja      | Notat-ID |
| `status`  | body      | Ja      | `APPROVED` eller `REJECTED` |

**Respons `200`:** Oppdatert notatobjekt.

**Sideeffekter:** Varsel `NOTE_STATUS_CHANGED` til den som opprettet notatet.

---

## 8. Varsler

### `GET /api/notifications`

Hent varsler for en bruker eller et team (siste 50).

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `userId`  | query     | Nei*    | Bruker-ID |
| `teamId`  | query     | Nei*    | Team-ID |

*Minst én av `userId` eller `teamId` er påkrevd.

**Respons `200`:**
```json
[
  {
    "id": "string",
    "teamId": "string",
    "userId": "string | null",
    "type": "string",
    "title": "string",
    "message": "string",
    "read": false,
    "createdAt": "ISO 8601"
  }
]
```

---

### `POST /api/notifications/:id/read`

Marker et varsel som lest.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `id`      | path      | Ja      | Varsel-ID |

**Respons `200`:** Oppdatert varselobjekt med `read: true`.

---

## 9. Varslingsinnstillinger per team

### `GET /api/notification-settings`

Hent varslingsinnstillinger for et team. Oppretter standardinnstillinger dersom de mangler.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `teamId`  | query     | Ja      | Team-ID |

**Respons `200`:**
```json
{
  "id": "string",
  "teamId": "string",
  "emailEnabled": true,
  "smsEndpoint": "string | null"
}
```

---

### `PUT /api/notification-settings`

Opprett eller oppdater varslingsinnstillinger for et team (upsert).

| Parameter      | Plassering | Påkrevd | Beskrivelse |
|----------------|-----------|---------|-------------|
| `teamId`       | body      | Ja      | Team-ID |
| `emailEnabled` | body      | Nei     | Aktiver e-postvarsling (default `true`) |
| `smsEndpoint`  | body      | Nei     | SMS-endepunkt (placeholder for fremtidig bruk) |

**Respons `200`:** Oppdatert innstillingsobjekt.

---

## 10. Varslingsinnstillinger per bruker

### `GET /api/users/:id/notification-preferences`

Hent varslingsvalg for en bruker. Oppretter standardverdier dersom de mangler.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `id`      | path      | Ja      | Bruker-ID |

**Respons `200`:**
```json
{
  "id": "string",
  "userId": "string",
  "shiftChangesEmail": true,
  "shiftChangesSms": false,
  "swapEmail": true,
  "swapSms": false,
  "noteEmail": true,
  "noteSms": false
}
```

---

### `PUT /api/users/:id/notification-preferences`

Oppdater varslingsvalg for en bruker (upsert).

| Parameter           | Plassering | Påkrevd | Beskrivelse |
|---------------------|-----------|---------|-------------|
| `id`                | path      | Ja      | Bruker-ID |
| `shiftChangesEmail` | body      | Nei     | Vaktendringer via e-post |
| `shiftChangesSms`   | body      | Nei     | Vaktendringer via SMS |
| `swapEmail`         | body      | Nei     | Vaktbytte via e-post |
| `swapSms`           | body      | Nei     | Vaktbytte via SMS |
| `noteEmail`         | body      | Nei     | Notater via e-post |
| `noteSms`           | body      | Nei     | Notater via SMS |

**Respons `200`:** Oppdatert innstillingsobjekt.

---

## 11. Admin – Brukere

> Alle endepunkter under `/api/admin/*` krever ADMIN-rolle via `requireAdmin`-middleware.

### `GET /api/admin/users`

Hent brukerliste med filtrering. Inkluderer teammedlemskap.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `teamId`  | query     | Nei     | Filtrer på team |
| `q`       | query     | Nei     | Søk i navn og e-post |
| `status`  | query     | Nei     | `active` eller `inactive` |

**Respons `200`:**
```json
[
  {
    "id": "string",
    "name": "string",
    "email": "string",
    "status": "active | inactive",
    "teams": [
      {
        "teamId": "string",
        "teamName": "string",
        "role": "LEADER | EMPLOYEE",
        "membershipId": "string"
      }
    ],
    "primaryTeam": { "id": "...", "name": "..." } | null,
    "createdAt": "ISO 8601",
    "lastLoginAt": "ISO 8601 | null"
  }
]
```

---

### `POST /api/admin/users`

Opprett ny bruker med teammedlemskap og revisjonslogg.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `name`    | body      | Ja      | Fullt navn |
| `email`   | body      | Ja      | E-postadresse (unik) |
| `teamId`  | body      | Ja      | Primært team-ID |
| `role`    | body      | Ja      | `ADMIN`, `LEADER` eller `EMPLOYEE` |

**Validering:** Zod-skjema (`createUserSchema`). E-post må være unik.

**Respons `200`:** Opprettet brukerobjekt.

**Sideeffekter:**
- Oppretter `TeamMembership` (rolle ADMIN → LEADER i medlemskap).
- Revisjonslogg med `USER_CREATED`-handling.

**Feilkoder:** `400` – ugyldig data · `404` – team ikke funnet · `409` – e-post allerede i bruk.

---

### `PATCH /api/admin/users/:id`

Aktiver eller deaktiver en bruker (soft status).

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `id`      | path      | Ja      | Bruker-ID |
| `status`  | body      | Ja      | `active` eller `inactive` |

**Validering:** Zod-skjema (`patchUserStatusSchema`).

**Respons `200`:** Oppdatert brukerobjekt.

**Sideeffekter:** Revisjonslogg med `USER_STATUS_CHANGED`-handling.

---

## 12. Admin – Teammedlemskap

### `POST /api/admin/teams/:teamId/members`

Legg til bruker i et team. Reaktiverer eksisterende inaktivt medlemskap.

| Parameter | Plassering | Påkrevd | Beskrivelse |
|-----------|-----------|---------|-------------|
| `teamId`  | path      | Ja      | Team-ID |
| `userId`  | body      | Ja      | Bruker-ID |
| `role`    | body      | Ja      | `LEADER` eller `EMPLOYEE` |

**Validering:** Zod-skjema (`addMemberSchema`).

**Respons `200`:** Opprettet eller reaktivert `TeamMembership` med team inkludert.

**Feilkoder:** `404` – team/bruker ikke funnet · `409` – bruker er allerede aktivt medlem.

**Sideeffekter:** Revisjonslogg med `MEMBER_ADDED`-handling.

---

### `PATCH /api/admin/teams/:teamId/members/:membershipId`

Oppdater rolle og/eller status for et teammedlemskap.

| Parameter      | Plassering | Påkrevd | Beskrivelse |
|----------------|-----------|---------|-------------|
| `teamId`       | path      | Ja      | Team-ID |
| `membershipId` | path      | Ja      | Medlemskap-ID |
| `role`         | body      | Nei     | Ny rolle |
| `status`       | body      | Nei     | Ny status |

**Validering:** Zod-skjema (`patchMembershipSchema`).

**Respons `200`:** Oppdatert `TeamMembership`.

**Sideeffekter:** Revisjonslogg med `MEMBERSHIP_UPDATED`-handling.

---

### `DELETE /api/admin/teams/:teamId/members/:membershipId`

Fjern bruker fra team (soft delete – setter status til `inactive`).

| Parameter      | Plassering | Påkrevd | Beskrivelse |
|----------------|-----------|---------|-------------|
| `teamId`       | path      | Ja      | Team-ID |
| `membershipId` | path      | Ja      | Medlemskap-ID |

**Respons `200`:** Oppdatert `TeamMembership` med `status: "inactive"`.

**Sideeffekter:** Revisjonslogg med `MEMBER_REMOVED`-handling.

---

## 13. Admin – Revisjonslogg

### `GET /api/admin/audit`

Hent revisjonslogg (siste 200 oppføringer). Kun ADMIN.

| Parameter    | Plassering | Påkrevd | Beskrivelse |
|--------------|-----------|---------|-------------|
| `entityType` | query     | Nei     | Filtrer på entitetstype (f.eks. `USER`, `TEAM_MEMBERSHIP`, `SWAP_REQUEST`) |
| `entityId`   | query     | Nei     | Filtrer på spesifikk entitet |

**Respons `200`:**
```json
[
  {
    "id": "string",
    "actorUserId": "string",
    "action": "string",
    "entityType": "string",
    "entityId": "string",
    "beforeJson": "string | null",
    "afterJson": "string | null",
    "createdAt": "ISO 8601"
  }
]
```

**Mulige handlinger:**
- `USER_CREATED`, `USER_STATUS_CHANGED`
- `MEMBER_ADDED`, `MEMBER_REMOVED`, `MEMBERSHIP_UPDATED`
- `SWAP_REQUESTED`, `SWAP_APPROVED`, `SWAP_REJECTED`, `SWAP_EXECUTED`

---

## 14. Feilhåndtering

Alle endepunkter returnerer feil på følgende format:

```json
{
  "error": "Feilmelding"
}
```

Valgfri `details`-felt for valideringsfeil (Zod):

```json
{
  "error": "Ugyldig data",
  "details": {
    "fieldErrors": { "email": ["Ugyldig e-post"] },
    "formErrors": []
  }
}
```

### Standard HTTP-statuskoder

| Kode | Betydning |
|------|-----------|
| `200` | Vellykket |
| `400` | Ugyldig forespørsel / manglende felt |
| `401` | Ikke autentisert |
| `403` | Ikke autorisert (feil rolle) |
| `404` | Ressurs ikke funnet |
| `409` | Konflikt (f.eks. duplikat e-post) |
| `500` | Intern serverfeil |

---

## 15. Autentisering og autorisasjon

### Mock-autentisering (utvikling)

Applikasjonen bruker mock-autentisering under utvikling:

- **Header:** `x-current-user-id` – brukes av `getCurrentUserId()` i leder/admin-endepunkter.
- **Body:** `currentUserId` – brukes i eldre endepunkter som `POST /api/teams`.

### Rollebasert tilgangskontroll

| Rolle      | Tilganger |
|------------|-----------|
| `EMPLOYEE` | Lese egne vakter, opprette vaktbytteforespørsler, lese varsler |
| `LEADER`   | Alt som EMPLOYEE + bulk-vaktoperasjoner, godkjenne/avvise vaktbytte |
| `ADMIN`    | Alt som LEADER + brukeradministrasjon, teamadministrasjon, revisjonslogg |

### Admin-endepunkter

Alle endepunkter under `/api/admin/*` bruker `requireAdmin`-middleware som:
1. Leser `x-current-user-id` fra header.
2. Henter brukeren fra databasen.
3. Verifiserer at rollen er `ADMIN`.
4. Returnerer `401`/`403` ved feil.

---

## Varslingstyper

Oversikt over alle varslingstyper som brukes i systemet:

| Type                 | Utløses av | Mottaker |
|----------------------|------------|----------|
| `SHIFT_CREATED`      | Ny vakt opprettet | Brukeren vakten gjelder |
| `SHIFT_UPDATED`      | Vakt oppdatert | Brukeren vakten gjelder |
| `SHIFT_DELETED`      | Vakt slettet | Brukeren vakten gjelder |
| `SWAP_REQUESTED`     | Ny vaktbytteforespørsel | Hele teamet |
| `SWAP_APPROVED`      | Vaktbytte godkjent | Den som opprettet forespørselen |
| `SWAP_REJECTED`      | Vaktbytte avvist | Den som opprettet forespørselen |
| `SWAP_EXECUTED`      | Vaktbytte utført | Begge brukere (fra og til) |
| `NOTE_CREATED`       | Nytt notat opprettet | Oppretteren |
| `NOTE_STATUS_CHANGED`| Notat godkjent/avvist | Oppretteren |
