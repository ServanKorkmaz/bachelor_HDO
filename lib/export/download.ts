/**
 * Trigger a browser download for an in-memory blob without going through a
 * server round-trip. The hidden anchor + revokeObjectURL pattern is the only
 * reliable way to do this cross-browser as of writing.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Defer revocation so Firefox has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
