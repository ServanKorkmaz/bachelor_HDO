import { describe, expect, it } from 'vitest'
import {
  shiftCreateSchema,
  noteCreateSchema,
  swapCreateSchema,
  holidayCreateSchema,
  shiftTypeBodySchema,
  bulkShiftSchema,
} from '@/lib/validation/schemas'

/** Verifies field-level Zod validation for non-admin API endpoints. */
describe('validation schemas', () => {
  describe('shiftCreateSchema', () => {
    it('accepts a well-formed shift', () => {
      const r = shiftCreateSchema.safeParse({
        date: '2026-05-01',
        userId: 'u1',
        shiftTypeId: 't1',
        startTime: '08:00',
        endTime: '16:00',
      })
      expect(r.success).toBe(true)
    })

    it('rejects malformed date and time', () => {
      const r = shiftCreateSchema.safeParse({
        date: '01-05-2026',
        userId: 'u1',
        shiftTypeId: 't1',
        startTime: '8:0',
        endTime: '16:00',
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        const fields = r.error.flatten().fieldErrors
        expect(fields.date).toBeDefined()
        expect(fields.startTime).toBeDefined()
      }
    })

    it('rejects comment longer than 2000 chars', () => {
      const r = shiftCreateSchema.safeParse({
        date: '2026-05-01',
        userId: 'u1',
        shiftTypeId: 't1',
        startTime: '08:00',
        endTime: '16:00',
        comment: 'x'.repeat(2001),
      })
      expect(r.success).toBe(false)
    })
  })

  describe('noteCreateSchema', () => {
    it('rejects empty body and missing dates', () => {
      const r = noteCreateSchema.safeParse({
        teamId: 't1',
        createdByUserId: 'u1',
        type: 'INFO',
        body: '',
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        const fields = r.error.flatten().fieldErrors
        expect(fields.body).toBeDefined()
        expect(fields.dateFrom).toBeDefined()
        expect(fields.dateTo).toBeDefined()
      }
    })
  })

  describe('swapCreateSchema', () => {
    it('requires all four ids', () => {
      const r = swapCreateSchema.safeParse({ teamId: 't1' })
      expect(r.success).toBe(false)
      if (!r.success) {
        const fields = r.error.flatten().fieldErrors
        expect(fields.requestedByUserId).toBeDefined()
        expect(fields.shiftId).toBeDefined()
        expect(fields.toUserId).toBeDefined()
      }
    })
  })

  describe('holidayCreateSchema', () => {
    it('rejects unknown holiday type', () => {
      const r = holidayCreateSchema.safeParse({
        type: 'VACATION',
        dateFrom: '2026-05-01',
      })
      expect(r.success).toBe(false)
    })

    it('accepts SICKNESS without dateTo', () => {
      const r = holidayCreateSchema.safeParse({
        type: 'SICKNESS',
        dateFrom: '2026-05-01',
      })
      expect(r.success).toBe(true)
    })
  })

  describe('shiftTypeBodySchema', () => {
    it('rejects non-hex color', () => {
      const r = shiftTypeBodySchema.safeParse({
        code: 'D',
        label: 'Dag',
        color: 'blue',
        defaultStartTime: '08:00',
        defaultEndTime: '16:00',
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.flatten().fieldErrors.color).toBeDefined()
      }
    })

    it('accepts valid hex color', () => {
      const r = shiftTypeBodySchema.safeParse({
        code: 'D',
        label: 'Dag',
        color: '#FFAA00',
        defaultStartTime: '08:00',
        defaultEndTime: '16:00',
      })
      expect(r.success).toBe(true)
    })
  })

  describe('bulkShiftSchema', () => {
    it('rejects more than 200 items', () => {
      const items = Array.from({ length: 201 }, () => ({}))
      const r = bulkShiftSchema.safeParse({ action: 'create', items })
      expect(r.success).toBe(false)
    })

    it('rejects unknown action', () => {
      const r = bulkShiftSchema.safeParse({ action: 'wipe', items: [] })
      expect(r.success).toBe(false)
    })
  })
})
