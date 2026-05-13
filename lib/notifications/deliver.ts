import { prisma } from '@/lib/prisma'
import { sendEmail } from './sendEmail'
import { sendSms } from './sendSms'

const SHIFT_TYPES = ['SHIFT_CREATED', 'SHIFT_UPDATED', 'SHIFT_DELETED']
const SWAP_TYPES = ['SWAP_REQUESTED', 'SWAP_APPROVED', 'SWAP_REJECTED', 'SWAP_EXECUTED']
const NOTE_TYPES = ['NOTE_CREATED', 'NOTE_STATUS_CHANGED']

interface DeliverParams {
  userId: string
  teamId: string
  type: string
  title: string
  message: string
}

/**
 * Deliver a notification to the user's preferred channels (email/SMS) based
 * on their saved preferences. Every attempt is recorded in
 * `notification_delivery_log` so a failed SMTP call can be discovered later
 * instead of disappearing into console output.
 *
 * This function never throws — failures are persisted, not propagated, so
 * callers can safely fire-and-forget.
 */
export async function deliverNotificationToChannels(params: DeliverParams): Promise<void> {
  const { userId, teamId, type, title, message } = params

  const [user, prefs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.userNotificationPreference.findUnique({
      where: { userId },
    }),
  ]).catch(() => [null, null] as const)

  if (!user?.email) return

  const defaultPrefs = {
    shiftChangesEmail: true,
    shiftChangesSms: false,
    swapEmail: true,
    swapSms: false,
    noteEmail: true,
    noteSms: false,
  }
  const p = prefs ?? defaultPrefs

  let sendEmailAllowed = false
  let sendSmsAllowed = false

  if (SHIFT_TYPES.includes(type)) {
    sendEmailAllowed = p.shiftChangesEmail
    sendSmsAllowed = p.shiftChangesSms
  } else if (SWAP_TYPES.includes(type)) {
    sendEmailAllowed = p.swapEmail
    sendSmsAllowed = p.swapSms
  } else if (NOTE_TYPES.includes(type)) {
    sendEmailAllowed = p.noteEmail
    sendSmsAllowed = p.noteSms
  }

  if (sendEmailAllowed) {
    await attemptDelivery({
      userId,
      teamId,
      type,
      channel: 'EMAIL',
      recipient: user.email,
      send: () => sendEmail({ to: user.email!, subject: title, body: message, teamId, userId, type }),
    })
  }

  if (sendSmsAllowed) {
    await attemptDelivery({
      userId,
      teamId,
      type,
      channel: 'SMS',
      recipient: '', // populated when the SMS provider integration lands
      send: () => sendSms({ to: '', message: `${title}: ${message}`, teamId, userId }),
    })
  }
}

interface AttemptParams {
  userId: string
  teamId: string
  type: string
  channel: 'EMAIL' | 'SMS'
  recipient: string
  send: () => Promise<void>
}

/**
 * Run a single channel send and record the outcome. Internal helper —
 * exceptions thrown by the send function are caught and logged, never
 * re-thrown.
 */
async function attemptDelivery(params: AttemptParams): Promise<void> {
  let errorMessage: string | null = null
  try {
    await params.send()
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
  }

  try {
    await prisma.notificationDeliveryLog.create({
      data: {
        teamId: params.teamId,
        userId: params.userId,
        channel: params.channel,
        notificationType: params.type,
        recipient: params.recipient,
        status: errorMessage ? 'FAILED' : 'SENT',
        errorMessage,
      },
    })
  } catch (logErr) {
    // Last-resort: the DB itself is down. Surface to the runtime log so the
    // operator notices something, but never throw to the caller.
    console.error('[deliver] failed to persist delivery log:', logErr)
  }
}
