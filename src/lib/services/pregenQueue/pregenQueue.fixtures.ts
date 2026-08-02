import { PREGEN_JOB_STATUS, type PregenJob } from './pregenQueue.types'

/**
 * Test/story factory for PregenJob rows. Defaults are deliberately neutral
 * (queued, position zero) — a scenario must override every field it asserts on.
 */
export const buildPregenJob = (overrides: Partial<PregenJob> = {}): PregenJob => ({
  id: 'job-1',
  bookId: 'book-1',
  voice: 'narrator',
  status: PREGEN_JOB_STATUS.QUEUED,
  totalParagraphs: 100,
  completedParagraphs: 0,
  generatedDurationMs: 0,
  currentChapter: 0,
  currentParagraph: 0,
  generationStartChapter: 0,
  generationStartParagraph: 0,
  generationSegmentNumber: 0,
  readyWordsInSegment: 0,
  errorMessage: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})
