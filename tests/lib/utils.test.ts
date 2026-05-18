import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('returns a merged class string', () => {
    expect(typeof cn('px-4', 'py-2')).toBe('string')
  })
})
