import { prisma } from '@/lib/prisma'

export interface EmailNotification {
  to: string
  subject: string
  body: string
  teamId: string
  userId?: string
  type: string
}

export async function sendEmail(notification: EmailNotification): Promise<void> {
  // Stub implementation - logs to console and stores in Notification table
  console.log('📧 Email notification:', {
    to: notification.to,
    subject: notification.subject,
    body: notification.body,
  })

  // Store notification in database
  await prisma.notification.create({
    data: {
      teamId: notification.teamId,
      userId: notification.userId,
      type: notification.type,
      title: notification.subject,
      message: notification.body,
    },
  })
}

