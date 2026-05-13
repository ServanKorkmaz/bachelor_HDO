// Placeholder for the production auth flow.
//
// The production system runs in a Docker container with a Node.js runtime and
// authenticates via Microsoft (Azure AD / Entra ID) using passport-microsoft:
// https://www.passportjs.org/packages/passport-microsoft/
//
// Migration touches a single seam — see SECURITY.md "Migration to
// passport-microsoft". The wrapper pattern in `lib/auth/withAuth.ts`,
// per-resource authz in `assertTeamMember`, and every route handler stay
// untouched.
//
// Sketch:
//
// /*
// import passport from 'passport'
// import { Strategy as MicrosoftStrategy } from 'passport-microsoft'
//
// passport.use(new MicrosoftStrategy({
//   clientID: process.env.AZURE_AD_CLIENT_ID!,
//   clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
//   callbackURL: process.env.AZURE_AD_CALLBACK_URL!,
//   scope: ['user.read'],
//   tenant: process.env.AZURE_AD_TENANT_ID!,
// }, async (_accessToken, _refreshToken, profile, done) => {
//   // Look up or provision the User row, then return it. The user's id ends
//   // up in the signed session cookie that middleware.ts verifies and
//   // lib/auth/getCurrentUserId.ts reads.
//   const user = await upsertUserFromMicrosoftProfile(profile)
//   done(null, { id: user.id })
// }))
// */
//
// Session cookie: iron-session or cookie-session, signed (HMAC) so middleware
// can verify in the Edge Runtime without a DB lookup. SameSite=Lax for CSRF
// resilience; Secure in production.

export {}
