# Rotation Pattern (turnusmønster) — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementer turnusmønster-feature som dekker HDO-oppgavens krav om at lederen skal kunne *«opprette turnusplaner som gjentas etter faste intervaller»*.

**Architecture:** Én ny `RotationPattern`-tabell (slots i JSON-felt). En `rotation-service` med CRUD + `generateShifts` som looper mønsteret N uker fremover via modulo og delegerer hver vakt til eksisterende `createShift()`. Tre API-ruter under `/api/rotation-patterns`. UI under `/admin/rotations` med tabs-basert editor per ansatt.

**Tech Stack:** Next.js 14 App Router, Prisma, PostgreSQL (Neon), Zod, vitest, React + shadcn UI.

**Spec reference:** `specs/2026-05-18-rotation-pattern.md`

---

## Filstruktur

**Nye filer:**

- `prisma/migrations/<timestamp>_add_rotation_patterns/migration.sql` (auto-generert)
- `lib/validation/rotation-schemas.ts` — Zod input-validering
- `lib/services/rotation-service.ts` — CRUD + generateShifts
- `app/api/rotation-patterns/route.ts` — GET (list) + POST (create)
- `app/api/rotation-patterns/[id]/route.ts` — GET + PUT + DELETE
- `app/api/rotation-patterns/[id]/generate/route.ts` — POST (generate)
- `app/(app)/admin/rotations/page.tsx` — liste-side
- `app/(app)/admin/rotations/new/page.tsx` — opprett-side
- `app/(app)/admin/rotations/[id]/page.tsx` — rediger-side (med generate-knapp)
- `components/admin/RotationEditor.tsx` — felles editor (brukes av new + edit)
- `components/admin/GenerateShiftsDialog.tsx` — start-mandag + uker-input
- `components/admin/GenerateResultDialog.tsx` — viser successes + failures
- `tests/lib/rotation-schemas.test.ts`
- `tests/lib/services/rotation-service.test.ts`
- `tests/api/rotation-patterns.route.test.ts`
- `tests/api/rotation-patterns-generate.route.test.ts`

**Modifiserte filer:**

- `prisma/schema.prisma` — legge til `RotationPattern` + relasjon på `Team`
- `lib/admin/audit.ts` — legge til 4 nye AUDIT_ACTION + 1 ny AUDIT_ENTITY_TYPE
- `lib/security/rateLimitConfigs.ts` — legge til `rotationGenerate`-limit
- `app/(app)/admin/page.tsx` — legge til kort for «Turnusmønstre»

---

## Task 1: Skjema + lokal migrasjon

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_rotation_patterns/migration.sql` (auto-generated)

- [ ] **Step 1: Add RotationPattern model to schema**

Edit `prisma/schema.prisma`. Find the `Team` model and add `rotationPatterns RotationPattern[]` to its relations:

```prisma
model Team {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users                User[]
  memberships          TeamMembership[]
  shifts               Shift[]
  notes                Note[]
  swapRequests         SwapRequest[]
  notifications        Notification[]
  holidayRequests      HolidayRequest[]
  notificationSettings NotificationSettings?
  weekNotes            WeekNote[]
  rotationPatterns     RotationPattern[]

  @@map("teams")
}
```

Then add the new model at the bottom of the file (after `WeekNote`):

```prisma
model RotationPattern {
  id        String   @id @default(cuid())
  teamId    String
  name      String
  /// Number of weeks in the rotation cycle (1-8). Validated at the
  /// API boundary via Zod; this comment documents the intent.
  weeks     Int
  /// JSON array of slots. Shape:
  ///   [{ userId, weekIndex, dayOfWeek, shiftTypeId }]
  /// - weekIndex: 0-based (< weeks)
  /// - dayOfWeek: 1=Mon ... 7=Sun (ISO 8601)
  /// Slot integrity (user/shift type existence, team membership) is
  /// validated by the service at write time.
  slotsJson String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
  @@map("rotation_patterns")
}
```

- [ ] **Step 2: Generate migration and apply locally**

Run: `npx prisma migrate dev --name add_rotation_patterns`

Expected: Prisma creates a new directory under `prisma/migrations/` with a `migration.sql` that contains `CREATE TABLE "rotation_patterns"`. The migration applies to the local DB and Prisma Client regenerates.

- [ ] **Step 3: Verify type generation works**

Run: `npx tsc --noEmit`

Expected: 0 errors. `prisma.rotationPattern` is now a typed property on the Prisma client.

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm test`

Expected: 335/335 passing (no behavior change yet, just schema).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add RotationPattern model for shift rotation feature"
```

---

## Task 2: Audit-konstanter

**Files:**
- Modify: `lib/admin/audit.ts`

- [ ] **Step 1: Add new entity type and actions**

Edit `lib/admin/audit.ts`. Inside `AUDIT_ENTITY_TYPE` add:

```typescript
  ROTATION_PATTERN: 'rotation_pattern',
```

Inside `AUDIT_ACTION` add (after `HOLIDAY_REVOKED`):

```typescript
  ROTATION_PATTERN_CREATED: 'ROTATION_PATTERN_CREATED',
  ROTATION_PATTERN_UPDATED: 'ROTATION_PATTERN_UPDATED',
  ROTATION_PATTERN_DELETED: 'ROTATION_PATTERN_DELETED',
  ROTATION_GENERATED:       'ROTATION_GENERATED',
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/admin/audit.ts
git commit -m "feat(audit): add rotation pattern action + entity constants"
```

---

## Task 3: Zod-skjema for rotasjon-input

**Files:**
- Create: `lib/validation/rotation-schemas.ts`
- Create: `tests/lib/rotation-schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/rotation-schemas.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  rotationPatternCreateSchema,
  rotationPatternUpdateSchema,
  rotationGenerateSchema,
} from '@/lib/validation/rotation-schemas'

describe('rotationPatternCreateSchema', () => {
  const validSlot = { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' }

  it('accepts a well-formed payload', () => {
    const r = rotationPatternCreateSchema.safeParse({
      teamId: 'team-1',
      name: 'Helse 3-ukers',
      weeks: 3,
      slots: [validSlot],
    })
    expect(r.success).toBe(true)
  })

  it('rejects weeks outside 1-8', () => {
    const tooMany = rotationPatternCreateSchema.safeParse({
      teamId: 'team-1', name: 'X', weeks: 9, slots: [],
    })
    expect(tooMany.success).toBe(false)

    const tooFew = rotationPatternCreateSchema.safeParse({
      teamId: 'team-1', name: 'X', weeks: 0, slots: [],
    })
    expect(tooFew.success).toBe(false)
  })

  it('rejects empty name', () => {
    const r = rotationPatternCreateSchema.safeParse({
      teamId: 'team-1', name: '', weeks: 1, slots: [],
    })
    expect(r.success).toBe(false)
  })

  it('rejects slot with dayOfWeek outside 1-7', () => {
    const r = rotationPatternCreateSchema.safeParse({
      teamId: 'team-1', name: 'X', weeks: 1,
      slots: [{ ...validSlot, dayOfWeek: 8 }],
    })
    expect(r.success).toBe(false)
  })

  it('rejects slot with negative weekIndex', () => {
    const r = rotationPatternCreateSchema.safeParse({
      teamId: 'team-1', name: 'X', weeks: 1,
      slots: [{ ...validSlot, weekIndex: -1 }],
    })
    expect(r.success).toBe(false)
  })
})

describe('rotationGenerateSchema', () => {
  it('accepts well-formed payload', () => {
    const r = rotationGenerateSchema.safeParse({
      startMonday: '2026-06-01', weeks: 4,
    })
    expect(r.success).toBe(true)
  })

  it('rejects invalid date format', () => {
    const r = rotationGenerateSchema.safeParse({
      startMonday: '01-06-2026', weeks: 4,
    })
    expect(r.success).toBe(false)
  })

  it('rejects weeks outside 1-52', () => {
    expect(rotationGenerateSchema.safeParse({
      startMonday: '2026-06-01', weeks: 0,
    }).success).toBe(false)
    expect(rotationGenerateSchema.safeParse({
      startMonday: '2026-06-01', weeks: 53,
    }).success).toBe(false)
  })
})

describe('rotationPatternUpdateSchema', () => {
  it('accepts the same shape as create (no id field)', () => {
    const r = rotationPatternUpdateSchema.safeParse({
      teamId: 'team-1', name: 'Updated', weeks: 2,
      slots: [{ userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' }],
    })
    expect(r.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/rotation-schemas.test.ts`

Expected: FAIL with "Cannot find module '@/lib/validation/rotation-schemas'".

- [ ] **Step 3: Write the implementation**

Create `lib/validation/rotation-schemas.ts`:

```typescript
import { z } from 'zod'
import { parse, isValid } from 'date-fns'

const id = z.string().min(1)

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ugyldig dato (YYYY-MM-DD)')
  .refine((s) => isValid(parse(s, 'yyyy-MM-dd', new Date())), 'Ugyldig dato')

/** One row in the pattern grid: assigns a shift type to (employee, week, day). */
const rotationSlotSchema = z.object({
  userId: id,
  weekIndex: z.number().int().min(0).max(7),     // < weeks; refined per-pattern below
  dayOfWeek: z.number().int().min(1).max(7),     // ISO 8601
  shiftTypeId: id,
})

const baseRotationPatternSchema = z.object({
  teamId: id,
  name: z.string().min(1, 'Navn er påkrevd').max(100),
  weeks: z.number().int().min(1).max(8),
  slots: z.array(rotationSlotSchema).max(500),   // generous cap for 10 emp x 8 wks x 7 days
})

/**
 * Cross-field check: every slot's weekIndex must be < weeks.
 * Zod runs object refinements after the inner schemas, so by here the
 * slot array has been validated for type/shape; we only check bounds.
 */
function refinePattern<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine(
    (d: { weeks: number; slots: Array<{ weekIndex: number }> }) =>
      d.slots.every((s) => s.weekIndex < d.weeks),
    { message: 'weekIndex må være mindre enn weeks', path: ['slots'] }
  )
}

export const rotationPatternCreateSchema = refinePattern(baseRotationPatternSchema)
export const rotationPatternUpdateSchema = refinePattern(baseRotationPatternSchema)

export const rotationGenerateSchema = z.object({
  startMonday: dateString,
  weeks: z.number().int().min(1).max(52),
})

export type RotationSlot = z.infer<typeof rotationSlotSchema>
export type RotationPatternCreateBody = z.infer<typeof rotationPatternCreateSchema>
export type RotationPatternUpdateBody = z.infer<typeof rotationPatternUpdateSchema>
export type RotationGenerateBody = z.infer<typeof rotationGenerateSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/rotation-schemas.test.ts`

Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add lib/validation/rotation-schemas.ts tests/lib/rotation-schemas.test.ts
git commit -m "feat(validation): add Zod schemas for rotation pattern + generate input"
```

---

## Task 4: rotation-service CRUD

**Files:**
- Create: `lib/services/rotation-service.ts`
- Create: `tests/lib/services/rotation-service.test.ts`

- [ ] **Step 1: Write the failing CRUD tests**

Create `tests/lib/services/rotation-service.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    rotationPattern: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: { findMany: vi.fn() },
    shiftType: { findMany: vi.fn() },
    teamMembership: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import {
  createPattern,
  listPatterns,
  getPattern,
  updatePattern,
  deletePattern,
} from '@/lib/services/rotation-service'
import { ServiceError } from '@/lib/services/errors'

const validInput = {
  teamId: 'team-1',
  name: 'Helse 3-ukers',
  weeks: 1,
  slots: [
    { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
  ],
  actorUserId: 'admin-1',
}

describe('createPattern', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }])
    mockPrisma.shiftType.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.teamMembership.findMany.mockResolvedValue([
      { userId: 'u1', teamId: 'team-1', status: 'active' },
    ])
    mockPrisma.rotationPattern.create.mockResolvedValue({
      id: 'rp-1', ...validInput, slotsJson: JSON.stringify(validInput.slots),
    })
  })

  it('creates a pattern and writes an audit entry', async () => {
    const pattern = await createPattern(validInput)
    expect(pattern.id).toBe('rp-1')
    expect(mockPrisma.rotationPattern.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'ROTATION_PATTERN_CREATED',
          entityType: 'rotation_pattern',
          entityId: 'rp-1',
        }),
      }),
    )
  })

  it('rejects unknown userId in slots', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])  // no users found
    await expect(createPattern(validInput)).rejects.toThrow(ServiceError)
    expect(mockPrisma.rotationPattern.create).not.toHaveBeenCalled()
  })

  it('rejects unknown shiftTypeId in slots', async () => {
    mockPrisma.shiftType.findMany.mockResolvedValue([])
    await expect(createPattern(validInput)).rejects.toThrow(ServiceError)
  })

  it('rejects user not active in team', async () => {
    mockPrisma.teamMembership.findMany.mockResolvedValue([])
    await expect(createPattern(validInput)).rejects.toThrow(ServiceError)
  })

  it('rejects duplicate (userId, weekIndex, dayOfWeek) tuple', async () => {
    const dup = {
      ...validInput,
      slots: [
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
      ],
    }
    await expect(createPattern(dup)).rejects.toThrow(ServiceError)
  })
})

describe('listPatterns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns patterns for the team', async () => {
    mockPrisma.rotationPattern.findMany.mockResolvedValue([
      { id: 'rp-1', teamId: 'team-1', name: 'A', weeks: 1, slotsJson: '[]' },
    ])
    const result = await listPatterns('team-1')
    expect(result).toHaveLength(1)
    expect(mockPrisma.rotationPattern.findMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('getPattern', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the pattern when found', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 't', name: 'X', weeks: 1, slotsJson: '[]',
    })
    const p = await getPattern('rp-1')
    expect(p.id).toBe('rp-1')
  })

  it('throws 404 ServiceError when not found', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue(null)
    await expect(getPattern('missing')).rejects.toMatchObject({
      code: 'ROTATION_PATTERN_NOT_FOUND',
      status: 404,
    })
  })
})

describe('updatePattern', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }])
    mockPrisma.shiftType.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.teamMembership.findMany.mockResolvedValue([
      { userId: 'u1', teamId: 'team-1', status: 'active' },
    ])
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'Old', weeks: 1, slotsJson: '[]',
    })
    mockPrisma.rotationPattern.update.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'Helse 3-ukers', weeks: 1,
      slotsJson: JSON.stringify(validInput.slots),
    })
  })

  it('updates and writes an audit entry with before/after', async () => {
    await updatePattern('rp-1', validInput)
    expect(mockPrisma.rotationPattern.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ROTATION_PATTERN_UPDATED',
          beforeJson: expect.stringContaining('"name":"Old"'),
          afterJson: expect.stringContaining('"name":"Helse 3-ukers"'),
        }),
      }),
    )
  })
})

describe('deletePattern', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })
  })

  it('deletes the pattern and writes an audit entry', async () => {
    await deletePattern('rp-1', 'admin-1')
    expect(mockPrisma.rotationPattern.delete).toHaveBeenCalledWith({ where: { id: 'rp-1' } })
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'ROTATION_PATTERN_DELETED',
          entityType: 'rotation_pattern',
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/services/rotation-service.test.ts`

Expected: FAIL with "Cannot find module '@/lib/services/rotation-service'".

- [ ] **Step 3: Write the CRUD implementation**

Create `lib/services/rotation-service.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'
import { ServiceError } from './errors'
import type {
  RotationPatternCreateBody,
  RotationPatternUpdateBody,
  RotationSlot,
} from '@/lib/validation/rotation-schemas'

export interface RotationPatternRow {
  id: string
  teamId: string
  name: string
  weeks: number
  slotsJson: string
  createdAt: Date
  updatedAt: Date
}

interface ServiceInput {
  actorUserId: string
}

/**
 * Validate slot integrity. Run inside the same transaction as the write so
 * a race condition (user deactivated between check and write) cannot pass.
 */
async function assertSlotsValid(
  tx: typeof prisma,
  teamId: string,
  slots: RotationSlot[]
): Promise<void> {
  // Duplicate (userId, weekIndex, dayOfWeek) tuples within a pattern would
  // mean assigning two shifts to one person on the same day in the cycle.
  const seen = new Set<string>()
  for (const slot of slots) {
    const key = `${slot.userId}|${slot.weekIndex}|${slot.dayOfWeek}`
    if (seen.has(key)) {
      throw new ServiceError(
        'DUPLICATE_SLOT',
        `Duplikat slot for samme bruker på samme dag i cycle`,
        400
      )
    }
    seen.add(key)
  }

  const userIds = Array.from(new Set(slots.map((s) => s.userId)))
  const shiftTypeIds = Array.from(new Set(slots.map((s) => s.shiftTypeId)))

  if (userIds.length > 0) {
    const users = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    })
    if (users.length !== userIds.length) {
      throw new ServiceError('USER_NOT_FOUND', 'En eller flere ansatte finnes ikke', 400)
    }

    const memberships = await tx.teamMembership.findMany({
      where: { userId: { in: userIds }, teamId, status: 'active' },
      select: { userId: true },
    })
    if (memberships.length !== userIds.length) {
      throw new ServiceError(
        'USER_NOT_TEAM_MEMBER',
        'En eller flere ansatte er ikke aktive medlemmer av teamet',
        400
      )
    }
  }

  if (shiftTypeIds.length > 0) {
    const types = await tx.shiftType.findMany({
      where: { id: { in: shiftTypeIds } },
      select: { id: true },
    })
    if (types.length !== shiftTypeIds.length) {
      throw new ServiceError('SHIFT_TYPE_NOT_FOUND', 'En eller flere vakttyper finnes ikke', 400)
    }
  }
}

export async function createPattern(
  input: RotationPatternCreateBody & ServiceInput
): Promise<RotationPatternRow> {
  return prisma.$transaction(async (tx) => {
    await assertSlotsValid(tx as typeof prisma, input.teamId, input.slots)

    const created = await tx.rotationPattern.create({
      data: {
        teamId: input.teamId,
        name: input.name,
        weeks: input.weeks,
        slotsJson: JSON.stringify(input.slots),
      },
    })

    await createAuditLog(tx, {
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.ROTATION_PATTERN_CREATED,
      entityType: AUDIT_ENTITY_TYPE.ROTATION_PATTERN,
      entityId: created.id,
      beforeJson: null,
      afterJson: JSON.stringify({
        teamId: created.teamId,
        name: created.name,
        weeks: created.weeks,
        slotCount: input.slots.length,
      }),
    })

    return created
  })
}

export async function listPatterns(teamId: string): Promise<RotationPatternRow[]> {
  return prisma.rotationPattern.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getPattern(id: string): Promise<RotationPatternRow> {
  const pattern = await prisma.rotationPattern.findUnique({ where: { id } })
  if (!pattern) {
    throw new ServiceError('ROTATION_PATTERN_NOT_FOUND', 'Turnusmønster ikke funnet', 404)
  }
  return pattern
}

export async function updatePattern(
  id: string,
  input: RotationPatternUpdateBody & ServiceInput
): Promise<RotationPatternRow> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.rotationPattern.findUnique({ where: { id } })
    if (!existing) {
      throw new ServiceError('ROTATION_PATTERN_NOT_FOUND', 'Turnusmønster ikke funnet', 404)
    }

    await assertSlotsValid(tx as typeof prisma, input.teamId, input.slots)

    const updated = await tx.rotationPattern.update({
      where: { id },
      data: {
        teamId: input.teamId,
        name: input.name,
        weeks: input.weeks,
        slotsJson: JSON.stringify(input.slots),
      },
    })

    await createAuditLog(tx, {
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.ROTATION_PATTERN_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.ROTATION_PATTERN,
      entityId: id,
      beforeJson: JSON.stringify({
        teamId: existing.teamId,
        name: existing.name,
        weeks: existing.weeks,
      }),
      afterJson: JSON.stringify({
        teamId: updated.teamId,
        name: updated.name,
        weeks: updated.weeks,
        slotCount: input.slots.length,
      }),
    })

    return updated
  })
}

export async function deletePattern(id: string, actorUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.rotationPattern.findUnique({ where: { id } })
    if (!existing) {
      throw new ServiceError('ROTATION_PATTERN_NOT_FOUND', 'Turnusmønster ikke funnet', 404)
    }

    await tx.rotationPattern.delete({ where: { id } })

    await createAuditLog(tx, {
      actorUserId,
      action: AUDIT_ACTION.ROTATION_PATTERN_DELETED,
      entityType: AUDIT_ENTITY_TYPE.ROTATION_PATTERN,
      entityId: id,
      beforeJson: JSON.stringify({
        teamId: existing.teamId,
        name: existing.name,
        weeks: existing.weeks,
      }),
      afterJson: null,
    })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/services/rotation-service.test.ts`

Expected: all CRUD tests pass. `generateShifts` test (added in Task 5) is not yet present.

- [ ] **Step 5: Commit**

```bash
git add lib/services/rotation-service.ts tests/lib/services/rotation-service.test.ts
git commit -m "feat(rotation): add CRUD service for rotation patterns"
```

---

## Task 5: generateShifts i rotation-service

**Files:**
- Modify: `lib/services/rotation-service.ts`
- Modify: `tests/lib/services/rotation-service.test.ts`

- [ ] **Step 1: Add generateShifts tests**

Append to `tests/lib/services/rotation-service.test.ts`:

```typescript
import { generateShifts } from '@/lib/services/rotation-service'

// Mock createShift so we don't have to set up the full Shift flow.
vi.mock('@/lib/services/shift-service', () => ({
  createShift: vi.fn(),
}))

import { createShift } from '@/lib/services/shift-service'

describe('generateShifts', () => {
  const monday = '2026-06-01' // verified: this is a Monday

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.shiftType.findMany.mockResolvedValue([
      { id: 't1', code: 'Dag', defaultStartTime: '08:00', defaultEndTime: '16:00', crossesMidnight: false },
    ])
    ;(createShift as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: { userId: string; date: string }) => ({ id: `s-${args.userId}-${args.date}` })
    )
  })

  it('rejects a startMonday that is not a Monday', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })

    await expect(
      generateShifts({
        patternId: 'rp-1',
        startMonday: '2026-06-02', // Tuesday
        weeks: 1,
        actorUserId: 'admin-1',
      })
    ).rejects.toMatchObject({ code: 'NOT_A_MONDAY', status: 400 })
  })

  it('generates 1 shift per slot for a 1-week cycle over 1 week', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u1', weekIndex: 0, dayOfWeek: 3, shiftTypeId: 't1' },
      ]),
    })

    const result = await generateShifts({
      patternId: 'rp-1', startMonday: monday, weeks: 1, actorUserId: 'admin-1',
    })

    expect(result.successes).toHaveLength(2)
    expect(result.failures).toHaveLength(0)
    expect(createShift).toHaveBeenCalledTimes(2)
  })

  it('cycles correctly via modulo for a 3-week pattern over 6 weeks', async () => {
    // Pattern has 3 slots, one per week, all on Monday.
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 3,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u1', weekIndex: 1, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u1', weekIndex: 2, dayOfWeek: 1, shiftTypeId: 't1' },
      ]),
    })

    const result = await generateShifts({
      patternId: 'rp-1', startMonday: monday, weeks: 6, actorUserId: 'admin-1',
    })

    // 6 weeks × 1 slot per cycle-week = 6 shifts
    expect(result.successes).toHaveLength(6)
    expect(createShift).toHaveBeenCalledTimes(6)
    // Verify dates land on consecutive Mondays
    const dates = (createShift as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: [{ date: string }]) => c[0].date
    )
    expect(dates).toEqual([
      '2026-06-01', '2026-06-08', '2026-06-15',
      '2026-06-22', '2026-06-29', '2026-07-06',
    ])
  })

  it('reports failures from createShift without aborting other slots', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u2', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
      ]),
    })

    ;(createShift as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new ServiceError('DUPLICATE_SHIFT', 'Brukeren har allerede en vakt', 409)
    })
    ;(createShift as ReturnType<typeof vi.fn>).mockImplementationOnce(async (args: { userId: string; date: string }) => ({
      id: `s-${args.userId}-${args.date}`,
    }))

    const result = await generateShifts({
      patternId: 'rp-1', startMonday: monday, weeks: 1, actorUserId: 'admin-1',
    })

    expect(result.successes).toHaveLength(1)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].error).toMatch(/allerede/)
  })

  it('writes a ROTATION_GENERATED audit summary entry', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
      ]),
    })

    await generateShifts({
      patternId: 'rp-1', startMonday: monday, weeks: 1, actorUserId: 'admin-1',
    })

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ROTATION_GENERATED',
          entityType: 'rotation_pattern',
          entityId: 'rp-1',
          afterJson: expect.stringContaining('"generatedCount":1'),
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/services/rotation-service.test.ts`

Expected: 5 new tests FAIL (rest from Task 4 still pass).

- [ ] **Step 3: Implement generateShifts**

Append to `lib/services/rotation-service.ts`:

```typescript
import { addDays, parse, getISODay } from 'date-fns'
import { createShift } from './shift-service'
import type { ShiftType } from '@prisma/client'

interface GenerateInput {
  patternId: string
  startMonday: string
  weeks: number
  actorUserId: string
}

interface GenerateResult {
  successes: Array<{ userId: string; date: string; shiftId: string }>
  failures: Array<{ userId: string; date: string; error: string }>
}

/**
 * Generate concrete shifts from a stored pattern by looping `weeks` weeks
 * forward starting on `startMonday`. Each generated week N uses the pattern
 * slots with weekIndex === (N % pattern.weeks), giving the rotation effect.
 *
 * Each shift is created via the standard `createShift()` so AML validation,
 * audit-log writes (`SHIFT_CREATED`), duplicate handling and notifications
 * all reuse the existing pipeline. Failures are collected per-slot
 * (skip + report) — they do NOT roll back successful shifts.
 *
 * One additional `ROTATION_GENERATED` audit entry summarises the batch.
 */
export async function generateShifts(input: GenerateInput): Promise<GenerateResult> {
  const pattern = await getPattern(input.patternId)

  const startDate = parse(input.startMonday, 'yyyy-MM-dd', new Date())
  if (getISODay(startDate) !== 1) {
    throw new ServiceError('NOT_A_MONDAY', 'Startdatoen må være en mandag', 400)
  }

  const slots: RotationSlot[] = JSON.parse(pattern.slotsJson)

  // Pre-fetch shift types once so per-slot processing doesn't N+1.
  const shiftTypeIds = Array.from(new Set(slots.map((s) => s.shiftTypeId)))
  const shiftTypes = shiftTypeIds.length > 0
    ? await prisma.shiftType.findMany({ where: { id: { in: shiftTypeIds } } })
    : []
  const shiftTypeMap = new Map<string, ShiftType>(shiftTypes.map((st) => [st.id, st]))

  const successes: GenerateResult['successes'] = []
  const failures:  GenerateResult['failures']  = []

  for (let weekN = 0; weekN < input.weeks; weekN++) {
    const cycleWeek = weekN % pattern.weeks
    const slotsThisWeek = slots.filter((s) => s.weekIndex === cycleWeek)

    for (const slot of slotsThisWeek) {
      const actualDate = addDays(startDate, weekN * 7 + (slot.dayOfWeek - 1))
      const dateStr = actualDate.toISOString().slice(0, 10)
      const shiftType = shiftTypeMap.get(slot.shiftTypeId)
      if (!shiftType) {
        failures.push({ userId: slot.userId, date: dateStr, error: 'Vakttype mangler' })
        continue
      }

      try {
        const shift = await createShift({
          teamId: pattern.teamId,
          userId: slot.userId,
          actorUserId: input.actorUserId,
          date: dateStr,
          shiftTypeId: slot.shiftTypeId,
          startTime: shiftType.defaultStartTime,
          endTime: shiftType.defaultEndTime,
          comment: null,
          shiftType,
        })
        successes.push({ userId: slot.userId, date: dateStr, shiftId: shift.id })
      } catch (e) {
        if (e instanceof ServiceError) {
          failures.push({ userId: slot.userId, date: dateStr, error: e.message })
        } else {
          throw e
        }
      }
    }
  }

  // Summary audit entry (per-shift SHIFT_CREATED entries already written by createShift).
  await createAuditLog(prisma as Parameters<typeof createAuditLog>[0], {
    actorUserId: input.actorUserId,
    action: AUDIT_ACTION.ROTATION_GENERATED,
    entityType: AUDIT_ENTITY_TYPE.ROTATION_PATTERN,
    entityId: pattern.id,
    beforeJson: null,
    afterJson: JSON.stringify({
      startMonday: input.startMonday,
      weeks: input.weeks,
      generatedCount: successes.length,
      failedCount: failures.length,
    }),
  })

  return { successes, failures }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/services/rotation-service.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/rotation-service.ts tests/lib/services/rotation-service.test.ts
git commit -m "feat(rotation): add generateShifts to produce shifts from a pattern"
```

---

## Task 6: API-rute for list + create

**Files:**
- Create: `app/api/rotation-patterns/route.ts`
- Create: `tests/api/rotation-patterns.route.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `tests/api/rotation-patterns.route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    teamMembership: { findFirst: vi.fn(), findMany: vi.fn() },
    rotationPattern: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    shiftType: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, POST } from '@/app/api/rotation-patterns/route'

function makeGet(params: Record<string, string> = {}, userId?: string): Request {
  const url = new URL('http://localhost/api/rotation-patterns')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/rotation-patterns', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

const LEADER = { id: 'leader-1', role: 'LEADER' }

describe('GET /api/rotation-patterns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const res = await GET(makeGet({ teamId: 'team-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when teamId is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    const res = await GET(makeGet({}, 'leader-1'))
    expect(res.status).toBe(400)
  })

  it('returns list of patterns for an authenticated team member', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    mockPrisma.rotationPattern.findMany.mockResolvedValue([
      { id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]' },
    ])
    const res = await GET(makeGet({ teamId: 'team-1' }, 'leader-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })
})

describe('POST /api/rotation-patterns', () => {
  const validBody = {
    teamId: 'team-1',
    name: 'Helse 3-ukers',
    weeks: 1,
    slots: [{ userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma)
    )
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }])
    mockPrisma.shiftType.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.teamMembership.findMany.mockResolvedValue([
      { userId: 'u1', teamId: 'team-1', status: 'active' },
    ])
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    mockPrisma.rotationPattern.create.mockResolvedValue({
      id: 'rp-1', ...validBody, slotsJson: JSON.stringify(validBody.slots),
    })
  })

  it('returns 401 when not authenticated', async () => {
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 403 for an EMPLOYEE caller', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE' })
    const res = await POST(makePost(validBody, 'emp-1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid body', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    const res = await POST(makePost({ teamId: 'team-1' }, 'leader-1'))
    expect(res.status).toBe(400)
  })

  it('creates pattern for LEADER and returns 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    const res = await POST(makePost(validBody, 'leader-1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.rotationPattern.create).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/rotation-patterns.route.test.ts`

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the route**

Create `app/api/rotation-patterns/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { assertTeamMember, withAuth, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { rotationPatternCreateSchema } from '@/lib/validation/rotation-schemas'
import { createPattern, listPatterns } from '@/lib/services/rotation-service'
import { ServiceError } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request, ctx) => {
  const { searchParams } = new URL(request.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
  }

  const forbidden = await assertTeamMember(ctx, teamId)
  if (forbidden) return forbidden

  const patterns = await listPatterns(teamId)
  return NextResponse.json(patterns)
})

export const POST = withLeaderOrAdmin(async (request, ctx) => {
  const parsed = await parseJsonBody(request, rotationPatternCreateSchema)
  if ('error' in parsed) return parsed.error

  const forbidden = await assertTeamMember(ctx, parsed.data.teamId, ['ADMIN', 'LEADER'])
  if (forbidden) return forbidden

  try {
    const pattern = await createPattern({ ...parsed.data, actorUserId: ctx.userId })
    return NextResponse.json(pattern)
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/rotation-patterns.route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/rotation-patterns/route.ts tests/api/rotation-patterns.route.test.ts
git commit -m "feat(api): GET (list) + POST (create) /api/rotation-patterns"
```

---

## Task 7: API-rute for [id] (GET/PUT/DELETE)

**Files:**
- Create: `app/api/rotation-patterns/[id]/route.ts`
- Modify: `tests/api/rotation-patterns.route.test.ts`

- [ ] **Step 1: Append failing tests for `[id]` route**

Append to `tests/api/rotation-patterns.route.test.ts`:

```typescript
import {
  GET as getOne,
  PUT,
  DELETE,
} from '@/app/api/rotation-patterns/[id]/route'

const params = { id: 'rp-1' }

describe('GET /api/rotation-patterns/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
  })

  it('returns 404 when pattern does not exist', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue(null)
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      headers: { 'x-current-user-id': 'leader-1' },
    })
    const res = await getOne(req, { params })
    expect(res.status).toBe(404)
  })

  it('returns the pattern when found', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      headers: { 'x-current-user-id': 'leader-1' },
    })
    const res = await getOne(req, { params })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/rotation-patterns/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma)
    )
  })

  it('returns 403 for EMPLOYEE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE' })
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      method: 'DELETE',
      headers: { 'x-current-user-id': 'emp-1' },
    })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(403)
  })

  it('deletes pattern for LEADER and returns 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    mockPrisma.rotationPattern.delete.mockResolvedValue({})
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      method: 'DELETE',
      headers: { 'x-current-user-id': 'leader-1' },
    })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(200)
  })
})
```

(PUT-test follows the same pattern; add one happy-path + one 400 for invalid body.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/rotation-patterns.route.test.ts`

Expected: new tests FAIL with "Cannot find module".

- [ ] **Step 3: Implement the route**

Create `app/api/rotation-patterns/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { assertTeamMember, withAuth, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { rotationPatternUpdateSchema } from '@/lib/validation/rotation-schemas'
import {
  deletePattern,
  getPattern,
  updatePattern,
} from '@/lib/services/rotation-service'
import { ServiceError } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: { id: string } }

export const GET = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const pattern = await getPattern(ctx.params.id)
    const forbidden = await assertTeamMember(ctx, pattern.teamId)
    if (forbidden) return forbidden
    return NextResponse.json(pattern)
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})

export const PUT = withLeaderOrAdmin<{ id: string }>(async (request, ctx) => {
  const parsed = await parseJsonBody(request, rotationPatternUpdateSchema)
  if ('error' in parsed) return parsed.error

  const forbidden = await assertTeamMember(ctx, parsed.data.teamId, ['ADMIN', 'LEADER'])
  if (forbidden) return forbidden

  try {
    const updated = await updatePattern(ctx.params.id, { ...parsed.data, actorUserId: ctx.userId })
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})

export const DELETE = withLeaderOrAdmin<{ id: string }>(async (request, ctx) => {
  try {
    const pattern = await getPattern(ctx.params.id)
    const forbidden = await assertTeamMember(ctx, pattern.teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden
    await deletePattern(ctx.params.id, ctx.userId)
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/rotation-patterns.route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/rotation-patterns/[id]/route.ts tests/api/rotation-patterns.route.test.ts
git commit -m "feat(api): GET + PUT + DELETE /api/rotation-patterns/[id]"
```

---

## Task 8: API-rute for generate + rate-limit-config

**Files:**
- Create: `app/api/rotation-patterns/[id]/generate/route.ts`
- Create: `tests/api/rotation-patterns-generate.route.test.ts`
- Modify: `lib/security/rateLimitConfigs.ts`

- [ ] **Step 1: Add rate limit config**

Edit `lib/security/rateLimitConfigs.ts` and add inside `RATE_LIMITS`:

```typescript
  rotationGenerate: { routeKey: 'rotation.generate', limit: 5, windowMs: ONE_MINUTE },
```

(Same limit as `shiftsBulk` since it has similar bulk-write effect.)

- [ ] **Step 2: Write the failing generate route test**

Create `tests/api/rotation-patterns-generate.route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    rotationPattern: { findUnique: vi.fn() },
    shiftType: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/services/shift-service', () => ({
  createShift: vi.fn().mockImplementation(async (args: { userId: string; date: string }) => ({
    id: `s-${args.userId}-${args.date}`,
  })),
}))

import { POST } from '@/app/api/rotation-patterns/[id]/generate/route'

const LEADER = { id: 'leader-1', role: 'LEADER' }
const params = { id: 'rp-1' }

function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/rotation-patterns/rp-1/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.user.findUnique.mockResolvedValue(LEADER)
  mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
  mockPrisma.shiftType.findMany.mockResolvedValue([
    { id: 't1', defaultStartTime: '08:00', defaultEndTime: '16:00', crossesMidnight: false },
  ])
})

describe('POST /api/rotation-patterns/[id]/generate', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await POST(makePost({ startMonday: '2026-06-01', weeks: 1 }), { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 for EMPLOYEE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE' })
    const res = await POST(makePost({ startMonday: '2026-06-01', weeks: 1 }, 'emp-1'), { params })
    expect(res.status).toBe(403)
  })

  it('returns 404 when pattern not found', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue(null)
    const res = await POST(makePost({ startMonday: '2026-06-01', weeks: 1 }, 'leader-1'), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 when startMonday is not a Monday', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })
    const res = await POST(makePost({ startMonday: '2026-06-02', weeks: 1 }, 'leader-1'), { params })
    expect(res.status).toBe(400)
  })

  it('returns 200 with successes/failures shape on happy path', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
      ]),
    })
    const res = await POST(makePost({ startMonday: '2026-06-01', weeks: 1 }, 'leader-1'), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('successes')
    expect(body).toHaveProperty('failures')
    expect(body.successes).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/api/rotation-patterns-generate.route.test.ts`

Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Implement the route**

Create `app/api/rotation-patterns/[id]/generate/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { assertTeamMember, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { rotationGenerateSchema } from '@/lib/validation/rotation-schemas'
import { generateShifts, getPattern } from '@/lib/services/rotation-service'
import { ServiceError } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

export const POST = withLeaderOrAdmin<{ id: string }>(async (request, ctx) => {
  const limited = applyRateLimit(request, RATE_LIMITS.rotationGenerate)
  if (limited) return limited

  const parsed = await parseJsonBody(request, rotationGenerateSchema)
  if ('error' in parsed) return parsed.error

  try {
    const pattern = await getPattern(ctx.params.id)
    const forbidden = await assertTeamMember(ctx, pattern.teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    const result = await generateShifts({
      patternId: ctx.params.id,
      startMonday: parsed.data.startMonday,
      weeks: parsed.data.weeks,
      actorUserId: ctx.userId,
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/api/rotation-patterns-generate.route.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the full suite to confirm nothing broke**

Run: `npm test`

Expected: 360+ tests pass (335 original + ~30 new).

- [ ] **Step 7: Commit**

```bash
git add app/api/rotation-patterns/[id]/generate/route.ts tests/api/rotation-patterns-generate.route.test.ts lib/security/rateLimitConfigs.ts
git commit -m "feat(api): POST /api/rotation-patterns/[id]/generate with rate limit"
```

---

## Task 9: UI — Liste-side

**Files:**
- Create: `app/(app)/admin/rotations/page.tsx`

- [ ] **Step 1: Implement the list page**

Create `app/(app)/admin/rotations/page.tsx`:

```typescript
"use client"

import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { axiosInstance } from '@/lib/axios'
import { useMe } from '@/lib/hooks/useMe'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { GenerateShiftsDialog } from '@/components/admin/GenerateShiftsDialog'
import { GenerateResultDialog, type GenerateResult } from '@/components/admin/GenerateResultDialog'

interface RotationPattern {
  id: string
  teamId: string
  name: string
  weeks: number
  slotsJson: string
}

export default function RotationsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const teamId = me?.teamId
  const [generatingFor, setGeneratingFor] = useState<RotationPattern | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)

  const { data: patterns = [], isLoading } = useQuery<RotationPattern[]>({
    queryKey: ['rotation-patterns', teamId],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/rotation-patterns?teamId=${teamId}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(teamId),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => axiosInstance.delete(`/api/rotation-patterns/${id}`),
    onSuccess: () => {
      toast({ title: 'Mønster slettet' })
      queryClient.invalidateQueries({ queryKey: ['rotation-patterns', teamId] })
    },
    onError: () => toast({ title: 'Feil', description: 'Kunne ikke slette', variant: 'destructive' }),
  })

  function uniqueUsers(slotsJson: string): number {
    try {
      const slots = JSON.parse(slotsJson) as Array<{ userId: string }>
      return new Set(slots.map((s) => s.userId)).size
    } catch {
      return 0
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Turnusmønstre</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Definer mønstre som gjentas etter faste intervaller og generer
            vakter fremover.
          </p>
        </div>
        <Link href="/admin/rotations/new">
          <Button>+ Nytt mønster</Button>
        </Link>
      </header>

      {isLoading && <p className="text-muted-foreground">Laster…</p>}

      {!isLoading && patterns.length === 0 && (
        <p className="text-muted-foreground">Ingen turnusmønstre opprettet ennå.</p>
      )}

      {patterns.length > 0 && (
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="p-3">Navn</th>
              <th className="p-3">Cycle</th>
              <th className="p-3">Ansatte</th>
              <th className="p-3">Handlinger</th>
            </tr>
          </thead>
          <tbody>
            {patterns.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">{p.weeks} {p.weeks === 1 ? 'uke' : 'uker'}</td>
                <td className="p-3">{uniqueUsers(p.slotsJson)}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Link href={`/admin/rotations/${p.id}`}>
                      <Button variant="outline" size="sm">Rediger</Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => setGeneratingFor(p)}>
                      Generer vakter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Slette "${p.name}"?`)) deleteMutation.mutate(p.id)
                      }}
                    >
                      Slett
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {generatingFor && (
        <GenerateShiftsDialog
          pattern={generatingFor}
          onClose={() => setGeneratingFor(null)}
          onResult={(r) => {
            setGeneratingFor(null)
            setResult(r)
          }}
        />
      )}
      {result && (
        <GenerateResultDialog result={result} onClose={() => setResult(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify type check**

Run: `npx tsc --noEmit`

Expected: 0 errors (assuming Task 12 + 13 have created the dialog components — if not yet, errors are expected and resolved by those tasks).

- [ ] **Step 3: Commit**

```bash
git add app/(app)/admin/rotations/page.tsx
git commit -m "feat(ui): rotation patterns list page"
```

---

## Task 10: UI — RotationEditor-komponent

**Files:**
- Create: `components/admin/RotationEditor.tsx`

This component is reused by both the New and Edit pages (Task 11). It exposes:
`<RotationEditor initial={pattern | null} teamId={...} onSubmit={fn}/>`

- [ ] **Step 1: Implement the editor**

Create `components/admin/RotationEditor.tsx`:

```typescript
"use client"

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface UserOption { id: string; name: string }
interface ShiftTypeOption { id: string; code: string; label: string }

export interface RotationSlot {
  userId: string
  weekIndex: number
  dayOfWeek: number
  shiftTypeId: string
}

export interface RotationFormValue {
  teamId: string
  name: string
  weeks: number
  slots: RotationSlot[]
}

interface Props {
  teamId: string
  initial?: RotationFormValue | null
  onSubmit: (value: RotationFormValue) => void
  submitting?: boolean
}

const WEEKDAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

export function RotationEditor({ teamId, initial, onSubmit, submitting }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [weeks, setWeeks] = useState(initial?.weeks ?? 1)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    initial ? Array.from(new Set(initial.slots.map((s) => s.userId))) : []
  )
  const [activeUserId, setActiveUserId] = useState<string | null>(
    initial?.slots[0]?.userId ?? null
  )
  // Map<userId|weekIndex|dayOfWeek, shiftTypeId>
  const [slotMap, setSlotMap] = useState<Map<string, string>>(
    new Map(initial?.slots.map((s) => [`${s.userId}|${s.weekIndex}|${s.dayOfWeek}`, s.shiftTypeId]) ?? [])
  )

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['team-users', teamId],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/users?teamId=${teamId}`)
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: shiftTypes = [] } = useQuery<ShiftTypeOption[]>({
    queryKey: ['shift-types'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/shift-types')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  // Build the slot list from the map (only keeps cells with a chosen shift type)
  const slots: RotationSlot[] = useMemo(() => {
    const out: RotationSlot[] = []
    for (const [key, shiftTypeId] of slotMap.entries()) {
      const [userId, w, d] = key.split('|')
      out.push({
        userId,
        weekIndex: Number(w),
        dayOfWeek: Number(d),
        shiftTypeId,
      })
    }
    return out
  }, [slotMap])

  function setCell(userId: string, weekIndex: number, dayOfWeek: number, shiftTypeId: string) {
    const key = `${userId}|${weekIndex}|${dayOfWeek}`
    setSlotMap((prev) => {
      const next = new Map(prev)
      if (shiftTypeId === '__none__') next.delete(key)
      else next.set(key, shiftTypeId)
      return next
    })
  }

  function addUser(userId: string) {
    if (selectedUserIds.includes(userId)) return
    setSelectedUserIds([...selectedUserIds, userId])
    if (!activeUserId) setActiveUserId(userId)
  }

  function removeUser(userId: string) {
    setSelectedUserIds(selectedUserIds.filter((id) => id !== userId))
    setSlotMap((prev) => {
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (key.startsWith(`${userId}|`)) next.delete(key)
      }
      return next
    })
    if (activeUserId === userId) setActiveUserId(selectedUserIds.find((id) => id !== userId) ?? null)
  }

  function handleSubmit() {
    onSubmit({ teamId, name: name.trim(), weeks, slots })
  }

  const activeUser = users.find((u) => u.id === activeUserId)
  const availableUsersToAdd = users.filter((u) => !selectedUserIds.includes(u.id))

  return (
    <div className="space-y-6">
      <div className="space-y-2 max-w-md">
        <Label>Navn</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Helse 3-ukers rotasjon" />
      </div>

      <div className="space-y-2 max-w-md">
        <Label>Cycle uker</Label>
        <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'uke' : 'uker'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Mønsteret gjentas hver {weeks}. uke ved generering.</p>
      </div>

      <div className="space-y-2">
        <Label>Ansatte i mønsteret</Label>
        <div className="flex flex-wrap gap-2">
          {selectedUserIds.map((id) => {
            const u = users.find((x) => x.id === id)
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs">
                {u?.name ?? id}
                <button onClick={() => removeUser(id)} className="text-muted-foreground hover:text-foreground">✕</button>
              </span>
            )
          })}
          {availableUsersToAdd.length > 0 && (
            <Select value="" onValueChange={addUser}>
              <SelectTrigger className="w-48"><SelectValue placeholder="+ Legg til ansatt" /></SelectTrigger>
              <SelectContent>
                {availableUsersToAdd.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {selectedUserIds.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {selectedUserIds.map((id) => {
              const u = users.find((x) => x.id === id)
              return (
                <Button
                  key={id}
                  variant={activeUserId === id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveUserId(id)}
                >
                  {u?.name ?? id}
                </Button>
              )
            })}
          </div>

          {activeUser && (
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="p-1 text-left">Uke</th>
                  {WEEKDAY_LABELS.map((d) => <th key={d} className="p-1">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: weeks }, (_, w) => (
                  <tr key={w}>
                    <td className="p-1 text-xs text-muted-foreground">Uke {w + 1}</td>
                    {WEEKDAY_LABELS.map((_, d) => {
                      const dayOfWeek = d + 1
                      const key = `${activeUser.id}|${w}|${dayOfWeek}`
                      const value = slotMap.get(key) ?? '__none__'
                      return (
                        <td key={d} className="p-1">
                          <Select value={value} onValueChange={(v) => setCell(activeUser.id, w, dayOfWeek, v)}>
                            <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">—</SelectItem>
                              {shiftTypes.map((st) => (
                                <SelectItem key={st.id} value={st.id}>{st.label || st.code}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={handleSubmit} disabled={submitting || !name.trim() || selectedUserIds.length === 0}>
          {submitting ? 'Lagrer…' : 'Lagre mønster'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/RotationEditor.tsx
git commit -m "feat(ui): RotationEditor shared component (tabs per employee + grid)"
```

---

## Task 11: UI — New + Edit pages

**Files:**
- Create: `app/(app)/admin/rotations/new/page.tsx`
- Create: `app/(app)/admin/rotations/[id]/page.tsx`

- [ ] **Step 1: Implement New page**

Create `app/(app)/admin/rotations/new/page.tsx`:

```typescript
"use client"

import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { axiosInstance } from '@/lib/axios'
import { useMe } from '@/lib/hooks/useMe'
import { useToast } from '@/components/ui/use-toast'
import { RotationEditor, type RotationFormValue } from '@/components/admin/RotationEditor'

export default function NewRotationPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { data: me } = useMe()
  const teamId = me?.teamId

  const createMutation = useMutation({
    mutationFn: async (value: RotationFormValue) =>
      axiosInstance.post('/api/rotation-patterns', value),
    onSuccess: () => {
      toast({ title: 'Mønster opprettet' })
      router.push('/admin/rotations')
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast({
        title: 'Feil',
        description: e.response?.data?.error ?? 'Kunne ikke opprette mønster',
        variant: 'destructive',
      })
    },
  })

  if (!teamId) return <p className="text-muted-foreground">Laster…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Nytt turnusmønster</h1>
      <RotationEditor
        teamId={teamId}
        onSubmit={(value) => createMutation.mutate(value)}
        submitting={createMutation.isPending}
      />
    </div>
  )
}
```

- [ ] **Step 2: Implement Edit page**

Create `app/(app)/admin/rotations/[id]/page.tsx`:

```typescript
"use client"

import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@/lib/axios'
import { useToast } from '@/components/ui/use-toast'
import { RotationEditor, type RotationFormValue } from '@/components/admin/RotationEditor'

interface RotationPattern {
  id: string
  teamId: string
  name: string
  weeks: number
  slotsJson: string
}

export default function EditRotationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const { data: pattern, isLoading } = useQuery<RotationPattern>({
    queryKey: ['rotation-pattern', params.id],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/rotation-patterns/${params.id}`)
      return res.data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (value: RotationFormValue) =>
      axiosInstance.put(`/api/rotation-patterns/${params.id}`, value),
    onSuccess: () => {
      toast({ title: 'Mønster oppdatert' })
      router.push('/admin/rotations')
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast({
        title: 'Feil',
        description: e.response?.data?.error ?? 'Kunne ikke oppdatere',
        variant: 'destructive',
      })
    },
  })

  if (isLoading || !pattern) return <p className="text-muted-foreground">Laster…</p>

  const initial: RotationFormValue = {
    teamId: pattern.teamId,
    name: pattern.name,
    weeks: pattern.weeks,
    slots: JSON.parse(pattern.slotsJson),
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Rediger turnusmønster</h1>
      <RotationEditor
        teamId={pattern.teamId}
        initial={initial}
        onSubmit={(value) => updateMutation.mutate(value)}
        submitting={updateMutation.isPending}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/admin/rotations/new/page.tsx app/(app)/admin/rotations/[id]/page.tsx
git commit -m "feat(ui): new and edit pages for rotation patterns"
```

---

## Task 12: UI — GenerateShiftsDialog

**Files:**
- Create: `components/admin/GenerateShiftsDialog.tsx`

- [ ] **Step 1: Implement the dialog**

Create `components/admin/GenerateShiftsDialog.tsx`:

```typescript
"use client"

import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parse, getISODay, format, addDays } from 'date-fns'
import { axiosInstance } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { GenerateResult } from './GenerateResultDialog'

interface Pattern { id: string; name: string; weeks: number; slotsJson: string }

interface Props {
  pattern: Pattern
  onClose: () => void
  onResult: (result: GenerateResult) => void
}

export function GenerateShiftsDialog({ pattern, onClose, onResult }: Props) {
  const [startMonday, setStartMonday] = useState('')
  const [weeks, setWeeks] = useState(4)

  const startDate = useMemo(() => {
    if (!startMonday) return null
    try {
      const d = parse(startMonday, 'yyyy-MM-dd', new Date())
      return isNaN(d.getTime()) ? null : d
    } catch { return null }
  }, [startMonday])

  const isMonday = startDate ? getISODay(startDate) === 1 : false

  const estimatedShifts = useMemo(() => {
    try {
      const slots = JSON.parse(pattern.slotsJson) as Array<unknown>
      // Each generated week uses (slots / pattern.weeks) on average.
      return Math.round((slots.length / pattern.weeks) * weeks)
    } catch { return 0 }
  }, [pattern, weeks])

  const endDate = startDate ? format(addDays(startDate, weeks * 7 - 1), 'yyyy-MM-dd') : ''

  const generateMutation = useMutation({
    mutationFn: async () =>
      axiosInstance.post(`/api/rotation-patterns/${pattern.id}/generate`, {
        startMonday, weeks,
      }),
    onSuccess: (res) => {
      onResult(res.data as GenerateResult)
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generer vakter fra «{pattern.name}»</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Start-mandag</Label>
            <Input
              type="date"
              value={startMonday}
              onChange={(e) => setStartMonday(e.target.value)}
            />
            {startMonday && !isMonday && (
              <p className="text-xs text-destructive">Datoen må være en mandag.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Antall uker fremover</Label>
            <Input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
            />
          </div>

          {isMonday && (
            <div className="rounded bg-muted/40 p-3 text-sm">
              <p>Genererer ca. <strong>{estimatedShifts}</strong> vakter fra {startMonday} til {endDate}.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Eksisterende vakter på samme datoer blir hoppet over og rapportert.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={!isMonday || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? 'Genererer…' : 'Generer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: 0 errors (assuming Task 13 dialogs are created — if not, errors resolve there).

- [ ] **Step 3: Commit**

```bash
git add components/admin/GenerateShiftsDialog.tsx
git commit -m "feat(ui): GenerateShiftsDialog with Monday validation + preview"
```

---

## Task 13: UI — GenerateResultDialog

**Files:**
- Create: `components/admin/GenerateResultDialog.tsx`

- [ ] **Step 1: Implement the result dialog**

Create `components/admin/GenerateResultDialog.tsx`:

```typescript
"use client"

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export interface GenerateResult {
  successes: Array<{ userId: string; date: string; shiftId: string }>
  failures:  Array<{ userId: string; date: string; error: string }>
}

interface Props {
  result: GenerateResult
  onClose: () => void
}

export function GenerateResultDialog({ result, onClose }: Props) {
  const total = result.successes.length + result.failures.length

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ✓ Genererte {result.successes.length} av {total} vakter
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {result.successes.length === total
              ? 'Alle vakter ble opprettet uten konflikter.'
              : `${result.failures.length} vakter ble hoppet over:`}
          </p>

          {result.failures.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-auto rounded bg-muted/40 p-3 text-xs">
              {result.failures.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.userId}</span>{' '}
                  <span className="text-muted-foreground">{f.date}:</span> {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Lukk</Button>
          <Link href="/standard">
            <Button onClick={onClose}>Gå til turnusoversikt</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: 0 errors. All UI components now type-check.

- [ ] **Step 3: Commit**

```bash
git add components/admin/GenerateResultDialog.tsx
git commit -m "feat(ui): GenerateResultDialog with collapsible failures list"
```

---

## Task 14: Wire rotations into admin landing page

**Files:**
- Modify: `app/(app)/admin/page.tsx`

- [ ] **Step 1: Add Repeat icon import and rotations card**

Edit `app/(app)/admin/page.tsx`. Update the icon import to include `Repeat`:

```typescript
import { Bell, Building2, Calendar, FileText, LucideIcon, Repeat, Users } from 'lucide-react'
```

In the `SECTIONS` array, add a new card to the `'Konfigurasjon'` section's `items` array (after `Vakttyper`, before `Varslinger`):

```typescript
      {
        href: '/admin/rotations',
        icon: Repeat,
        title: 'Turnusmønstre',
        description: 'Lag mønstre som gjentas og generer vakter fremover.',
      },
```

- [ ] **Step 2: Verify type check + lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add app/(app)/admin/page.tsx
git commit -m "feat(ui): add Turnusmønstre card to admin landing page"
```

---

## Task 15: Final verification + Neon migration

- [ ] **Step 1: Run the full vitest suite**

Run: `npm test`

Expected: 360+ tests pass (335 original + ~30 new). Note final number for thesis update.

- [ ] **Step 2: TypeScript + lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Start dev server and manually verify**

Run: `npm run dev`

In a browser at `http://localhost:4000`:

1. Sign in as admin (`admin@hdo.no` via the test path, or `bach-turnus@hdono.onmicrosoft.com` via Azure)
2. Navigate to `/admin` and click the new **Turnusmønstre** card
3. Click **+ Nytt mønster**:
   - Set name "Test 2-ukers"
   - Set cycle = 2 uker
   - Add two ansatte
   - For each employee, set a few cells (mix of `—` and a shift type) across the two weeks
   - Click **Lagre mønster** → should land back on `/admin/rotations` with toast
4. From the list, click **Generer vakter** on the new pattern:
   - Pick a Monday in 2027 (avoids overlap with seeded data)
   - Set weeks = 4
   - Verify the preview text shows the estimate
   - Click **Generer**
5. Result dialog shows successes; click **Gå til turnusoversikt** → navigate to the date you picked and verify the vakter appeared in the grid
6. Go back to `/admin/rotations`, click **Slett** on the pattern → confirm, list empties
7. Confirm in `/admin/audit` that you see `ROTATION_PATTERN_CREATED`, `ROTATION_GENERATED`, several `SHIFT_CREATED`, and `ROTATION_PATTERN_DELETED` entries

- [ ] **Step 4: Run Playwright e2e to confirm no regression**

Run: `npm run test:e2e`

Expected: 18/18 passing (existing tests, no rotation-specific e2e added).

- [ ] **Step 5: Deploy migration to Neon**

Run: `npx prisma migrate deploy`

Expected: applies the `add_rotation_patterns` migration to the Neon DB cleanly.

- [ ] **Step 6: Push and verify CI green**

Run: `git push origin main`

Watch the CI run at the repo URL. Expected: lint + typecheck + tests + next build all green.

- [ ] **Step 7: Flag updated metrics for Sofiya**

Send a message with the new numbers to update in `§8.2.1`:

- Total tester: 335 → [new total after rotation tests, e.g. 365]
- Coverage-tall: re-run `npm run test:coverage` and compare against last reported (78.9 % / 67.7 % / 86.0 % / 81.2 %)
- New feature description to add to feature-list section: «Turnusmønster — lederen kan opprette gjentakende mønstre og generere vakter fremover»
