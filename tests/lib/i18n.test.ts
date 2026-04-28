import { describe, expect, it } from 'vitest'
import { holidayTypeToNorwegian, statusToNorwegian } from '@/lib/i18n'

/** Unit tests for Norwegian label translation helpers. */
describe('i18n', () => {
  describe('holidayTypeToNorwegian', () => {
    it('translates HOLIDAY to Ferie', () => {
      expect(holidayTypeToNorwegian('HOLIDAY')).toBe('Ferie')
    })

    it('translates ABSENCE to Fravær', () => {
      expect(holidayTypeToNorwegian('ABSENCE')).toBe('Fravær')
    })

    it('translates SICKNESS to Sykdom', () => {
      expect(holidayTypeToNorwegian('SICKNESS')).toBe('Sykdom')
    })

    it('is case-insensitive', () => {
      expect(holidayTypeToNorwegian('holiday')).toBe('Ferie')
      expect(holidayTypeToNorwegian('Absence')).toBe('Fravær')
    })

    it('returns empty string for undefined', () => {
      expect(holidayTypeToNorwegian(undefined)).toBe('')
    })

    it('returns lowercase for unknown type', () => {
      expect(holidayTypeToNorwegian('CUSTOM')).toBe('custom')
    })
  })

  describe('statusToNorwegian', () => {
    it('translates PENDING to VENTER...', () => {
      expect(statusToNorwegian('PENDING')).toBe('VENTER...')
    })

    it('translates APPROVED to GODKJENT', () => {
      expect(statusToNorwegian('APPROVED')).toBe('GODKJENT')
    })

    it('translates REJECTED to AVVIST', () => {
      expect(statusToNorwegian('REJECTED')).toBe('AVVIST')
    })

    it('is case-insensitive', () => {
      expect(statusToNorwegian('approved')).toBe('GODKJENT')
      expect(statusToNorwegian('Pending')).toBe('VENTER...')
    })

    it('returns empty string for undefined', () => {
      expect(statusToNorwegian(undefined)).toBe('')
    })

    it('returns original value for unknown status', () => {
      expect(statusToNorwegian('UNKNOWN')).toBe('UNKNOWN')
    })
  })
})
