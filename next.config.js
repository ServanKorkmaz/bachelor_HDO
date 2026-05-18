/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained `.next/standalone/` build that the Dockerfile copies
  // into a minimal runtime image. Drops final image size from ~1 GB (full
  // node_modules) to ~200 MB (only the JS Next.js actually traces to be used
  // at runtime). See Dockerfile and https://nextjs.org/docs/app/api-reference/next-config-js/output
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

module.exports = nextConfig

