import type { BookCacheStats, CacheStats } from '@/lib/types/api'
import type { WordTimestamp } from '@/lib/types/wordTimestamp'

export interface CacheService {
  /** Check if audio exists in cache (metadata-only, no disk read) */
  has(text: string, voice: string): Promise<boolean>

  /** Batch presence check; result aligns with `texts` order (metadata-only, no disk read) */
  hasMany(texts: string[], voice: string): Promise<boolean[]>

  /** Get cached audio duration in ms (0 if not found) */
  getDurationMs(text: string, voice: string): Promise<number>

  /** Get cached audio for a text/voice combination */
  get(text: string, voice: string): Promise<Buffer | null>

  /** Store audio in cache */
  set(
    text: string,
    voice: string,
    audio: Buffer,
    bookId?: string,
    durationMs?: number,
  ): Promise<boolean>

  /** Get cache statistics */
  getStats(): Promise<CacheStats>

  /** Get cached word timestamps for a text/voice combination */
  getTimestamps(text: string, voice: string): Promise<WordTimestamp[] | null>

  /** Store word timestamps sidecar */
  setTimestamps(text: string, voice: string, timestamps: WordTimestamp[]): Promise<void>

  /** Clear all cached data */
  clear(): Promise<void>

  /** Get per-book cache usage breakdown */
  getBookStats(): Promise<BookCacheStats[]>

  /** Delete all cached entries for a specific book (across all voices) */
  deleteByBookId(bookId: string): Promise<number>

  /** Delete cached entries for a specific (book, voice) pair */
  deleteByBookIdAndVoice(bookId: string, voice: string): Promise<number>

  /** Update the maximum cache size and persist to settings */
  setMaxSizeMB(megabytes: number): Promise<void>

  /** Count cached entries for a specific book + voice combination */
  countBookVoiceEntries(bookId: string, voice: string): Promise<number>

  /**
   * One pass over the metadata building per-(bookId, voice) counts.
   * Avoids the N×M scan of calling countBookVoiceEntries per book.
   */
  countAllBookVoiceEntries(): Promise<Map<string, number>>
}
