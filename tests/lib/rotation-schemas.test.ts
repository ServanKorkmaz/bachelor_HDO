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
