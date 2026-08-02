'use client'

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PregenJob } from '@/lib/services/pregenQueue/pregenQueue.types'
import { usePregenStore } from '@/store/usePregenStore'
import { useSleepPrevention } from './useSleepPrevention'

const makeJob = (overrides: Partial<PregenJob> = {}): PregenJob => ({
  id: 'job-1',
  bookId: 'book-1',
  voice: 'narrator',
  status: 'in_progress',
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
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
})

beforeEach(() => {
  usePregenStore.setState({ jobs: {}, loaded: true })
  // Remove bridge to simulate dev mode by default
  delete window.inkvoice
})

describe('useSleepPrevention', () => {
  it('does nothing when window.inkvoice is undefined', () => {
    usePregenStore.setState({
      jobs: { 'book-1': makeJob() },
    })

    // Should not throw
    renderHook(() => useSleepPrevention())
  })

  describe('with bridge available', () => {
    const sleepBlockStart = vi.fn()
    const sleepBlockStop = vi.fn()

    beforeEach(() => {
      sleepBlockStart.mockReset()
      sleepBlockStop.mockReset()
      window.inkvoice = {
        platform: 'darwin',
        retry: vi.fn(),
        quit: vi.fn(),
        sleepBlockStart,
        sleepBlockStop,
      }
    })

    it('calls sleepBlockStart when store has an in_progress job', () => {
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'in_progress' }) },
      })

      renderHook(() => useSleepPrevention())

      expect(sleepBlockStart).toHaveBeenCalledOnce()
      expect(sleepBlockStop).not.toHaveBeenCalled()
    })

    it('calls sleepBlockStart when store has a queued job', () => {
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'queued' }) },
      })

      renderHook(() => useSleepPrevention())

      expect(sleepBlockStart).toHaveBeenCalledOnce()
    })

    it('calls sleepBlockStop when all jobs complete', () => {
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'in_progress' }) },
      })

      const { rerender } = renderHook(() => useSleepPrevention())

      expect(sleepBlockStart).toHaveBeenCalledOnce()

      // All jobs complete
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'completed' }) },
      })
      rerender()

      expect(sleepBlockStop).toHaveBeenCalledOnce()
    })

    it('does not send duplicate start calls on re-render', () => {
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'in_progress' }) },
      })

      const { rerender } = renderHook(() => useSleepPrevention())

      rerender()
      rerender()

      expect(sleepBlockStart).toHaveBeenCalledOnce()
    })

    it('handles pause then resume cycle', () => {
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'in_progress' }) },
      })

      const { rerender } = renderHook(() => useSleepPrevention())

      expect(sleepBlockStart).toHaveBeenCalledOnce()

      // Pause
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'paused' }) },
      })
      rerender()
      expect(sleepBlockStop).toHaveBeenCalledOnce()

      // Resume
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'in_progress' }) },
      })
      rerender()
      expect(sleepBlockStart).toHaveBeenCalledTimes(2)
    })

    it('calls sleepBlockStop on unmount when blocking', () => {
      usePregenStore.setState({
        jobs: { 'book-1': makeJob({ status: 'in_progress' }) },
      })

      const { unmount } = renderHook(() => useSleepPrevention())

      expect(sleepBlockStart).toHaveBeenCalledOnce()

      unmount()
      expect(sleepBlockStop).toHaveBeenCalledOnce()
    })

    it('uses a single blocker for multiple active jobs', () => {
      usePregenStore.setState({
        jobs: {
          'book-1': makeJob({ bookId: 'book-1', status: 'queued' }),
          'book-2': makeJob({ bookId: 'book-2', status: 'in_progress' }),
        },
      })

      renderHook(() => useSleepPrevention())

      expect(sleepBlockStart).toHaveBeenCalledOnce()
    })
  })
})
