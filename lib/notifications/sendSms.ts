// Placeholder for future SMS endpoint integration
export interface SmsNotification {
  to: string
  message: string
  teamId: string
  userId?: string
}

export async function sendSms(notification: SmsNotification): Promise<void> {
  // Stub implementation - placeholder for existing SMS endpoint integration
  console.log('📱 SMS notification (stub):', {
    to: notification.to,
    message: notification.message,
  })
  
  // TODO: Integrate with existing SMS endpoint when available
  // Example: await fetch('https://sms-endpoint.example.com/send', { ... })
}

