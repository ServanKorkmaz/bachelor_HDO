/** Helpers for user-visible (Norwegian) labels and small translations. */
export function holidayTypeToNorwegian(type: string | undefined): string {
  if (!type) return ''
  switch (type.toUpperCase()) {
    case 'HOLIDAY':
      return 'Ferie'
    case 'ABSENCE':
      return 'Fravær'
    case 'SICKNESS':
      return 'Sykdom'
    default:
      return type.toLowerCase()
  }
}

export function statusToNorwegian(status: string | undefined): string {
  if (!status) return ''
  switch (status.toUpperCase()) {
    case 'PENDING':
      return 'VENTER...'
    case 'APPROVED':
      return 'GODKJENT'
    case 'REJECTED':
      return 'AVVIST'
    default:
      return status
  }
}
