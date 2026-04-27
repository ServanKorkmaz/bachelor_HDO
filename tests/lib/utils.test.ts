import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

/** Unit tests for the cn() Tailwind class merging utility. */
describe('cn', () => {
  it('returnerer en enkel klasse uendret', () => {
    expect(cn('text-red-500')).toBe('text-red-500')
  })

  it('slår sammen flere klasser', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2')
  })

  it('løser Tailwind-konflikter ved å beholde siste verdi', () => {
    // When two Tailwind utilities conflict (same property), the last one wins.
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('ignorerer falsy-verdier', () => {
    expect(cn('px-4', false, undefined, null, 'py-2')).toBe('px-4 py-2')
  })

  it('støtter betingede klasser via objekt', () => {
    expect(cn({ 'font-bold': true, 'italic': false })).toBe('font-bold')
  })

  it('returnerer tom streng uten argumenter', () => {
    expect(cn()).toBe('')
  })
})
