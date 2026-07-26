import { z } from 'zod'

export const pregenJobStatusSchema = z.enum(['queued', 'in_progress', 'paused', 'completed'])

export type PregenJobStatus = z.infer<typeof pregenJobStatusSchema>

export const PREGEN_JOB_STATUS = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  COMPLETED: 'completed',
} as const satisfies Record<string, PregenJobStatus>

export interface PregenJob {
  id: string
  bookId: string
  voice: string
  status: PregenJobStatus
  totalParagraphs: number
  completedParagraphs: number
  generatedDurationMs: number
  /** Next paragraph the worker will process. */
  currentChapter: number
  currentParagraph: number
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}
