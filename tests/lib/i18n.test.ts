import { describe, expect, it } from 'vitest'
import { holidayTypeToNorwegian, statusToNorwegian } from '@/lib/i18n'

describe('i18n', () => {
  it.each([
    ['HOLIDAY', 'Ferie'],
    ['ABSENCE', 'Fravær'],
    ['SICKNESS', 'Sykdom'],
    ['holiday', 'Ferie'],
    [undefined, ''],
    ['CUSTOM', 'custom'],
  ])('holidayTypeToNorwegian(%p) → %p', (input, expected) => {
    expect(holidayTypeToNorwegian(input)).toBe(expected)
  })

  it.each([
    ['PENDING', 'Venter'],
    ['APPROVED', 'Godkjent'],
    ['REJECTED', 'Avvist'],
    ['approved', 'Godkjent'],
    [undefined, ''],
    ['UNKNOWN', 'UNKNOWN'],
  ])('statusToNorwegian(%p) → %p', (input, expected) => {
    expect(statusToNorwegian(input)).toBe(expected)
  })
})
