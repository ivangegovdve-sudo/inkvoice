import { describe, expect, it, vi } from 'vitest'
import type { PregenJob } from '@/lib/services/pregenQueue/pregenQueue.types'
import { pregenEvents } from './pregenEvents.service'
import type { PregenEvent } from './pregenEvents.types'

const makeJob = (overrides: Partial<PregenJob> = {}): PregenJob => ({
  id: 'job-1',
  bookId: 'book-1',
  voice: 'narrator',
  status: 'in_progress',
  totalParagraphs: 100,
  completedParagraphs: 50,
  generatedDurationMs: 0,
  currentChapter: 2,
  currentParagraph: 5,
  generationStartChapter: 0,
  generationStartParagraph: 0,
  generationSegmentNumber: 0,
  readyWordsInSegment: 0,
  errorMessage: null,
  dismissedAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
})

describe('pregenEvents', () => {
  it('delivers emitted events to subscribers', () => {
    const listener = vi.fn()

    pregenEvents.on(listener)

    const event: PregenEvent = { type: 'update', job: makeJob() }

    pregenEvents.emit(event)

    expect(listener).toHaveBeenCalledWith(event)
    pregenEvents.off(listener)
  })

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn()

    pregenEvents.on(listener)
    pregenEvents.off(listener)

    pregenEvents.emit({ type: 'update', job: makeJob() })

    expect(listener).not.toHaveBeenCalled()
  })

  it('delivers to multiple subscribers independently', () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    pregenEvents.on(listener1)
    pregenEvents.on(listener2)

    const event: PregenEvent = { type: 'deleted', bookId: 'book-1' }

    pregenEvents.emit(event)

    expect(listener1).toHaveBeenCalledWith(event)
    expect(listener2).toHaveBeenCalledWith(event)
    pregenEvents.off(listener1)
    pregenEvents.off(listener2)
  })

  it('removing one subscriber does not affect others', () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    pregenEvents.on(listener1)
    pregenEvents.on(listener2)
    pregenEvents.off(listener1)

    pregenEvents.emit({ type: 'update', job: makeJob() })

    expect(listener1).not.toHaveBeenCalled()
    expect(listener2).toHaveBeenCalledOnce()
    pregenEvents.off(listener2)
  })

  it('does not throw when emitting with no subscribers', () => {
    expect(() => {
      pregenEvents.emit({ type: 'update', job: makeJob() })
    }).not.toThrow()
  })
})
