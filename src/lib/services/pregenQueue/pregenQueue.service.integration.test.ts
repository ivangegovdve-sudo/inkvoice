import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/services/db/db.service'
import { pregenQueueService } from './pregenQueue.service'

const MISSING_ID = '00000000-0000-0000-0000-000000000000'

describe('pregenQueueService (integration) — P2025 race policy', () => {
  it('start() returns null when the job row does not exist', async () => {
    const result = await pregenQueueService.start(MISSING_ID)

    expect(result).toBeNull()
  })

  it('updateProgress() returns null when the job row does not exist', async () => {
    const result = await pregenQueueService.updateProgress(MISSING_ID, 0, 0, 0)

    expect(result).toBeNull()
  })

  it('pause() returns null when the job row does not exist', async () => {
    const result = await pregenQueueService.pause(MISSING_ID)

    expect(result).toBeNull()
  })

  it('resume() returns null when the job row does not exist', async () => {
    const result = await pregenQueueService.resume(MISSING_ID)

    expect(result).toBeNull()
  })

  it('complete() returns null when the job row does not exist', async () => {
    const result = await pregenQueueService.complete(MISSING_ID)

    expect(result).toBeNull()
  })

  it('cancel() reports deleted: false when the row does not exist', async () => {
    const result = await pregenQueueService.cancel(MISSING_ID)

    expect(result).toEqual({ deleted: false })
  })

  it('cancel() reports deleted: true when the row exists', async () => {
    const job = await pregenQueueService.enqueue('book-1', 'narrator', 100)

    const result = await pregenQueueService.cancel(job.id)

    expect(result).toEqual({ deleted: true })
  })
})

describe('pregenQueueService (integration) — reposition', () => {
  it('moves the cursor and requeues while preserving job identity and progress', async () => {
    const job = await pregenQueueService.enqueue('book-reposition', 'narrator', 364)
    const inProgress = await pregenQueueService.start(job.id)
    const progressed = await pregenQueueService.updateProgress(job.id, 3, 20, 121, 2_220_000)

    expect(inProgress).not.toBeNull()
    expect(progressed).not.toBeNull()

    const repositioned = await pregenQueueService.reposition(job.id, 7, 5)

    expect(repositioned).toMatchObject({
      bookId: 'book-reposition',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 364,
      completedParagraphs: 121,
      generatedDurationMs: 2_220_000,
      currentChapter: 7,
      currentParagraph: 5,
      errorMessage: null,
      createdAt: job.createdAt,
    })
  })

  it('invalidates the old job id so a worker mid-paragraph cannot overwrite the new cursor', async () => {
    const job = await pregenQueueService.enqueue('book-reposition-stale', 'narrator', 100)

    const repositioned = await pregenQueueService.reposition(job.id, 4, 0)
    const staleWrite = await pregenQueueService.updateProgress(job.id, 1, 9, 10)

    expect(repositioned).not.toBeNull()
    expect(staleWrite).toBeNull()
    expect(await pregenQueueService.getByBookId('book-reposition-stale')).toMatchObject({
      id: repositioned?.id,
      currentChapter: 4,
      currentParagraph: 0,
    })
  })

  it('returns null when the job row does not exist', async () => {
    const result = await pregenQueueService.reposition(MISSING_ID, 2, 0)

    expect(result).toBeNull()
  })

  it('enqueue() starts the cursor at the requested chapter and paragraph', async () => {
    const job = await pregenQueueService.enqueue('book-start-position', 'narrator', 200, 5, 12)

    expect(job).toMatchObject({ currentChapter: 5, currentParagraph: 12 })
  })
})

describe('pregenQueueService (integration) — progress bounds', () => {
  it('persists completed progress at no more than the job total', async () => {
    const job = await pregenQueueService.enqueue('book-progress-bounds', 'narrator', 100)

    const updated = await pregenQueueService.updateProgress(job.id, 4, 12, 101)
    const persisted = await prisma.pregenJob.findUniqueOrThrow({ where: { id: job.id } })

    expect(updated?.completedParagraphs).toBe(100)
    expect(persisted.completedParagraphs).toBe(100)
  })

  it('normalizes an existing out-of-range row when returning it to callers', async () => {
    const job = await pregenQueueService.enqueue('book-legacy-progress', 'narrator', 100)

    await prisma.pregenJob.update({
      where: { id: job.id },
      data: { completedParagraphs: 101 },
    })

    const result = await pregenQueueService.getJob(job.id)

    expect(result?.completedParagraphs).toBe(100)
  })
})
