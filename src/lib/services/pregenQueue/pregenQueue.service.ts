import { swallowRecordNotFound } from '@/lib/helpers/swallowRecordNotFound/swallowRecordNotFound'
import { prisma } from '@/lib/services/db/db.service'

import { type PregenJob, PREGEN_JOB_STATUS, pregenJobStatusSchema } from './pregenQueue.types'

type PregenJobRow = NonNullable<Awaited<ReturnType<typeof prisma.pregenJob.findFirst>>>

interface PregenProgressUpdate {
  nextChapter: number
  nextParagraph: number
  completedParagraphs: number
  generatedDurationMs: number
  generationStartChapter: number
  generationStartParagraph: number
  generationSegmentNumber: number
  readyWordsInSegment: number
}

// SQLite stores `status` as TEXT (Prisma doesn't support native enums on
// SQLite), so the column is typed as string at the ORM layer. Validate at
// the repository boundary instead of casting.
const toPregenJob = (row: PregenJobRow): PregenJob => ({
  ...row,
  completedParagraphs: Math.min(row.completedParagraphs, row.totalParagraphs),
  status: pregenJobStatusSchema.parse(row.status),
})

const enqueue = async (
  bookId: string,
  voice: string,
  totalParagraphs: number,
  startChapter = 0,
  startParagraph = 0,
): Promise<PregenJob> => {
  const now = Date.now()
  const row = await prisma.pregenJob.create({
    data: {
      bookId,
      voice,
      totalParagraphs,
      currentChapter: startChapter,
      currentParagraph: startParagraph,
      generationStartChapter: startChapter,
      generationStartParagraph: startParagraph,
      generationSegmentNumber: 0,
      readyWordsInSegment: 0,
      createdAt: now,
      updatedAt: now,
    },
  })

  return toPregenJob(row)
}

const getNext = async (): Promise<PregenJob | null> => {
  const row = await prisma.pregenJob.findFirst({
    where: { status: PREGEN_JOB_STATUS.QUEUED },
    orderBy: { createdAt: 'asc' },
  })

  return row ? toPregenJob(row) : null
}

const getJob = async (id: string): Promise<PregenJob | null> => {
  const row = await prisma.pregenJob.findUnique({
    where: { id },
  })

  return row ? toPregenJob(row) : null
}

const getByBookId = async (bookId: string): Promise<PregenJob | null> => {
  const row = await prisma.pregenJob.findFirst({
    where: {
      bookId,
      status: {
        in: [PREGEN_JOB_STATUS.QUEUED, PREGEN_JOB_STATUS.IN_PROGRESS, PREGEN_JOB_STATUS.PAUSED],
      },
    },
  })

  return row ? toPregenJob(row) : null
}

const getAnyByBookId = async (bookId: string): Promise<PregenJob | null> => {
  const row = await prisma.pregenJob.findFirst({
    where: { bookId },
    orderBy: { createdAt: 'desc' },
  })

  return row ? toPregenJob(row) : null
}

const getAll = async (): Promise<PregenJob[]> => {
  const rows = await prisma.pregenJob.findMany({
    orderBy: { createdAt: 'asc' },
  })

  return rows.map(toPregenJob)
}

const start = (id: string): Promise<PregenJob | null> =>
  swallowRecordNotFound(async () => {
    const row = await prisma.pregenJob.update({
      where: { id },
      data: { status: PREGEN_JOB_STATUS.IN_PROGRESS, updatedAt: Date.now() },
    })

    return toPregenJob(row)
  })

const updateProgress = (id: string, progress: PregenProgressUpdate): Promise<PregenJob | null> =>
  swallowRecordNotFound(async () => {
    const row = await prisma.$transaction(async tx => {
      const current = await tx.pregenJob.findUniqueOrThrow({
        where: { id },
        select: { totalParagraphs: true },
      })

      return tx.pregenJob.update({
        where: { id },
        data: {
          currentChapter: progress.nextChapter,
          currentParagraph: progress.nextParagraph,
          completedParagraphs: Math.min(progress.completedParagraphs, current.totalParagraphs),
          generatedDurationMs: progress.generatedDurationMs,
          generationStartChapter: progress.generationStartChapter,
          generationStartParagraph: progress.generationStartParagraph,
          generationSegmentNumber: progress.generationSegmentNumber,
          readyWordsInSegment: progress.readyWordsInSegment,
          updatedAt: Date.now(),
        },
      })
    })

    return toPregenJob(row)
  })

const pause = (id: string, errorMessage?: string): Promise<PregenJob | null> =>
  swallowRecordNotFound(async () => {
    const row = await prisma.pregenJob.update({
      where: { id },
      data: {
        status: PREGEN_JOB_STATUS.PAUSED,
        errorMessage: errorMessage ?? null,
        updatedAt: Date.now(),
      },
    })

    return toPregenJob(row)
  })

const resume = (id: string): Promise<PregenJob | null> =>
  swallowRecordNotFound(async () => {
    const row = await prisma.pregenJob.update({
      where: { id },
      data: {
        status: PREGEN_JOB_STATUS.QUEUED,
        errorMessage: null,
        updatedAt: Date.now(),
      },
    })

    return toPregenJob(row)
  })

const complete = (id: string): Promise<PregenJob | null> =>
  swallowRecordNotFound(async () => {
    const row = await prisma.pregenJob.update({
      where: { id },
      data: { status: PREGEN_JOB_STATUS.COMPLETED, updatedAt: Date.now() },
    })

    return toPregenJob(row)
  })

// Replaces the row instead of updating it: the fresh job id makes a worker
// that is mid-paragraph on the old job see its row vanish at the next progress
// write and exit, instead of overwriting the new cursor with stale progress.
const reposition = (id: string, chapter: number, paragraph: number): Promise<PregenJob | null> =>
  swallowRecordNotFound(async () => {
    const row = await prisma.$transaction(async tx => {
      const old = await tx.pregenJob.delete({ where: { id } })

      return tx.pregenJob.create({
        data: {
          bookId: old.bookId,
          voice: old.voice,
          totalParagraphs: old.totalParagraphs,
          completedParagraphs: old.completedParagraphs,
          generatedDurationMs: old.generatedDurationMs,
          currentChapter: chapter,
          currentParagraph: paragraph,
          generationStartChapter: chapter,
          generationStartParagraph: paragraph,
          generationSegmentNumber: (old.generationSegmentNumber ?? 0) + 1,
          readyWordsInSegment: 0,
          createdAt: old.createdAt,
          updatedAt: Date.now(),
        },
      })
    })

    return toPregenJob(row)
  })

const cancel = async (id: string): Promise<{ deleted: boolean }> => {
  const result = await swallowRecordNotFound(() => prisma.pregenJob.delete({ where: { id } }))

  return { deleted: result !== null }
}

export const pregenQueueService = {
  enqueue,
  getNext,
  getJob,
  getByBookId,
  getAnyByBookId,
  getAll,
  start,
  updateProgress,
  pause,
  resume,
  complete,
  reposition,
  cancel,
}
