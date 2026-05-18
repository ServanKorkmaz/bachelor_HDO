# Turnusmønster (rotation pattern) — design

Dato: 2026-05-18
Status: godkjent for implementasjon

## Kontekst

HDO-oppgaven krever eksplisitt at lederen skal kunne *«opprette
turnusplaner som gjentas etter faste intervaller»*. Dagens
implementasjon dekker enkeltvakter, vaktbytter og bulk-oppretting,
men har ingen lagret mal som auto-genererer fremover. Denne speccen
beskriver en minimal feature som dekker kravet uten å endre
eksisterende kode.

## Mål

- Lederen kan definere et N-ukers vaktmønster per ansatt (1-8 uker)
- Lederen kan generere reelle Shift-rader fra mønsteret K uker
  fremover (1-52 uker)
- Generering bruker eksisterende AML-validering, duplikat-håndtering,
  audit-log og notifikasjons-pipeline (gjenbruk av `createShift`)
- Konflikter (duplikat, AML-brudd, fravær) hoppes over og rapporteres
  per vakt — samme mønster som `/api/shifts/bulk`
- API-en er konsumerbar fra Android (samme REST-konvensjoner som
  resten av plattformen)

## Ikke-mål

- Faseforskjøvet delt mønster på tvers av ansatte (kunne vurderes
  senere)
- Tids-override per slot (slot bruker shift-typens default-tider)
- Kobling fra Shift tilbake til mønsteret (`sourcePatternId`)
- Endring av eksisterende tabeller eller services
- E2E-test (manuell browser-verifisering dekker behovet)

## Datamodell

Én ny tabell, null endringer på eksisterende:

```prisma
model RotationPattern {
  id        String   @id @default(cuid())
  teamId    String
  name      String
  weeks     Int                 // 1-8, antall uker i cycle
  /// JSON-array av slots:
  /// [{ userId, weekIndex, dayOfWeek, shiftTypeId }]
  /// weekIndex: 0-based (< weeks)
  /// dayOfWeek: 1=Mon ... 7=Sun (ISO 8601)
  slotsJson String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  @@map("rotation_patterns")
}
```

Begrunnelse for JSON-slots fremfor egen `RotationSlot`-tabell:

- Én tabell, én migrasjon, null endring på `User`/`ShiftType`-relasjoner
- 10 ansatte × 3 uker × 7 dager = 210 slots passer fint i ett JSON-felt
- Trade-off: ingen DB-level FK-integritet på slot-feltene; vi validerer
  ved skriving (batch-eksistenssjekk på userIds + shiftTypeIds)

## API

Fire endepunkter under `/api/rotation-patterns/`:

```
GET    /api/rotation-patterns?teamId=X     withAuth          → list patterns
POST   /api/rotation-patterns               withLeaderOrAdmin → create pattern
GET    /api/rotation-patterns/[id]          withAuth          → fetch one
PUT    /api/rotation-patterns/[id]          withLeaderOrAdmin → update pattern
DELETE /api/rotation-patterns/[id]          withLeaderOrAdmin → delete pattern
POST   /api/rotation-patterns/[id]/generate withLeaderOrAdmin → generate shifts
       body:    { startMonday: "2026-06-01", weeks: 4 }
       returns: { successes: [...], failures: [...] }
```

Lesetilgang er åpen for alle team-medlemmer (også ansatte) så Android
kan vise *«ditt mønster»*. Skriving er begrenset til LEADER + ADMIN
via `withLeaderOrAdmin`.

### Android-vennlig JSON-shape

- camelCase-felter (eksisterende konvensjon)
- ISO-datoer som strenger (`YYYY-MM-DD`), ingen DateTime-overraskelser
- `dayOfWeek` følger ISO 8601 (1=man, samme som Kotlin `DayOfWeek.value`)
- Generate-endepunktet returnerer `{successes, failures}` — samme shape
  som `/api/shifts/bulk`, så Android kan gjenbruke en eventuell parser

## Service-laget

Ny fil: `lib/services/rotation-service.ts`.

### CRUD-funksjoner

```ts
createPattern(input): Promise<RotationPattern>
listPatterns(teamId): Promise<RotationPattern[]>
getPattern(id): Promise<RotationPattern>      // 404 hvis ikke finnes
updatePattern(id, input): Promise<RotationPattern>
deletePattern(id, actorUserId): Promise<void>
```

Alle skrivinger:

1. Validerer slot-integritet (userId + shiftTypeId eksisterer, alle
   brukere er aktive team-medlemmer, ingen duplikat-tuple
   `(userId, weekIndex, dayOfWeek)`, `weekIndex < pattern.weeks`,
   `dayOfWeek ∈ [1,7]`) — batch-sjekk via to `findMany`
2. Skriver til DB
3. Skriver audit-log
   (`ROTATION_PATTERN_CREATED` / `_UPDATED` / `_DELETED`)
4. Returnerer den lagrede entiteten

### Generator-funksjonen

```ts
generateShifts({
  patternId,
  startMonday,    // YYYY-MM-DD, må være mandag
  weeks,          // 1-52
  actorUserId,
}): Promise<{
  successes: Array<{ userId, date, shiftId }>,
  failures:  Array<{ userId, date, error }>,
}>
```

Flyt:

1. Last mønsteret (404 hvis ikke finnes)
2. Valider at `startMonday` faktisk er mandag (Zod gjør format,
   service sjekker ukedag)
3. Pre-fetch alle shift-typer brukt i mønsteret (1 query)
4. For hver `generatedWeek` i `0..weeks-1`:
   - `cycleWeek = generatedWeek % pattern.weeks`
   - Filtrer slots til de med `weekIndex === cycleWeek`
   - For hver slot:
     - `actualDate = startMonday + generatedWeek*7 + (dayOfWeek-1) dager`
     - Kall eksisterende `createShift({ ... })` (håndterer AML,
       audit, notifikasjoner per vakt)
     - Fang `ServiceError` → push til `failures`
     - Suksess → push til `successes`
5. Skriv én ekstra `ROTATION_GENERATED` audit-entry med
   `{patternId, startMonday, weeks, generatedCount, failedCount}`
6. Returner `{ successes, failures }`

### Hvorfor gjenbruke `createShift()` direkte

`createShift` håndterer allerede AML §10-8-validering,
duplikat-håndtering, audit-log, notifikasjon og tid-validering.
Å duplisere dette i generatoren ville vært ~150 linjer testet
forretningslogikk vi allerede har. Gjenbruk = null risiko for at
AML-reglene divergerer.

N separate transaksjoner istedenfor én stor er bevisst: vi vil at
delvis suksess skal persisteres (skip+rapport). Alt-eller-ingenting
ville mistet 59 gode vakter for én AML-konflikt.

### Nye audit-actions

I `lib/admin/audit.ts`:

```ts
ROTATION_PATTERN_CREATED: 'ROTATION_PATTERN_CREATED',
ROTATION_PATTERN_UPDATED: 'ROTATION_PATTERN_UPDATED',
ROTATION_PATTERN_DELETED: 'ROTATION_PATTERN_DELETED',
ROTATION_GENERATED:       'ROTATION_GENERATED',
```

Og `AUDIT_ENTITY_TYPE.ROTATION_PATTERN = 'rotation_pattern'`.

## UI

Tre sider + to dialoger, alle under `/admin/rotations/*`.

### Integrasjon med eksisterende UX

- Eksisterende shadcn-komponenter: `Button`, `Input`, `Select`,
  `Dialog`, `Toast`, `Label`, `Tabs` — null nye avhengigheter
- `AdminLayout`-wrapperen håndterer tilgangskontroll (redirecter
  ikke-ADMIN/LEADER til `/standard`) — null ny tilgangslogikk
- Tabell-layout speiler `WeekGrid`-stilen (rader=uker, kolonner=man-søn)
- Norsk UI-tekst gjennom hele (ingen engelsk lekker ut)
- Mørk tema arvet fra eksisterende `globals.css`
- Lucide-ikoner (`Repeat`-ikon for sidebar-lenken)
- Toast-feedback ved suksess, dialog ved generering-resultat (matcher
  dagens mønster der `ShiftModal` bruker dialog for input og toast for
  bekreftelse)

### Liste-side `/admin/rotations`

Tabell med kolonner: Navn, Cycle, Antall ansatte, Handlinger
(`Rediger`, `Generer vakter`, `Slett`). Tomt-tilstand: *«Ingen
turnusmønstre opprettet ennå.»* «+ Nytt mønster»-knapp øverst til
høyre.

### Editor `/admin/rotations/new` og `/admin/rotations/[id]`

Form-felter for navn + cycle-lengde, multi-select for ansatte i
mønsteret. For hver valgt ansatt: tabs-basert grid-editor med rader=uker
og kolonner=ukedager. Hver celle = dropdown av shift-typer + `—` (ingen
vakt). `—` og `Fri` beholdes som to forskjellige valg: `—` betyr ingen
slot opprettes, `Fri` betyr eksplisitt fri-vakt registreres.

### Modal: «Generer vakter»

Trigges fra liste-siden. Felter: start-mandag (date input, valideres
mot ukedag), antall uker (1-52, default 4). Forhåndsvisnings-tekst
viser estimert antall vakter og datointerval. Submit kaller
`/generate`-endepunktet.

### Modal: Resultat etter generering

Vises etter generering. Suksess-teller øverst, deretter liste over
hoppede vakter med begrunnelse per linje. Knapper: `Lukk`,
`Gå til turnusoversikt` (lenker til `/standard`).

### Navigasjon

Lenke i admin-sidebaren under eksisterende admin-meny, samme nivå som
`/admin/users`, `/admin/shift-types`, `/admin/teams`.

## Testing

### Vitest (alle nye)

**1. `tests/lib/services/rotation-service.test.ts`** (~13-15 tester)

- `createPattern`: valid input; ukjent userId; ukjent shiftTypeId;
  bruker ikke i team; duplikat-tuple; `weekIndex >= weeks`
- `listPatterns`, `getPattern`, `updatePattern`, `deletePattern`:
  standardvarianter
- `generateShifts` (6-7 tester): 1-ukers cycle, N-ukers cycle med
  modulo (krysser cycle-grense), ikke-mandag avvist, skip ved
  duplikat, skip ved AML-konflikt, skip ved fravær, korrekt
  `{successes, failures}`-shape, skriver `ROTATION_GENERATED` audit

**2. `tests/api/rotation-patterns.route.test.ts`** (~10-12 tester)

Standardmønster fra eksisterende route-tester: 401 uten auth, 403 for
EMPLOYEE (på skriving), 200 happy, Zod 400 ved invalid body. Dekker
GET (liste + enkelt), POST, PUT, DELETE.

**3. `tests/api/rotation-patterns-generate.route.test.ts`** (~4-5 tester)

401, 403, 404 (mønster ikke funnet), 400 (ikke-mandag startMonday),
happy path med korrekt response-shape.

**Forventet test-tall etter implementasjon: 362-367** (335 + ~30 nye).

### Bevisst utelatt

- Ingen Playwright e2e for rotations (krever DB-oppsett, øker CI-tid).
  Eksisterende e2e-suite fokuserer på smoke + tilgjengelighet.
- Ingen komponent-test for editor. Form-state + dropdowns dekkes ikke
  isolert; route-tester dekker API-kontrakten.
- Ingen visuell regresjonstest. Manuell smoke i browser etter
  implementasjon.

### Manuell verifisering før commit

1. `npm test` — alle grønne (forventet 362-367)
2. `npx tsc --noEmit` — 0 feil
3. `npm run lint` — 0 warnings
4. `npm run db:migrate` lokalt — migrasjon kjører clean
5. Browser-test: lag mønster med 2 ansatte og 2-ukers cycle,
   generer 4 uker fremover, sjekk at vakter dukker opp i `/standard`,
   slett mønster, sjekk at vakter står igjen
6. Deploy migrasjon til Neon: `npx prisma migrate deploy`
7. Sjekk CI grønt på push

## Risiko

| Risiko | Sannsynlighet | Mitigation |
|---|---|---|
| Migrasjon feiler på Neon | Lav | Migrasjonen er bare `CREATE TABLE` + indexer, ingen endring av eksisterende. Testes lokalt først. |
| Generator-modulo har bug | Medium | Dedikert test for 1-ukers cycle og 3-ukers cycle som krysser grensen. |
| UI-editor blir tidkrevende | Medium | Strikt MVP-scope. Hvis vi sliter, fall-back på JSON-textarea (sparer 1-2 timer). |
| Eksisterende tester brekker | Veldig lav | Vi endrer ingen eksisterende kode. Kun additive. |
| Tids-overflow før innlevering | Medium | Estimert 6-8 timer fokusert. Hvis vi nærmer oss 10 timer uten å være ferdig, faller vi tilbake på «Further Work» i rapporten og dokumenterer hva som er bygget av infrastrukturen. |
