import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePregenStore } from '@/store/usePregenStore'
import { useAudioAvailability } from './useAudioAvailability'

// Each fetch call must get a fresh Response — a body is single-use.
const respondWith = (missingParagraphs: number[]) =>
  vi
    .mocked(fetch)
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ missingParagraphs }))))

describe('useAudioAvailability', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    usePregenStore.setState({ jobs: {} })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null while loading, then the missing-audio paragraph set', async () => {
    respondWith([1, 3])

    const { result } = renderHook(() =>
      useAudioAvailability({ bookId: 'book-1', chapter: 0, voice: 'clara' }),
    )

    expect(result.current.missingAudioParagraphs).toBeNull()

    await waitFor(() => {
      expect(result.current.missingAudioParagraphs).toEqual(new Set([1, 3]))
    })
  })

  it('drops the stale set and refetches when the voice changes', async () => {
    respondWith([])

    const { result, rerender } = renderHook(
      ({ voice }) => useAudioAvailability({ bookId: 'book-1', chapter: 0, voice }),
      { initialProps: { voice: 'clara' } },
    )

    await waitFor(() => {
      expect(result.current.missingAudioParagraphs).toEqual(new Set())
    })

    respondWith([0, 2])
    rerender({ voice: 'jonathan' })

    expect(result.current.missingAudioParagraphs).toBeNull()

    await waitFor(() => {
      expect(result.current.missingAudioParagraphs).toEqual(new Set([0, 2]))
    })
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toContain('voice=jonathan')
  })

  it('refetches when the pregen job for the book progresses', async () => {
    respondWith([0, 1])

    const { result } = renderHook(() =>
      useAudioAvailability({ bookId: 'book-1', chapter: 0, voice: 'clara' }),
    )

    await waitFor(() => {
      expect(result.current.missingAudioParagraphs).toEqual(new Set([0, 1]))
    })

    respondWith([1])
    act(() => {
      usePregenStore.getState().updateJob({
        id: 'job-1',
        bookId: 'book-1',
        voice: 'clara',
        status: 'in_progress',
        totalParagraphs: 2,
        completedParagraphs: 1,
        generatedDurationMs: 0,
        currentChapter: 0,
        currentParagraph: 1,
        generationStartChapter: 0,
        generationStartParagraph: 0,
        generationSegmentNumber: 0,
        readyWordsInSegment: 2,
        errorMessage: null,
        createdAt: 0,
        updatedAt: 0,
      })
    })

    await waitFor(() => {
      expect(result.current.missingAudioParagraphs).toEqual(new Set([1]))
    })
  })
})
