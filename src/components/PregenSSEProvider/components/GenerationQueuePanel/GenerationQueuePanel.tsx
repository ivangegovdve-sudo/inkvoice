'use client'

import { Badge, type BadgeProps, Button, Item, Text, useHotkeys } from '@carbonid1/design-system'
import { X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { computeGenerationRate } from '@/lib/helpers/computeGenerationRate/computeGenerationRate'
import { formatDuration } from '@/lib/helpers/formatDuration/formatDuration'
import { getReadyPagesDisplay } from '@/lib/helpers/getReadyPagesDisplay/getReadyPagesDisplay'
import { useTTSLifecycleStore } from '@/lib/hooks/useTTSLifecycle/useTTSLifecycle'
import {
  type PregenJob,
  PREGEN_JOB_STATUS,
  type PregenJobStatus,
} from '@/lib/services/pregenQueue/pregenQueue.types'
import type { LifecycleState } from '@/lib/services/pythonClient/pythonClient.types'
import { useLibraryStore } from '@/store/useLibraryStore'
import { type ProgressSample, usePregenStore } from '@/store/usePregenStore'

interface StatusBadge {
  label: string
  variant: BadgeProps['variant']
}

const STATUS_BADGES: Partial<Record<PregenJobStatus, StatusBadge>> = {
  queued: { label: 'Queued', variant: 'default' },
  in_progress: { label: 'Generating', variant: 'default' },
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

const getJobMetadata = (job: PregenJob, wholeBook: boolean | undefined): string | null => {
  const durationLabel = formatDuration(job.generatedDurationMs)

  if (wholeBook) {
    return [
      job.status === PREGEN_JOB_STATUS.COMPLETED ? 'Entire book' : null,
      `${job.completedParagraphs} / ${job.totalParagraphs} paragraphs`,
      durationLabel ? `${durationLabel} audio` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  if (wholeBook === false && job.status === PREGEN_JOB_STATUS.COMPLETED) {
    return 'Ready to the end'
  }

  if (wholeBook === undefined) {
    return [
      `${job.completedParagraphs} / ${job.totalParagraphs} paragraphs`,
      durationLabel ? `${durationLabel} audio` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return null
}

export const GenerationQueuePanel = () => {
  const open = usePregenStore(s => s.panelOpen)
  const togglePanel = usePregenStore(s => s.togglePanel)
  const jobs = usePregenStore(s => s.jobs)
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
          <Text as="h2" variant="label" weight="semibold">
            Generation Queue
          </Text>
          <Badge variant={ttsBadge.variant}>TTS · {ttsBadge.label}</Badge>
        </div>
        <Button
          variant="ghost"
          size="smallIcon"
          onClick={togglePanel}
          aria-label="Close generation queue"
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {jobList.length === 0 ? (
          <Text color="muted" className="py-4 text-center">
            No generation jobs
          </Text>
        ) : (
          <ul className="space-y-1">
            {jobList.map(job => {
              const status =
                warmingUpBookId === job.bookId ? WARMING_UP_BADGE : getStatusBadge(job.status)
              const title = bookTitles[job.bookId] ?? job.bookId
              const readyPages = getReadyPagesDisplay(job)
              const remainingLabel = readyPages?.wholeBook
                ? getRemainingLabel(job, progressSamples[job.bookId])
                : null
              const metadata = getJobMetadata(job, readyPages?.wholeBook)
              const pageLabel = readyPages?.visualLabel ?? 'Page count unavailable'
              const accessiblePageLabel =
                readyPages?.accessibleLabel ?? 'Page count unavailable for this existing job'
              const accessibleLabel = [
                `${title}: ${status.label}`,
                accessiblePageLabel,
                readyPages?.wholeBook
                  ? `${job.completedParagraphs} of ${job.totalParagraphs} paragraphs`
                  : null,
                remainingLabel ? `about ${remainingLabel} left` : null,
                job.errorMessage ? `Error: ${job.errorMessage}` : null,
              ]
                .filter(Boolean)
                .join(', ')

              return (
                <Item.Root
                  as="li"
                  key={job.id}
                  aria-label={accessibleLabel}
                  surface="inset"
                  className="items-stretch gap-0 p-3"
                >
                  <Item.Content className="gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Item.Title className="min-w-0 truncate">{title}</Item.Title>
                      <Badge variant={status.variant} className="shrink-0">
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <Text as="span" variant="label" numeric>
                        {pageLabel}
                      </Text>
                      {remainingLabel && (
                        <Text as="span" variant="caption" color="default" numeric>
                          ~{remainingLabel} left
                        </Text>
                      )}
                    </div>
                    {metadata && (
                      <Text variant="caption" color="default" numeric className="wrap-anywhere">
                        {metadata}
                      </Text>
                    )}
                    {job.errorMessage && (
                      <Text color="destructive" variant="caption" className="wrap-anywhere">
                        {job.errorMessage}
                      </Text>
                    )}
                  </Item.Content>
                </Item.Root>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
