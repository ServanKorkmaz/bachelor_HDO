import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    rotationPattern: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: { findMany: vi.fn() },
    shiftType: { findMany: vi.fn() },
    teamMembership: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import {
  createPattern,
  listPatterns,
  getPattern,
  updatePattern,
  deletePattern,
} from '@/lib/services/rotation-service'
import { ServiceError } from '@/lib/services/errors'

const validInput = {
  teamId: 'team-1',
  name: 'Helse 3-ukers',
  weeks: 1,
  slots: [
    { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
  ],
  actorUserId: 'admin-1',
}

describe('createPattern', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }])
    mockPrisma.shiftType.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.teamMembership.findMany.mockResolvedValue([
      { userId: 'u1', teamId: 'team-1', status: 'active' },
    ])
    mockPrisma.rotationPattern.create.mockResolvedValue({
      id: 'rp-1', ...validInput, slotsJson: JSON.stringify(validInput.slots),
    })
  })

  it('creates a pattern and writes an audit entry', async () => {
    const pattern = await createPattern(validInput)
    expect(pattern.id).toBe('rp-1')
    expect(mockPrisma.rotationPattern.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'ROTATION_PATTERN_CREATED',
          entityType: 'rotation_pattern',
          entityId: 'rp-1',
        }),
      }),
    )
  })

  it('rejects unknown userId in slots', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])
    await expect(createPattern(validInput)).rejects.toThrow(ServiceError)
    expect(mockPrisma.rotationPattern.create).not.toHaveBeenCalled()
  })

  it('rejects unknown shiftTypeId in slots', async () => {
    mockPrisma.shiftType.findMany.mockResolvedValue([])
    await expect(createPattern(validInput)).rejects.toThrow(ServiceError)
  })

  it('rejects user not active in team', async () => {
    mockPrisma.teamMembership.findMany.mockResolvedValue([])
    await expect(createPattern(validInput)).rejects.toThrow(ServiceError)
  })

  it('rejects duplicate (userId, weekIndex, dayOfWeek) tuple', async () => {
    const dup = {
      ...validInput,
      slots: [
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
      ],
    }
    await expect(createPattern(dup)).rejects.toThrow(ServiceError)
  })
})

describe('listPatterns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns patterns for the team', async () => {
    mockPrisma.rotationPattern.findMany.mockResolvedValue([
      { id: 'rp-1', teamId: 'team-1', name: 'A', weeks: 1, slotsJson: '[]' },
    ])
    const result = await listPatterns('team-1')
    expect(result).toHaveLength(1)
    expect(mockPrisma.rotationPattern.findMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('getPattern', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the pattern when found', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 't', name: 'X', weeks: 1, slotsJson: '[]',
    })
    const p = await getPattern('rp-1')
    expect(p.id).toBe('rp-1')
  })

  it('throws 404 ServiceError when not found', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue(null)
    await expect(getPattern('missing')).rejects.toMatchObject({
      code: 'ROTATION_PATTERN_NOT_FOUND',
      status: 404,
    })
  })
})

describe('updatePattern', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }])
    mockPrisma.shiftType.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.teamMembership.findMany.mockResolvedValue([
      { userId: 'u1', teamId: 'team-1', status: 'active' },
    ])
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'Old', weeks: 1, slotsJson: '[]',
    })
    mockPrisma.rotationPattern.update.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'Helse 3-ukers', weeks: 1,
      slotsJson: JSON.stringify(validInput.slots),
    })
  })

  it('updates and writes an audit entry with before/after', async () => {
    await updatePattern('rp-1', validInput)
    expect(mockPrisma.rotationPattern.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ROTATION_PATTERN_UPDATED',
          beforeJson: expect.stringContaining('"name":"Old"'),
          afterJson: expect.stringContaining('"name":"Helse 3-ukers"'),
        }),
      }),
    )
  })
})

describe('deletePattern', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })
  })

  it('deletes the pattern and writes an audit entry', async () => {
    await deletePattern('rp-1', 'admin-1')
    expect(mockPrisma.rotationPattern.delete).toHaveBeenCalledWith({ where: { id: 'rp-1' } })
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'ROTATION_PATTERN_DELETED',
          entityType: 'rotation_pattern',
        }),
      }),
    )
  })
})
