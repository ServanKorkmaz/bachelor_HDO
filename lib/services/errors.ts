import { NextResponse } from 'next/server'

/**
 * Domain-layer error thrown from anything under `lib/services/`. Carries an
 * HTTP status alongside the message so route handlers can map it to a
 * response with a single line:
 *
 *   if (error instanceof ServiceError) {
 *     return NextResponse.json({ error: error.message }, { status: error.status })
 *   }
 *
 * The `code` field is a short machine-readable tag (e.g. `'SHIFT_NOT_FOUND'`)
 * that callers/tests can match on without parsing the human message.
 */
export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

/**
 * Helper for the recurring "catch ServiceError, map to JSON response" idiom
 * at the bottom of route handlers. Returns null if the error isn't a
 * ServiceError so the caller can re-throw or default to 500.
 */
export function serviceErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  return null
}
