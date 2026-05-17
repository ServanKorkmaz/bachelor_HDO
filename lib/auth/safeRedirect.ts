/**
 * Validate a redirect-target path supplied via query string or cookie.
 * Defense against open-redirect attacks: only same-origin relative paths
 * starting with a single slash are allowed.
 */
export function isSafeInternalPath(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value[0] !== '/') return false
  if (value.startsWith('//') || value.startsWith('/\\')) return false
  if (/\s/.test(value)) return false
  if (value.includes(':')) return false
  return true
}

export function safeFromOrDefault(value: string | null | undefined): string {
  if (typeof value === 'string' && isSafeInternalPath(value)) return value
  return '/'
}
