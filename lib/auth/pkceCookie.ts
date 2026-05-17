import { sealData, unsealData } from 'iron-session'

const PKCE_COOKIE_NAME = '__hdo_pkce'
const PKCE_TTL_SECONDS = 600 // 10 minutes

function loadSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_COOKIE_SECRET must be a 32+ char string')
  }
  return secret
}

export interface PkceState {
  verifier: string
  state: string
  from: string
}

export const pkceCookieName = PKCE_COOKIE_NAME

export function pkceCookieOptions(maxAgeSeconds: number = PKCE_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

export async function sealPkce(state: PkceState): Promise<string> {
  return sealData(state, { password: loadSecret(), ttl: PKCE_TTL_SECONDS })
}

export async function unsealPkce(value: string): Promise<PkceState | null> {
  try {
    const data = await unsealData<PkceState>(value, { password: loadSecret(), ttl: PKCE_TTL_SECONDS })
    if (!data || typeof data.verifier !== 'string' || typeof data.state !== 'string') return null
    return data
  } catch {
    return null
  }
}
