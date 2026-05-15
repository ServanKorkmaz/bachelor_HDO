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
      return 'Venter'
    case 'AWAITING_ACCEPTANCE':
      return 'Venter på svar'
    case 'APPROVED':
      return 'Godkjent'
    case 'REJECTED':
      return 'Avvist'
    case 'EXECUTED':
      return 'Gjennomført'
    default:
      return status
  }
}
