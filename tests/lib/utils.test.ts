import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

/** Unit tests for the cn() Tailwind class merging utility. */
describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('text-red-500')).toBe('text-red-500')
  })

  it('merges multiple classes', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2')
  })

  it('resolves Tailwind conflicts by keeping the last value', () => {
    // When two Tailwind utilities conflict (same property), the last one wins.
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('ignores falsy values', () => {
    expect(cn('px-4', false, undefined, null, 'py-2')).toBe('px-4 py-2')
  })

  it('supports conditional classes via object', () => {
    expect(cn({ 'font-bold': true, 'italic': false })).toBe('font-bold')
  })

  it('returns empty string with no arguments', () => {
    expect(cn()).toBe('')
  })
})
