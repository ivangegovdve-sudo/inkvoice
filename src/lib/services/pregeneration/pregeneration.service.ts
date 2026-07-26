import { env } from '@/lib/config/env'
import { isSpeakableText } from '@/lib/helpers/isSpeakableText/isSpeakableText'
import { getBookService } from '@/lib/services/book/book.service'
import { getCacheService } from '@/lib/services/cache/cache.service'
import { diskSpaceService } from '@/lib/services/platform/diskSpace'
import { pregenEvents } from '@/lib/services/pregenEvents/pregenEvents.service'
import { pregenQueueService } from '@/lib/services/pregenQueue/pregenQueue.service'
import { PREGEN_JOB_STATUS, type PregenJob } from '@/lib/services/pregenQueue/pregenQueue.types'
import { getPythonClient } from '@/lib/services/pythonClient/pythonClient'
import { getTTSService } from '@/lib/services/tts/tts.server'

import { DEFAULT_VOICE } from '@/lib/services/voice/voice.consts'

import {
  BASE_BACKOFF_MS,
  CACHED_SKIP_EMIT_INTERVAL,
  DISK_CHECK_INTERVAL,
  MAX_BACKOFF_MS,
  MAX_RETRIES_PER_PARAGRAPH,
  MIN_DISK_FREE_BYTES,
  POLL_INTERVAL_MS,
  WARMUP_TEXT,
  WARMUP_TIMEOUT_MS,
} from './pregeneration.consts'

const getBackoffMs = (attempt: number): number =>
  Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)

interface PregenWorkerState {
  running: boolean
  loopId: number
  warmedUpInstanceId: number
  stoppedJobIds: Set<string>
}

interface PregenPosition {
  chapter: number
  paragraph: number
}

declare global {
  var pregenWorkerState: PregenWorkerState | undefined
}

const createPregenWorkerState = (): PregenWorkerState => ({
  running: false,
  loopId: 0,
  warmedUpInstanceId: -1,
  stoppedJobIds: new Set(),
})

const state = globalThis.pregenWorkerState ?? createPregenWorkerState()

if (process.env.NODE_ENV !== 'production') {
  globalThis.pregenWorkerState = state
}

// No `if (state.running) return` guard — start() must always spawn a fresh loop.
// The previous loop exits via loopId mismatch. This ensures recovery from
// silent loop death (e.g., HMR module reload dropping the async continuation).
const start = (): void => {
  state.running = true
  state.loopId++
  processLoop(state.loopId)
}

const stop = (): void => {
  state.running = false
  state.loopId++
}

const isRunning = (): boolean => state.running

const signalStop = (jobId: string): void => {
  state.stoppedJobIds.add(jobId)
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const emitJob = (job: PregenJob, samplingRate?: number): void => {
  pregenEvents.emit({ type: 'update', job, samplingRate })
}

const logVanished = (jobId: string, stage: string): void => {
  console.warn(`[pregen] job ${jobId} vanished during ${stage}, exiting loop`)
}

const warmUpTTS = async (bookId: string): Promise<void> => {
  const client = getPythonClient()

  // Reset warmup tracking when Python instance changes (model is gone after restart)
  if (state.warmedUpInstanceId === client.getCurrentInstanceId()) return
  console.warn('[pregen] Warming up TTS model...')
  const start = Date.now()

  pregenEvents.emit({ type: 'warmup_start', bookId })
  while (state.warmedUpInstanceId !== client.getCurrentInstanceId()) {
    try {
      const response = await client.fetch('/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: WARMUP_TEXT,
          voice: DEFAULT_VOICE,
        }),
        signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
      })

      await response.arrayBuffer()
      if (!response.ok) throw new Error(`${response.status}`)
      state.warmedUpInstanceId = client.getCurrentInstanceId()
    } catch {
      await sleep(5_000)
    }
  }
  pregenEvents.emit({ type: 'warmup_complete', bookId })
  console.warn(`[pregen] TTS ready (${((Date.now() - start) / 1000).toFixed(1)}s)`)
}

const processLoop = async (myLoopId: number): Promise<void> => {
  while (state.running && state.loopId === myLoopId) {
    try {
      const job = await pregenQueueService.getNext()

      if (!job) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      await warmUpTTS(job.bookId)
      await processJob(job, myLoopId)
    } catch (error) {
      console.error('[pregen] unexpected error in processLoop:', error)
      await sleep(1000)
    }
  }
}

const processJob = async (job: PregenJob, myLoopId: number): Promise<void> => {
  const fresh = await pregenQueueService.getJob(job.id)

  if (!fresh || fresh.status === PREGEN_JOB_STATUS.PAUSED) return

  const started = await pregenQueueService.start(job.id)

  if (!started) {
    logVanished(job.id, 'start')
    return
  }
  emitJob(started)

  const bookService = getBookService()
  const cacheService = getCacheService()
  const overview = await bookService.getBookOverview(job.bookId)

  if (!overview) {
    const paused = await pregenQueueService.pause(job.id, 'Book not found')

    if (paused) emitJob(paused)
    return
  }

  let completedParagraphs = job.completedParagraphs
  let cumulativeDurationMs = job.generatedDurationMs
  let cachedSkipsSinceEmit = 0

  // A job repositioned backward re-walks paragraphs its preserved counter
  // already includes — clamp so progress can never read past the total.
  const countParagraphCompleted = () => {
    completedParagraphs = Math.min(completedParagraphs + 1, job.totalParagraphs)
  }

  const getNextPosition = (chapter: number, paragraph: number): PregenPosition => {
    const chapterInfo = overview.chapters[chapter]

    return chapterInfo && paragraph + 1 < chapterInfo.paragraphCount
      ? { chapter, paragraph: paragraph + 1 }
      : { chapter: chapter + 1, paragraph: 0 }
  }

  // Complete a paragraph without TTS (cache hit, or an unspeakable separator
  // that can never have audio); SSE emits stay batched. Returns false when the
  // job row vanished and the worker must bail.
  const recordSkippedParagraph = async (
    ch: number,
    para: number,
    durationMs: number,
    logContext: string,
  ): Promise<boolean> => {
    countParagraphCompleted()
    cumulativeDurationMs += durationMs
    cachedSkipsSinceEmit++
    const nextPosition = getNextPosition(ch, para)
    const updated = await pregenQueueService.updateProgress(
      job.id,
      nextPosition.chapter,
      nextPosition.paragraph,
      completedParagraphs,
      cumulativeDurationMs,
    )

    if (!updated) {
      logVanished(job.id, logContext)
      return false
    }
    if (cachedSkipsSinceEmit >= CACHED_SKIP_EMIT_INTERVAL) {
      emitJob(updated)
      cachedSkipsSinceEmit = 0
    }
    return true
  }

  for (let ch = job.currentChapter; ch < overview.chapters.length; ch++) {
    const chapter = overview.chapters[ch]

    if (!chapter) continue
    const startPara = ch === job.currentChapter ? job.currentParagraph : 0

    for (let para = startPara; para < chapter.paragraphCount; para++) {
      // Worker restart → requeue so job gets picked up again
      if (state.loopId !== myLoopId || !state.running) {
        const requeued = await pregenQueueService.resume(job.id)

        if (requeued) emitJob(requeued)
        return
      }

      if (state.stoppedJobIds.has(job.id)) {
        state.stoppedJobIds.delete(job.id)
        return
      }

      if (completedParagraphs % DISK_CHECK_INTERVAL === 0) {
        try {
          const diskInfo = await diskSpaceService.getAvailableSpace(env.cacheDir)

          if (diskInfo.available < MIN_DISK_FREE_BYTES) {
            const availGB = (diskInfo.available / 1024 / 1024 / 1024).toFixed(2)
            const minGB = (MIN_DISK_FREE_BYTES / 1024 / 1024 / 1024).toFixed(0)

            console.error(
              `[pregen] Disk space low — ${availGB} GB free (${diskInfo.percentFree}%), minimum: ${minGB} GB, path: ${env.cacheDir}`,
            )
            const paused = await pregenQueueService.pause(job.id, 'Disk space low')

            if (paused) emitJob(paused)
            return
          }
        } catch {
          // Disk check failed — continue anyway
        }
      }

      const text = await bookService.getParagraph(job.bookId, ch, para)

      if (!text) continue

      // Unspeakable paragraphs (table rules, "???" headlines) would synthesize
      // to silence — count them completed without TTS so the job can't pause
      // retrying audio that will never exist.
      if (!isSpeakableText(text)) {
        if (!(await recordSkippedParagraph(ch, para, 0, 'unspeakable-skip updateProgress'))) return
        continue
      }

      // Skip already-cached paragraphs
      const isCached = await cacheService.has(text, job.voice)

      if (isCached) {
        const durationMs = await cacheService.getDurationMs(text, job.voice)

        if (!(await recordSkippedParagraph(ch, para, durationMs, 'cached-skip updateProgress')))
          return
        continue
      }

      // Flush any pending cached skip progress before TTS
      if (cachedSkipsSinceEmit > 0) {
        const current = await pregenQueueService.getJob(job.id)

        if (current) emitJob(current)
        cachedSkipsSinceEmit = 0
      }

      let generated = false
      let cancelled = false

      for (let attempt = 0; attempt <= MAX_RETRIES_PER_PARAGRAPH; attempt++) {
        if (attempt > 0) {
          await sleep(getBackoffMs(attempt - 1))
          if (state.loopId !== myLoopId || !state.running) {
            const requeued = await pregenQueueService.resume(job.id)

            if (requeued) emitJob(requeued)
            return
          }
          if (state.stoppedJobIds.has(job.id)) {
            state.stoppedJobIds.delete(job.id)
            return
          }
        }

        const ttsResult = await (async () => {
          try {
            return await getTTSService().generate(text, job.voice)
          } catch (error) {
            console.warn(
              `[pregen] TTS attempt ${attempt + 1}/${MAX_RETRIES_PER_PARAGRAPH + 1} failed for ${job.bookId} ch${ch} p${para}:`,
              error,
            )
            return null
          }
        })()

        if (!ttsResult) continue

        const { audio, timestamps, durationMs, samplingRate } = ttsResult

        const persisted = await cacheService.set(text, job.voice, audio, job.bookId, durationMs)

        if (!persisted) continue
        if (timestamps) {
          cacheService.setTimestamps(text, job.voice, timestamps).catch(() => {})
        }

        countParagraphCompleted()
        cumulativeDurationMs += durationMs
        const nextPosition = getNextPosition(ch, para)
        const updated = await pregenQueueService.updateProgress(
          job.id,
          nextPosition.chapter,
          nextPosition.paragraph,
          completedParagraphs,
          cumulativeDurationMs,
        )

        if (!updated) {
          logVanished(job.id, 'post-TTS updateProgress')
          cancelled = true
          break
        }
        emitJob(updated, samplingRate ?? undefined)
        generated = true
        break
      }

      if (cancelled) return

      if (!generated) {
        const paused = await pregenQueueService.pause(
          job.id,
          `Chapter ${ch + 1}, paragraph ${para + 1}: failed after ${MAX_RETRIES_PER_PARAGRAPH} retries`,
        )

        if (paused) emitJob(paused)
        return
      }
    }
  }

  const completed = await pregenQueueService.complete(job.id)

  if (completed) emitJob(completed)
}

export { signalStop }

export const pregenWorker = {
  start,
  stop,
  isRunning,
}

export const resetPregenWorker = (): void => {
  state.running = false
  state.loopId++
  state.warmedUpInstanceId = -1
  state.stoppedJobIds.clear()
}

// Auto-recover: if module re-evaluates (HMR) but loop died, restart for pending jobs.
// Also reset orphaned in_progress jobs back to queued (from server restart or zombie loop death).
if (!state.running) {
  pregenQueueService
    .getAll()
    .then(jobs => {
      const orphaned = jobs.filter(j => j.status === PREGEN_JOB_STATUS.IN_PROGRESS)
      const hasWork = jobs.some(
        j => j.status === PREGEN_JOB_STATUS.QUEUED || j.status === PREGEN_JOB_STATUS.IN_PROGRESS,
      )

      if (orphaned.length > 0) {
        Promise.allSettled(orphaned.map(j => pregenQueueService.resume(j.id)))
          .then(() => {
            if (hasWork) start()
          })
          .catch(() => {})
      } else if (hasWork) {
        start()
      }
    })
    .catch(() => {})
}
