/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained `.next/standalone/` build that the Dockerfile copies
  // into a minimal runtime image. Drops final image size from ~1 GB (full
  // node_modules) to ~200 MB (only the JS Next.js actually traces to be used
  // at runtime). Toggled via NEXT_OUTPUT_STANDALONE so local `npm run start`
  // works without the standalone-specific static-file routing dance.
  // See Dockerfile and https://nextjs.org/docs/app/api-reference/next-config-js/output
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

module.exports = nextConfig

