import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockSendEmail, mockSendSms } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    userNotificationPreference: { findUnique: vi.fn() },
    notificationDeliveryLog: { create: vi.fn() },
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
    mockPrisma.notificationDeliveryLog.create.mockResolvedValue({})
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

  // === Delivery logging. L5 fix ===

  it('writes a SENT row on a successful email delivery', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'alice@example.com' })

    await deliverNotificationToChannels(baseParams)

    expect(mockPrisma.notificationDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'EMAIL',
          notificationType: 'SHIFT_CREATED',
          recipient: 'alice@example.com',
          status: 'SENT',
          errorMessage: null,
        }),
      })
    )
  })

  it('writes a FAILED row with the error message when email send throws', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'alice@example.com' })
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP connection refused'))

    // Must not throw to caller. Failures are persisted, not propagated
    await expect(deliverNotificationToChannels(baseParams)).resolves.toBeUndefined()

    expect(mockPrisma.notificationDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'EMAIL',
          status: 'FAILED',
          errorMessage: 'SMTP connection refused',
        }),
      })
    )
  })

  it('does not throw when even the delivery-log write fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'alice@example.com' })
    mockPrisma.notificationDeliveryLog.create.mockRejectedValueOnce(new Error('DB down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(deliverNotificationToChannels(baseParams)).resolves.toBeUndefined()

    consoleError.mockRestore()
  })
})
