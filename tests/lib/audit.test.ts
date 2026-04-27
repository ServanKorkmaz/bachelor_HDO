import { describe, expect, it, vi } from 'vitest'
import { createAuditLog } from '@/lib/admin/audit'

describe('createAuditLog', () => {
  it('skriver audit entry med null-defaults for before/after', async () => {
    // Simulate a Prisma transaction with a mocked auditLog.create method.
    const create = vi.fn().mockResolvedValue({})
    const tx = {
      auditLog: { create },
    }

    await createAuditLog(tx, {
      actorUserId: 'admin-1',
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: 'user-1',
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-1',
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: 'user-1',
        beforeJson: null,
        afterJson: null,
      },
    })
  })
})
