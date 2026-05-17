import { describe, it, expect } from 'vitest'
import { isSafeInternalPath, safeFromOrDefault } from '@/lib/auth/safeRedirect'

describe('isSafeInternalPath', () => {
  it.each([
    ['/', true],
    ['/standard', true],
    ['/admin/users', true],
    ['/agenda?week=2026-W20', true],
    ['/foo#anchor', true],
  ])('accepts %s', (input, expected) => {
    expect(isSafeInternalPath(input)).toBe(expected)
  })

  it.each([
    ['//evil.com', false],
    ['/\\evil.com', false],
    ['https://evil.com', false],
    ['http://evil.com', false],
    ['javascript:alert(1)', false],
    ['', false],
    ['foo', false],
    ['/foo bar', false],
    ['/foo\nbar', false],
  ])('rejects %s', (input, expected) => {
    expect(isSafeInternalPath(input)).toBe(expected)
  })
})

describe('safeFromOrDefault', () => {
  it('returns the input when safe', () => {
    expect(safeFromOrDefault('/standard')).toBe('/standard')
  })
  it('falls back to / when unsafe', () => {
    expect(safeFromOrDefault('//evil.com')).toBe('/')
  })
  it('falls back to / when null or undefined', () => {
    expect(safeFromOrDefault(null)).toBe('/')
    expect(safeFromOrDefault(undefined)).toBe('/')
  })
})
