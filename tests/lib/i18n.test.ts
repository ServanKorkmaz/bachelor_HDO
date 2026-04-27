import { describe, expect, it } from 'vitest'
import { holidayTypeToNorwegian, statusToNorwegian } from '@/lib/i18n'

/** Unit tests for Norwegian label translation helpers. */
describe('i18n', () => {
  describe('holidayTypeToNorwegian', () => {
    it('oversetter HOLIDAY til Ferie', () => {
      expect(holidayTypeToNorwegian('HOLIDAY')).toBe('Ferie')
    })

    it('oversetter ABSENCE til Fravær', () => {
      expect(holidayTypeToNorwegian('ABSENCE')).toBe('Fravær')
    })

    it('oversetter SICKNESS til Sykdom', () => {
      expect(holidayTypeToNorwegian('SICKNESS')).toBe('Sykdom')
    })

    it('er case-insensitiv', () => {
      expect(holidayTypeToNorwegian('holiday')).toBe('Ferie')
      expect(holidayTypeToNorwegian('Absence')).toBe('Fravær')
    })

    it('returnerer tom streng for undefined', () => {
      expect(holidayTypeToNorwegian(undefined)).toBe('')
    })

    it('returnerer lowercase for ukjent type', () => {
      expect(holidayTypeToNorwegian('CUSTOM')).toBe('custom')
    })
  })

  describe('statusToNorwegian', () => {
    it('oversetter PENDING til VENTER...', () => {
      expect(statusToNorwegian('PENDING')).toBe('VENTER...')
    })

    it('oversetter APPROVED til GODKJENT', () => {
      expect(statusToNorwegian('APPROVED')).toBe('GODKJENT')
    })

    it('oversetter REJECTED til AVVIST', () => {
      expect(statusToNorwegian('REJECTED')).toBe('AVVIST')
    })

    it('er case-insensitiv', () => {
      expect(statusToNorwegian('approved')).toBe('GODKJENT')
      expect(statusToNorwegian('Pending')).toBe('VENTER...')
    })

    it('returnerer tom streng for undefined', () => {
      expect(statusToNorwegian(undefined)).toBe('')
    })

    it('returnerer uendret verdi for ukjent status', () => {
      expect(statusToNorwegian('UNKNOWN')).toBe('UNKNOWN')
    })
  })
})
