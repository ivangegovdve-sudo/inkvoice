import { execSync } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { version } = require('./package.json')

const gitCommit = execSync('git rev-parse --short HEAD').toString().trim()
const gitMessage = execSync('git log -1 --format=%s').toString().trim()

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Next 16 allows one dev server per dist dir (.next/dev/lock); e2e sets
  // its own dir so the suite can run alongside the regular dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  allowedDevOrigins: ['inkvoice.localhost'],
  transpilePackages: ['@carbonid1/design-system'],
  serverExternalPackages: ['epub2'],
  outputFileTracingIncludes: {
    '/**': ['./generated/prisma/**', './node_modules/.prisma/**'],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
    NEXT_PUBLIC_GIT_MESSAGE: gitMessage,
  },
}

export default nextConfig
