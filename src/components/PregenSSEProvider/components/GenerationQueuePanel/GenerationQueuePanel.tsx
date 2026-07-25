'use client'

import { Badge, type BadgeProps, useHotkeys } from '@carbonid1/design-system'
import { X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { computeGenerationRate } from '@/lib/helpers/computeGenerationRate/computeGenerationRate'
import { formatDuration } from '@/lib/helpers/formatDuration/formatDuration'
import { useTTSLifecycleStore } from '@/lib/hooks/useTTSLifecycle/useTTSLifecycle'
import type { PregenJob, PregenJobStatus } from '@/lib/services/pregenQueue/pregenQueue.types'
import type { LifecycleState } from '@/lib/services/pythonClient/pythonClient.types'
import { useLibraryStore } from '@/store/useLibraryStore'
import { type ProgressSample, usePregenStore } from '@/store/usePregenStore'

interface StatusBadge {
  label: string
  variant: BadgeProps['variant']
}

const STATUS_BADGES: Partial<Record<PregenJobStatus, StatusBadge>> = {
  queued: { label: 'Queued', variant: 'default' },
  in_progress: { label: 'Generating', variant: 'primary' },
  paused: { label: 'Paused', variant: 'attention' },
  completed: { label: 'Completed', variant: 'success' },
}

const WARMING_UP_BADGE: StatusBadge = { label: 'Warming up', variant: 'highlight' }

// SSE job payloads are cast, not schema-validated — a server shipping a status
// this client doesn't know must degrade to a plain badge, not crash the panel.
const FALLBACK_BADGE: StatusBadge = { label: 'Unknown', variant: 'default' }

const getStatusBadge = (status: PregenJobStatus): StatusBadge =>
  STATUS_BADGES[status] ?? FALLBACK_BADGE

// e.g. "37m" — time until the job finishes at the recently measured pace.
const getRemainingLabel = (
  job: PregenJob,
  samples: ProgressSample[] | undefined,
): string | null => {
  if (job.status !== 'in_progress' || !samples) return null

  const rate = computeGenerationRate(samples)
  const remainingParagraphs = job.totalParagraphs - job.completedParagraphs

  if (!rate || remainingParagraphs <= 0) return null
  return formatDuration((remainingParagraphs / rate) * 1000) || null
}

const TTS_LIFECYCLE_BADGES: Record<LifecycleState, StatusBadge> = {
  stopped: { label: 'Idle', variant: 'default' },
  starting: { label: 'Starting', variant: 'attention' },
  ready: { label: 'Ready', variant: 'success' },
  stopping: { label: 'Stopping', variant: 'attention' },
}

export const GenerationQueuePanel = () => {
  const open = usePregenStore(s => s.panelOpen)
  const togglePanel = usePregenStore(s => s.togglePanel)
  const jobs = usePregenStore(s => s.jobs)
  const samplingRates = usePregenStore(s => s.samplingRates)
  const progressSamples = usePregenStore(s => s.progressSamples)
  const warmingUpBookId = usePregenStore(s => s.warmingUpBookId)
  const books = useLibraryStore(s => s.books)
  const loadBooks = useLibraryStore(s => s.loadBooks)
  const ttsLifecycleState = useTTSLifecycleStore(s => s.state)
  const ttsBadge = TTS_LIFECYCLE_BADGES[ttsLifecycleState]

  useHotkeys('d', togglePanel)

  const bookTitles = useMemo(() => {
    const map: Record<string, string> = {}

    for (const book of books) {
      map[book.id] = book.title
    }
    return map
  }, [books])

  const jobList = useMemo(() => Object.values(jobs), [jobs])

  // Only the Library page fills the library store; opened anywhere else, jobs
  // would render as raw book IDs. Gated on open-with-jobs so idle pages never
  // fetch; loadBooks itself is a no-op once a load attempt has settled.
  useEffect(() => {
    if (!open || jobList.length === 0) return
    loadBooks()
  }, [open, jobList.length, loadBooks])

  if (!open) return null

  return (
    <section
      aria-label="Generation Queue"
      className="border-border bg-popover shadow-popover fixed right-4 bottom-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-lg border"
    >
      <div className="border-border flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Generation Queue</h2>
          <Badge variant={ttsBadge.variant}>TTS · {ttsBadge.label}</Badge>
        </div>
        <button
          onClick={togglePanel}
          aria-label="Close generation queue"
          className="hover:bg-accent rounded p-1"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {jobList.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">No generation jobs</p>
        ) : (
          <ul className="space-y-1">
            {jobList.map(job => {
              const status =
                warmingUpBookId === job.bookId ? WARMING_UP_BADGE : getStatusBadge(job.status)
              const title = bookTitles[job.bookId] ?? job.bookId
              const remainingLabel = getRemainingLabel(job, progressSamples[job.bookId])

              return (
                <li
                  key={job.id}
                  aria-label={`${title}: ${status.label}, ${job.completedParagraphs} of ${job.totalParagraphs} paragraphs${remainingLabel ? `, about ${remainingLabel} left` : ''}`}
                  className="bg-surface-inset inset-shadow-surface rounded-md px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{title}</span>
                    <Badge variant={status.variant} className="shrink-0">
                      {status.label}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
                    <span>
                      {job.completedParagraphs} / {job.totalParagraphs}
                      {job.generatedDurationMs > 0 &&
                        ` · ${formatDuration(job.generatedDurationMs)}`}
                      {job.status === 'in_progress' &&
                        samplingRates[job.bookId] != null &&
                        ` · ${samplingRates[job.bookId]?.toFixed(1)} it/s`}
                      {remainingLabel && ` · ~${remainingLabel} left`}
                    </span>
                    {job.errorMessage && (
                      <span className="text-destructive truncate">{job.errorMessage}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
