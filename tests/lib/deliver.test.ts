import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockSendEmail, mockSendSms } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    userNotificationPreference: { findUnique: vi.fn() },
  },
  mockSendEmail: vi.fn(),
  mockSendSms:   vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/sendEmail', () => ({ sendEmail: mockSendEmail }))
vi.mock('@/lib/notifications/sendSms',   () => ({ sendSms: mockSendSms }))

import { deliverNotificationToChannels } from '@/lib/notifications/deliver'

const baseParams = {
  userId: 'user-1',
  teamId: 'team-1',
  type: 'SHIFT_CREATED',
  title: 'Vakt opprettet',
  message: 'Du har fått en ny vakt',
}

/** Unit tests for notification channel delivery logic. */
describe('deliverNotificationToChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue(undefined)
    mockSendSms.mockResolvedValue(undefined)
    // No saved preferences by default → falls back to defaults
    mockPrisma.userNotificationPreference.findUnique.mockResolvedValue(null)
  })

  it('sends email with default preferences when user has no saved prefs', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'alice@example.com' })

    await deliverNotificationToChannels(baseParams)

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendSms).not.toHaveBeenCalled()
  })

  it('does not send email when shiftChangesEmail is disabled', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'alice@example.com' })
    mockPrisma.userNotificationPreference.findUnique.mockResolvedValue({
      shiftChangesEmail: false,
      shiftChangesSms: false,
      swapEmail: true,
      swapSms: false,
      noteEmail: true,
      noteSms: false,
    })

    await deliverNotificationToChannels(baseParams)

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendSms).not.toHaveBeenCalled()
  })

  it('sends SMS when shiftChangesSms is enabled', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'alice@example.com' })
    mockPrisma.userNotificationPreference.findUnique.mockResolvedValue({
      shiftChangesEmail: false,
      shiftChangesSms: true,
      swapEmail: false,
      swapSms: false,
      noteEmail: false,
      noteSms: false,
    })

    await deliverNotificationToChannels(baseParams)

    expect(mockSendSms).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('skips all channels when user has no email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: null })

    await deliverNotificationToChannels(baseParams)

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendSms).not.toHaveBeenCalled()
  })

  it('uses swapEmail preference for SWAP_REQUESTED type', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'alice@example.com' })
    mockPrisma.userNotificationPreference.findUnique.mockResolvedValue({
      shiftChangesEmail: false,
      shiftChangesSms: false,
      swapEmail: true,
      swapSms: false,
      noteEmail: false,
      noteSms: false,
    })

    await deliverNotificationToChannels({ ...baseParams, type: 'SWAP_REQUESTED' })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('uses noteEmail preference for NOTE_STATUS_CHANGED type', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'alice@example.com' })
    mockPrisma.userNotificationPreference.findUnique.mockResolvedValue({
      shiftChangesEmail: false,
      shiftChangesSms: false,
      swapEmail: false,
      swapSms: false,
      noteEmail: true,
      noteSms: false,
    })

    await deliverNotificationToChannels({ ...baseParams, type: 'NOTE_STATUS_CHANGED' })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })
})
