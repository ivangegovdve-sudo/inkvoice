import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { env } from '@/lib/config/env'
import { prisma } from '@/lib/services/db/db.service'
import { diskSpaceService } from '@/lib/services/platform/diskSpace'
import { SETTINGS_KEYS } from '@/lib/services/settings/settings.keys'
import { settingsService } from '@/lib/services/settings/settings.service'
import { DEFAULT_VOICE } from '@/lib/services/voice/voice.consts'
import type { BookCacheStats, CacheStats } from '@/lib/types/api'
import { type WordTimestamp, wordTimestampArraySchema } from '@/lib/types/wordTimestamp'
import type { CacheService } from './cache.types'

const DISK_SAFETY_MARGIN = 0.1

const normalizeVoice = (voice: string): string => voice || DEFAULT_VOICE

const getCacheHash = (text: string, voice: string): string => {
  const input = `${text.trim()}|${normalizeVoice(voice)}`

  return createHash('sha256').update(input).digest('hex')
}

class TTSCacheService implements CacheService {
  private initialized = false
  private initPromise: Promise<void> | null = null
  private cacheDir: string
  private effectiveMaxBytes: number

  constructor() {
    this.cacheDir = env.cacheDir
    this.effectiveMaxBytes = env.maxCacheSizeBytes
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this.initialize()
    await this.initPromise
  }

  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true })
      await this.computeEffectiveMax()
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize TTS cache:', error)
      this.initialized = true
    }
  }

  private async computeEffectiveMax(): Promise<void> {
    let configuredMax = env.maxCacheSizeBytes

    try {
      const savedMB = await settingsService.get(SETTINGS_KEYS.MAX_CACHE_SIZE_MB)

      if (typeof savedMB === 'number' && savedMB > 0) {
        configuredMax = savedMB * 1024 * 1024
      }
    } catch {
      // Settings read failed — use env default
    }

    this.effectiveMaxBytes = await this.clampToDisk(configuredMax)
  }

  async has(text: string, voice: string): Promise<boolean> {
    await this.ensureInitialized()
    const hash = getCacheHash(text, voice)
    const row = await prisma.cacheEntry.findUnique({
      where: { hash },
      select: { hash: true },
    })

    return row !== null
  }

  async hasMany(texts: string[], voice: string): Promise<boolean[]> {
    await this.ensureInitialized()
    const hashes = texts.map(text => getCacheHash(text, voice))
    const rows = await prisma.cacheEntry.findMany({
      where: { hash: { in: hashes } },
      select: { hash: true },
    })
    const present = new Set(rows.map(row => row.hash))

    return hashes.map(hash => present.has(hash))
  }

  async getDurationMs(text: string, voice: string): Promise<number> {
    await this.ensureInitialized()
    const hash = getCacheHash(text, voice)
    const row = await prisma.cacheEntry.findUnique({
      where: { hash },
      select: { durationMs: true },
    })

    return row?.durationMs ?? 0
  }

  async get(text: string, voice: string): Promise<Buffer | null> {
    await this.ensureInitialized()

    const hash = getCacheHash(text, voice)
    const filePath = path.join(this.cacheDir, `${hash}.opus`)

    try {
      return await fs.readFile(filePath)
    } catch {
      // File missing — purge any orphan DB row so future has() returns false.
      await prisma.cacheEntry.delete({ where: { hash } }).catch(() => {})
      return null
    }
  }

  async set(
    text: string,
    voice: string,
    audio: Buffer,
    bookId?: string,
    durationMs?: number,
  ): Promise<boolean> {
    await this.ensureInitialized()

    const hash = getCacheHash(text, voice)
    const filePath = path.join(this.cacheDir, `${hash}.opus`)
    const sizeBytes = audio.length
    const normalizedVoice = normalizeVoice(voice)

    try {
      await fs.writeFile(filePath, audio)

      await prisma.cacheEntry.upsert({
        where: { hash },
        create: {
          hash,
          bookId: bookId ?? null,
          voice: normalizedVoice,
          sizeBytes,
          durationMs: durationMs ?? null,
          createdAt: Date.now(),
        },
        update: {
          bookId: bookId ?? null,
          voice: normalizedVoice,
          sizeBytes,
          durationMs: durationMs ?? null,
        },
      })
      return true
    } catch (error) {
      console.error('Failed to write cache file:', error)
      return false
    }
  }

  async getStats(): Promise<CacheStats> {
    await this.ensureInitialized()
    const agg = await prisma.cacheEntry.aggregate({ _sum: { sizeBytes: true } })

    return {
      usedBytes: agg._sum.sizeBytes ?? 0,
      maxBytes: this.effectiveMaxBytes,
    }
  }

  async getTimestamps(text: string, voice: string): Promise<WordTimestamp[] | null> {
    await this.ensureInitialized()

    const hash = getCacheHash(text, voice)
    const filePath = path.join(this.cacheDir, `${hash}.json`)

    try {
      const data = await fs.readFile(filePath, 'utf-8')
      const parsed = wordTimestampArraySchema.safeParse(JSON.parse(data))

      if (!parsed.success) {
        console.warn(`[cache] Invalid timestamps for ${hash}: ${parsed.error.message}`)
        return null
      }
      return parsed.data
    } catch {
      return null
    }
  }

  async setTimestamps(text: string, voice: string, timestamps: WordTimestamp[]): Promise<void> {
    await this.ensureInitialized()

    const hash = getCacheHash(text, voice)
    const filePath = path.join(this.cacheDir, `${hash}.json`)

    try {
      await fs.writeFile(filePath, JSON.stringify(timestamps))
    } catch (error) {
      console.error('Failed to write timestamps sidecar:', error)
    }
  }

  private async deleteFiles(hash: string): Promise<void> {
    const audioPath = path.join(this.cacheDir, `${hash}.opus`)
    const jsonPath = path.join(this.cacheDir, `${hash}.json`)

    try {
      await fs.unlink(audioPath)
    } catch {}
    try {
      await fs.unlink(jsonPath)
    } catch {}
  }

  async getBookStats(): Promise<BookCacheStats[]> {
    await this.ensureInitialized()

    const groups = await prisma.cacheEntry.groupBy({
      by: ['bookId', 'voice'],
      _sum: { sizeBytes: true },
      _count: { _all: true },
    })

    return groups.map(group => ({
      bookId: group.bookId ?? 'unknown',
      voice: normalizeVoice(group.voice),
      usedBytes: group._sum.sizeBytes ?? 0,
      entryCount: group._count._all,
    }))
  }

  async countBookVoiceEntries(bookId: string, voice: string): Promise<number> {
    await this.ensureInitialized()
    return prisma.cacheEntry.count({ where: { bookId, voice: normalizeVoice(voice) } })
  }

  async countAllBookVoiceEntries(): Promise<Map<string, number>> {
    await this.ensureInitialized()

    const groups = await prisma.cacheEntry.groupBy({
      by: ['bookId', 'voice'],
      where: { bookId: { not: null } },
      _count: { _all: true },
    })

    const counts = new Map<string, number>()

    for (const group of groups) {
      if (!group.bookId) continue // type narrowing — runtime filter already applied via `where`
      counts.set(`${group.bookId}|${group.voice}`, group._count._all)
    }
    return counts
  }

  async setMaxSizeMB(megabytes: number): Promise<void> {
    await this.ensureInitialized()
    this.effectiveMaxBytes = await this.clampToDisk(megabytes * 1024 * 1024)
    await settingsService.set(SETTINGS_KEYS.MAX_CACHE_SIZE_MB, megabytes)
  }

  async deleteByBookId(bookId: string): Promise<number> {
    await this.ensureInitialized()
    return this.deleteEntriesMatching({ bookId })
  }

  async deleteByBookIdAndVoice(bookId: string, voice: string): Promise<number> {
    await this.ensureInitialized()
    return this.deleteEntriesMatching({ bookId, voice: normalizeVoice(voice) })
  }

  private async deleteEntriesMatching(where: { bookId: string; voice?: string }): Promise<number> {
    const matches = await prisma.cacheEntry.findMany({
      where,
      select: { hash: true, sizeBytes: true },
    })

    if (matches.length === 0) return 0

    await Promise.all(matches.map(({ hash }) => this.deleteFiles(hash)))
    await prisma.cacheEntry.deleteMany({ where: { hash: { in: matches.map(m => m.hash) } } })

    return matches.reduce((sum, m) => sum + m.sizeBytes, 0)
  }

  private async clampToDisk(requestedBytes: number): Promise<number> {
    try {
      const diskInfo = await diskSpaceService.getAvailableSpace(this.cacheDir)
      const safeAvailable = Math.floor(diskInfo.available * (1 - DISK_SAFETY_MARGIN))

      return Math.min(requestedBytes, safeAvailable)
    } catch {
      return requestedBytes
    }
  }

  async clear(): Promise<void> {
    await this.ensureInitialized()

    const all = await prisma.cacheEntry.findMany({ select: { hash: true } })

    await Promise.all(all.map(({ hash }) => this.deleteFiles(hash)))
    await prisma.cacheEntry.deleteMany({})
  }
}

let _cacheService: CacheService | null = null

export const getCacheService = (): CacheService => {
  if (!_cacheService) {
    _cacheService = new TTSCacheService()
  }
  return _cacheService
}

export const resetCacheService = (): void => {
  _cacheService = null
}
