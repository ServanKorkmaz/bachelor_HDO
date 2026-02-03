import { prisma } from '@/lib/prisma'
import { sendEmail } from './sendEmail'
import { sendSms } from './sendSms'

const SHIFT_TYPES = ['SHIFT_CREATED', 'SHIFT_UPDATED', 'SHIFT_DELETED']
const SWAP_TYPES = ['SWAP_REQUESTED', 'SWAP_APPROVED', 'SWAP_REJECTED', 'SWAP_EXECUTED']
const NOTE_TYPES = ['NOTE_CREATED', 'NOTE_STATUS_CHANGED']

/** Deliver notification to user's preferred channels (email/SMS) based on their preferences. */
export async function deliverNotificationToChannels(params: {
  userId: string
  teamId: string
  type: string
  title: string
  message: string
}): Promise<void> {
  const { userId, teamId, type, title, message } = params

  const [user, prefs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.userNotificationPreference.findUnique({
      where: { userId },
    }),
  ])

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
    await sendEmail({
      to: user.email,
      subject: title,
      body: message,
      teamId,
      userId,
      type,
    })
  }

  if (sendSmsAllowed) {
    await sendSms({
      to: '', // placeholder – no phone on User yet
      message: `${title}: ${message}`,
      teamId,
      userId,
    })
  }
}
