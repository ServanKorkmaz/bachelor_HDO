import { NextResponse } from 'next/server'
import { z } from 'zod'

export type ParseResult<T> = { data: T } | { error: NextResponse }

/**
 * Parse the JSON body of a request and validate it against a Zod schema.
 * On success, returns `{ data }`. On failure, returns `{ error }` — a 400
 * NextResponse with field-level details.
 */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<ParseResult<z.infer<T>>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { error: 'Ugyldig data', details: parsed.error.flatten() },
        { status: 400 }
      ),
    }
  }
  return { data: parsed.data }
}
