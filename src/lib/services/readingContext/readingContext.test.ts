import { describe, expect, it, vi } from 'vitest'
import type { ParsedChapter } from '@/lib/types/book'
import { createReadingContextService } from './readingContext.service'
import type { LiveReadingContext } from './readingContext.types'

const chapter: ParsedChapter = {
  title: 'A Difficult Conversation',
  paragraphs: ['First paragraph.', 'The reading pointer.', 'Selected future words.', 'Unread.'],
}

const liveContext: LiveReadingContext = {
  sessionId: 'reader-session',
  book: { id: 'book-id', title: 'The Book', author: 'The Author' },
  pointer: { chapter: 4, paragraph: 1, playing: false },
  selection: null,
}

const instance = { kind: 'development' as const, version: '1.0.0' }

describe('readingContextService', () => {
  it('caps a same-chapter range at the live reading pointer', async () => {
    const service = createReadingContextService({
      getLiveContext: () => liveContext,
      getChapter: () => Promise.resolve(chapter),
      getInstance: () => instance,
    })

    const result = await service.readRange({
      chapter: 4,
      startParagraph: 0,
      endParagraph: 3,
    })

    expect(result.capped).toBe(true)
    expect(result.returned.paragraphs).toEqual([
      { index: 0, text: 'First paragraph.' },
      { index: 1, text: 'The reading pointer.' },
    ])
    expect(result.ceiling).toEqual({ chapter: 4, paragraph: 1 })
  })

  it('does not resolve chapter metadata when the whole request is ahead of the pointer', async () => {
    const getChapter = vi.fn<() => Promise<ParsedChapter | null>>()
    const service = createReadingContextService({
      getLiveContext: () => liveContext,
      getChapter,
      getInstance: () => instance,
    })

    const result = await service.readRange({
      chapter: 5,
      startParagraph: 0,
      endParagraph: 10,
    })

    expect(result.returned).toEqual({
      chapter: 5,
      title: null,
      startParagraph: null,
      endParagraph: null,
      paragraphs: [],
    })
    expect(getChapter).not.toHaveBeenCalled()
  })

  it('includes a selected future paragraph only through the selection end', async () => {
    const service = createReadingContextService({
      getLiveContext: () => ({
        ...liveContext,
        selection: {
          text: 'future',
          start: { chapter: 4, paragraph: 2, offset: 9 },
          end: { chapter: 4, paragraph: 2, offset: 15 },
        },
      }),
      getChapter: () => Promise.resolve(chapter),
      getInstance: () => instance,
    })

    const result = await service.getSnapshot()

    expect(result.pointer?.paragraph.index).toBe(1)
    expect(result.selection).toEqual({
      text: 'future',
      start: { chapter: 4, paragraph: 2, offset: 9 },
      end: { chapter: 4, paragraph: 2, offset: 15 },
      paragraphs: [{ index: 2, text: 'Selected future' }],
    })
  })

  it('returns an empty snapshot when no reader is open', async () => {
    const service = createReadingContextService({
      getLiveContext: () => null,
      getChapter: () => Promise.resolve(chapter),
      getInstance: () => instance,
    })

    await expect(service.getSnapshot()).resolves.toEqual({
      schemaVersion: 1,
      instance,
      book: null,
      pointer: null,
      selection: null,
    })
  })
})
