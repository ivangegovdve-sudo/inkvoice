import { execSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach } from 'vitest'

type PrismaEnvironment = Pick<NodeJS.ProcessEnv, 'PATH' | 'INKVOICE_DB_PATH' | 'NODE_ENV'>

const tmpDir = path.join(process.cwd(), 'tests/integration/.tmp')
const dbPath = path.join(tmpDir, `test-${process.pid}.db`)
const prismaEnv: PrismaEnvironment = {
  PATH: process.env.PATH,
  INKVOICE_DB_PATH: dbPath,
  NODE_ENV: 'development',
}

process.env.INKVOICE_DB_PATH = dbPath

// Order matters: child tables before parents in case PRAGMA foreign_keys is ever enabled.
// Keep in sync with prisma/schema.prisma.
const TABLES = [
  'Bookmark',
  'ReadingProgress',
  'PregenJob',
  'VoicePreference',
  'VoiceMetadata',
  'UserSetting',
  'CacheEntry',
  'Book',
]

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true })
  rmSync(dbPath, { force: true })
  execSync('./node_modules/.bin/prisma migrate deploy', {
    // Prisma's schema engine interprets test-runner variables as its own test mode.
    env: prismaEnv,
    stdio: 'pipe',
  })
})

afterAll(async () => {
  const { prisma } = await import('@/lib/services/db/db.service')

  await prisma.$disconnect()
  rmSync(dbPath, { force: true })
})

beforeEach(async () => {
  const { prisma } = await import('@/lib/services/db/db.service')

  await prisma.$transaction(TABLES.map(table => prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)))
})
