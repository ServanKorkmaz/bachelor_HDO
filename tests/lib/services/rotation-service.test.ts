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

import { generateShifts } from '@/lib/services/rotation-service'

vi.mock('@/lib/services/shift-service', () => ({
  createShift: vi.fn(),
}))

import { createShift } from '@/lib/services/shift-service'

describe('generateShifts', () => {
  const monday = '2026-06-01' // verified: this is a Monday

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.shiftType.findMany.mockResolvedValue([
      { id: 't1', code: 'Dag', defaultStartTime: '08:00', defaultEndTime: '16:00', crossesMidnight: false },
    ])
    ;(createShift as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: { userId: string; date: string }) => ({ id: `s-${args.userId}-${args.date}` })
    )
  })

  it('rejects a startMonday that is not a Monday', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })

    await expect(
      generateShifts({
        patternId: 'rp-1',
        startMonday: '2026-06-02', // Tuesday
        weeks: 1,
        actorUserId: 'admin-1',
      })
    ).rejects.toMatchObject({ code: 'NOT_A_MONDAY', status: 400 })
  })

  it('generates 1 shift per slot for a 1-week cycle over 1 week', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u1', weekIndex: 0, dayOfWeek: 3, shiftTypeId: 't1' },
      ]),
    })

    const result = await generateShifts({
      patternId: 'rp-1', startMonday: monday, weeks: 1, actorUserId: 'admin-1',
    })

    expect(result.successes).toHaveLength(2)
    expect(result.failures).toHaveLength(0)
    expect(createShift).toHaveBeenCalledTimes(2)
  })

  it('cycles correctly via modulo for a 3-week pattern over 6 weeks', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 3,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u1', weekIndex: 1, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u1', weekIndex: 2, dayOfWeek: 1, shiftTypeId: 't1' },
      ]),
    })

    const result = await generateShifts({
      patternId: 'rp-1', startMonday: monday, weeks: 6, actorUserId: 'admin-1',
    })

    expect(result.successes).toHaveLength(6)
    expect(createShift).toHaveBeenCalledTimes(6)
    const dates = (createShift as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: [{ date: string }]) => c[0].date
    )
    expect(dates).toEqual([
      '2026-06-01', '2026-06-08', '2026-06-15',
      '2026-06-22', '2026-06-29', '2026-07-06',
    ])
  })

  it('reports failures from createShift without aborting other slots', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
        { userId: 'u2', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
      ]),
    })

    ;(createShift as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new ServiceError('DUPLICATE_SHIFT', 'Brukeren har allerede en vakt', 409)
    })
    ;(createShift as ReturnType<typeof vi.fn>).mockImplementationOnce(async (args: { userId: string; date: string }) => ({
      id: `s-${args.userId}-${args.date}`,
    }))

    const result = await generateShifts({
      patternId: 'rp-1', startMonday: monday, weeks: 1, actorUserId: 'admin-1',
    })

    expect(result.successes).toHaveLength(1)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].error).toMatch(/allerede/)
  })

  it('writes a ROTATION_GENERATED audit summary entry', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
      ]),
    })

    await generateShifts({
      patternId: 'rp-1', startMonday: monday, weeks: 1, actorUserId: 'admin-1',
    })

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ROTATION_GENERATED',
          entityType: 'rotation_pattern',
          entityId: 'rp-1',
          afterJson: expect.stringContaining('"generatedCount":1'),
        }),
      }),
    )
  })
})
