import { ConfidentialClientApplication, type AuthenticationResult } from '@azure/msal-node'
import crypto from 'crypto'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} environment variable is required`)
  return v
}

const TENANT_ID = requireEnv('AZURE_TENANT_ID')
const CLIENT_ID = requireEnv('AZURE_CLIENT_ID')
const CLIENT_SECRET = requireEnv('AZURE_CLIENT_SECRET')
const REDIRECT_URI = requireEnv('AZURE_REDIRECT_URI')

const SCOPES = ['openid', 'profile', 'email']

let cachedClient: ConfidentialClientApplication | null = null

function getMsalClient(): ConfidentialClientApplication {
  if (cachedClient) return cachedClient
  cachedClient = new ConfidentialClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
      clientSecret: CLIENT_SECRET,
    },
  })
  return cachedClient
}

/** Tenant id that callback handlers must assert claims.tid matches. */
export const expectedTenantId = TENANT_ID

function generateVerifier(): string {
  // 32 random bytes → 43 base64url chars (within RFC 7636's 43-128 range).
  return crypto.randomBytes(32).toString('base64url')
}

function generateState(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function challengeFromVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export interface AuthCodeUrlResult {
  url: string
  verifier: string
  state: string
}

export async function buildAuthCodeUrl(): Promise<AuthCodeUrlResult> {
  const verifier = generateVerifier()
  const state = generateState()
  const url = await getMsalClient().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    state,
    codeChallenge: challengeFromVerifier(verifier),
    codeChallengeMethod: 'S256',
  })
  return { url, verifier, state }
}

export interface TokenExchangeInput {
  code: string
  codeVerifier: string
}

export async function exchangeCodeForTokens(input: TokenExchangeInput): Promise<AuthenticationResult> {
  const result = await getMsalClient().acquireTokenByCode({
    code: input.code,
    codeVerifier: input.codeVerifier,
    redirectUri: REDIRECT_URI,
    scopes: SCOPES,
  })
  if (!result) throw new Error('MSAL returned null AuthenticationResult')
  return result
}
