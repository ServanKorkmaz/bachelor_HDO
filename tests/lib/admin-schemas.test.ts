import { describe, expect, it } from 'vitest'
import {
  addMemberSchema,
  createUserSchema,
  patchMembershipSchema,
  patchUserStatusSchema,
} from '@/lib/admin/schemas'

/** Validates Zod schemas used for admin API input validation. */
describe('admin schemas', () => {
  it('accepts valid createUser payload', () => {
    const parsed = createUserSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      teamId: 'team-1',
      role: 'LEADER',
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects invalid createUser payload', () => {
    const parsed = createUserSchema.safeParse({
      name: '',
      email: 'not-an-email',
      teamId: '',
      role: 'INVALID',
    })

    expect(parsed.success).toBe(false)
  })

  it('patchUserStatusSchema accepts only active/inactive', () => {
    expect(patchUserStatusSchema.safeParse({ status: 'active' }).success).toBe(true)
    expect(patchUserStatusSchema.safeParse({ status: 'inactive' }).success).toBe(true)
    expect(patchUserStatusSchema.safeParse({ status: 'blocked' }).success).toBe(false)
  })

  it('addMemberSchema requires userId and valid role', () => {
    expect(addMemberSchema.safeParse({ userId: 'u1', role: 'EMPLOYEE' }).success).toBe(true)
    expect(addMemberSchema.safeParse({ userId: '', role: 'EMPLOYEE' }).success).toBe(false)
    expect(addMemberSchema.safeParse({ userId: 'u1', role: 'ADMIN' }).success).toBe(false)
  })

  it('patchMembershipSchema allows partial update', () => {
    expect(patchMembershipSchema.safeParse({ role: 'LEADER' }).success).toBe(true)
    expect(patchMembershipSchema.safeParse({ status: 'active' }).success).toBe(true)
    expect(patchMembershipSchema.safeParse({}).success).toBe(true)
  })
})
