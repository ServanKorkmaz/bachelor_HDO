/**
 * Reads current user id from request (header x-current-user-id, GET currentUserId, or JSON body currentUserId).
 * Use for audit actor or non-admin routes. Does not validate that the user exists.
 */
export async function getCurrentUserId(request: Request): Promise<string | null> {
  let currentUserId: string | null =
    request.headers.get('x-current-user-id')?.trim() || null

  if (!currentUserId) {
    const url = new URL(request.url)
    currentUserId = url.searchParams.get('currentUserId')?.trim() || null
  }
  if (!currentUserId) {
    try {
      const body = await request.clone().json().catch(() => ({}))
      currentUserId = (body as { currentUserId?: string })?.currentUserId ?? null
    } catch {
      // no body or not json
    }
  }
  return currentUserId
}
