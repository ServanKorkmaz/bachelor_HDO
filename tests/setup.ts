import '@testing-library/jest-dom/vitest'

// lib/auth/session.ts throws at module load when SESSION_COOKIE_SECRET is
// missing (production-safety guard). Tests that import any code that
// transitively imports session.ts (middleware, getCurrentUserId, route
// handlers) would otherwise fail at module-load time. Setting a fixed test
// secret here keeps the production guard intact while letting the suite
// load every module. Individual tests that need to assert the guard's
// behavior use `delete process.env.SESSION_COOKIE_SECRET` + `vi.resetModules()`.
process.env.SESSION_COOKIE_SECRET ??= 'a'.repeat(32)
