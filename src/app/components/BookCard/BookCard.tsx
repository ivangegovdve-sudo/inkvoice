'use client'

import { Card, ProgressRing, Tooltip } from '@carbonid1/design-system'
import { BookOpen, Check } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { computeProgressPercent } from '@/lib/helpers/computeProgressPercent/computeProgressPercent'
import { formatDuration } from '@/lib/helpers/formatDuration/formatDuration'
import { formatTimeAgo } from '@/lib/helpers/formatTimeAgo/formatTimeAgo'
import type { PregenJob } from '@/lib/services/pregenQueue/pregenQueue.types'
import type { Book } from '@/lib/types/book'
import { usePregenStore } from '@/store/usePregenStore'
import { useProgressStore } from '@/store/useProgressStore'
import { BookCardContextMenu } from './BookCardContextMenu'

interface BookCardProps {
  book: Book
  onRemove: (bookId: string) => void
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const longDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const getPregenRingColor = (job: PregenJob, isWarmingUp: boolean): string => {
  if (isWarmingUp) return 'text-muted-foreground'
  if (job.status === 'completed') return 'text-success'
  if (job.status === 'in_progress') return 'text-primary'
  return 'text-muted-foreground'
}

const getPregenRingLabel = (job: PregenJob, isWarmingUp: boolean): string => {
  if (isWarmingUp) return 'AI model warming up'
  if (job.status === 'queued') return 'Queued'

  const duration = formatDuration(job.generatedDurationMs)
  const paragraphs =
    job.status === 'completed'
      ? `${job.totalParagraphs} paragraphs`
      : `${job.completedParagraphs} of ${job.totalParagraphs} paragraphs`

  return duration ? `${paragraphs} · ${duration}` : paragraphs
}

export const BookCard = ({ book, onRemove }: BookCardProps) => {
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [coverError, setCoverError] = useState(false)
  const progress = useProgressStore(state => state.progress[book.id])
  const progressPercent = computeProgressPercent(progress)
  const finishedAt = progress?.finishedAt ?? null
  const job = usePregenStore(s => s.jobs[book.id])
  const isWarmingUp = usePregenStore(s => s.warmingUpBookId === book.id)

  const ringLabel = job ? getPregenRingLabel(job, isWarmingUp) : ''

  return (
    <BookCardContextMenu bookId={book.id} onRemove={onRemove}>
      <Link href={`/book/${book.id}`}>
        <Card.Root className="group hover:shadow-popover relative flex h-full flex-col p-4 transition-shadow">
          <div className="bg-surface-inset inset-shadow-surface relative mb-3 flex aspect-2/3 w-full items-center justify-center overflow-hidden rounded-sm">
            {!coverError ? (
              <>
                {!coverLoaded && (
                  <div className="bg-muted absolute inset-0 animate-pulse" aria-hidden="true" />
                )}
                <img
                  src={`/api/book/${book.id}/cover`}
                  alt={`Cover of ${book.title}`}
                  loading="lazy"
                  className={`h-full w-full object-cover ${coverLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={e => {
                    if (e.currentTarget.naturalWidth === 0) {
                      setCoverError(true)
                    } else {
                      setCoverLoaded(true)
                    }
                  }}
                  onError={() => setCoverError(true)}
                />
              </>
            ) : (
              <BookOpen className="text-muted-foreground size-12" />
            )}
            {finishedAt !== null ? (
              <Tooltip label={`Finished ${longDateFormatter.format(finishedAt)}`}>
                <div
                  className="bg-success text-success-foreground absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full shadow-sm"
                  aria-label="Finished"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </div>
              </Tooltip>
            ) : (
              progressPercent !== null && (
                <div
                  className="absolute right-0 bottom-0 left-0 h-0.5 bg-black/20"
                  aria-hidden="true"
                >
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                  <span className="sr-only">{progressPercent}% complete</span>
                </div>
              )
            )}
          </div>
          <h3 className="text-foreground mb-1 line-clamp-2 font-medium">{book.title}</h3>
          <p className="text-muted-foreground line-clamp-2 text-sm" title={book.author}>
            {book.author}
          </p>
          <div className="mt-1 flex min-h-5 items-center gap-1.5">
            {job && (
              <Tooltip label={ringLabel} delay={600}>
                <div className="flex shrink-0 items-center">
                  <ProgressRing
                    progress={
                      job.totalParagraphs > 0 ? job.completedParagraphs / job.totalParagraphs : 0
                    }
                    colorClass={getPregenRingColor(job, isWarmingUp)}
                    label={ringLabel}
                    animate={isWarmingUp || job.status === 'in_progress'}
                    pendingStyle={
                      !isWarmingUp && job.status !== 'in_progress' && job.status !== 'completed'
                        ? 'dashed'
                        : 'none'
                    }
                  />
                </div>
              </Tooltip>
            )}
            {finishedAt !== null && (
              <p className="text-muted-foreground text-xs">
                Finished {shortDateFormatter.format(finishedAt)}
              </p>
            )}
            {finishedAt === null && progress?.lastReadAt && (
              <p className="text-muted-foreground text-xs">
                Last read {formatTimeAgo(progress.lastReadAt)}
              </p>
            )}
          </div>
        </Card.Root>
      </Link>
    </BookCardContextMenu>
  )
}
