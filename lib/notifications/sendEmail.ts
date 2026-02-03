/** Payload for sending an email notification. (In-app notification is created by the API route.) */
export interface EmailNotification {
  to: string
  subject: string
  body: string
  teamId: string
  userId?: string
  type: string
}

/** Send an email notification (stubbed – logs to console; wire to real provider later). */
export async function sendEmail(notification: EmailNotification): Promise<void> {
  console.log('📧 Email notification:', {
    to: notification.to,
    subject: notification.subject,
    body: notification.body,
  })
}

