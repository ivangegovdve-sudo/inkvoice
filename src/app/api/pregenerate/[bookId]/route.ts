import { type NextRequest, NextResponse } from 'next/server'
import { getBookService } from '@/lib/services/book/book.service'
import { getCacheService } from '@/lib/services/cache/cache.service'
import { checkBudget } from '@/lib/services/cache/helpers/checkBudget/checkBudget'
import { pregenEvents } from '@/lib/services/pregenEvents/pregenEvents.service'
import { pregenQueueService } from '@/lib/services/pregenQueue/pregenQueue.service'
import { computePregenEstimate } from '@/lib/services/pregeneration/helpers/computePregenEstimate/computePregenEstimate'
import { pregenWorker, signalStop } from '@/lib/services/pregeneration/pregeneration.service'
import { voicePreferenceService } from '@/lib/services/voice-preference/voice-preference.service'

interface RouteParams {
  params: Promise<{ bookId: string }>
}

interface PregenActionBody {
  action?: string
  chapter?: number
  paragraph?: number
  jobId?: string
}

const parsePositionParam = (value: string | null): number => {
  const parsed = parseInt(value ?? '0', 10)

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

export const POST = async (request: NextRequest, { params }: RouteParams) => {
  const { bookId } = await params

  const startChapter = parsePositionParam(request.nextUrl.searchParams.get('startChapter'))
  const startParagraph = parsePositionParam(request.nextUrl.searchParams.get('startParagraph'))

  try {
    // Early guard — cheap DB query
    const existing = await pregenQueueService.getByBookId(bookId)

    if (existing) {
      return NextResponse.json(
        { error: 'Pre-generation already active for this book' },
        { status: 409 },
      )
    }

    // Parallel reads
    const [bookStats, voicePrefs] = await Promise.all([
      getBookService().getBookStats(bookId),
      voicePreferenceService.getAll(),
    ])

    if (!bookStats) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 })
    }

    const { totalParagraphs, totalWords, unspeakableParagraphs } = bookStats
    const voice = voicePrefs.bookVoices[bookId] ?? voicePrefs.voice

    const cacheService = getCacheService()
    const [cachedParagraphs, stats] = await Promise.all([
      cacheService.countBookVoiceEntries(bookId, voice),
      cacheService.getStats(),
    ])

    // Budget math counts only paragraphs that can produce audio; the job total
    // passed to enqueue below stays the full index-space count the worker walks.
    const { estimatedSizeBytes } = computePregenEstimate({
      totalParagraphs: totalParagraphs - unspeakableParagraphs,
      totalWords,
      cachedParagraphs,
    })

    const budget = checkBudget({
      usedBytes: stats.usedBytes,
      maxBytes: stats.maxBytes,
      estimatedBytes: estimatedSizeBytes,
    })

    if (!budget.ok) {
      return NextResponse.json({ error: 'Cache budget exceeded', budget }, { status: 409 })
    }

    const job = await pregenQueueService.enqueue(
      bookId,
      voice,
      totalParagraphs,
      startChapter,
      startParagraph,
    )

    pregenWorker.start()

    pregenEvents.emit({ type: 'update', job })
    return NextResponse.json(job, { status: 201 })
  } catch (error) {
    console.error('Failed to start pre-generation:', error)
    return NextResponse.json({ error: 'Failed to start pre-generation' }, { status: 500 })
  }
}

export const GET = async (_request: NextRequest, { params }: RouteParams) => {
  const { bookId } = await params
  const job = await pregenQueueService.getByBookId(bookId)

  if (!job) {
    return NextResponse.json({ error: 'No active pre-generation for this book' }, { status: 404 })
  }

  return NextResponse.json(job)
}

export const DELETE = async (_request: NextRequest, { params }: RouteParams) => {
  const { bookId } = await params
  const job = await pregenQueueService.getAnyByBookId(bookId)

  if (!job) {
    return NextResponse.json({ error: 'No pre-generation for this book' }, { status: 404 })
  }

  signalStop(job.id)
  const { deleted } = await pregenQueueService.cancel(job.id)

  if (deleted) pregenEvents.emit({ type: 'deleted', bookId })
  return NextResponse.json({ success: true })
}

export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { bookId } = await params

  let body: PregenActionBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body?.action

  if (
    action !== 'pause' &&
    action !== 'resume' &&
    action !== 'reposition' &&
    action !== 'dismiss'
  ) {
    return NextResponse.json(
      { error: 'Invalid action. Expected "pause", "resume", "reposition", or "dismiss".' },
      { status: 400 },
    )
  }

  try {
    if (action === 'dismiss') {
      if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
        return NextResponse.json({ error: 'Dismiss requires a job ID.' }, { status: 400 })
      }

      const dismissed = await pregenQueueService.dismissCompleted(bookId, body.jobId)

      if (!dismissed) {
        return NextResponse.json(
          { error: 'Only the matching completed generation can be dismissed.' },
          { status: 409 },
        )
      }

      pregenEvents.emit({ type: 'update', job: dismissed })
      return NextResponse.json(dismissed)
    }

    const job = await pregenQueueService.getByBookId(bookId)

    if (!job) {
      return NextResponse.json({ error: 'No active pre-generation for this book' }, { status: 404 })
    }

    if (action === 'reposition') {
      const { chapter, paragraph } = body
      const isValidIndex = (value: number | undefined): value is number =>
        typeof value === 'number' && Number.isInteger(value) && value >= 0

      if (!isValidIndex(chapter) || !isValidIndex(paragraph)) {
        return NextResponse.json(
          { error: 'Reposition requires non-negative integer "chapter" and "paragraph".' },
          { status: 400 },
        )
      }

      signalStop(job.id)
      const repositioned = await pregenQueueService.reposition(job.id, chapter, paragraph)

      if (!repositioned) {
        return NextResponse.json(
          { error: 'No active pre-generation for this book' },
          { status: 404 },
        )
      }

      pregenWorker.start()
      pregenEvents.emit({ type: 'update', job: repositioned })
      return NextResponse.json(repositioned)
    }

    if (action === 'pause') {
      signalStop(job.id)
      await pregenQueueService.pause(job.id)
    } else {
      await pregenQueueService.resume(job.id)
      pregenWorker.start()
    }

    const updated = await pregenQueueService.getByBookId(bookId)

    if (updated) pregenEvents.emit({ type: 'update', job: updated })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update pre-generation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
