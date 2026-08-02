import { describe, expect, it } from 'vitest'
import { buildPregenJob } from '@/lib/services/pregenQueue/pregenQueue.fixtures'
import { PREGEN_JOB_STATUS } from '@/lib/services/pregenQueue/pregenQueue.types'
import { getReadyPagesDisplay } from './getReadyPagesDisplay'

describe('getReadyPagesDisplay', () => {
  it('reports no pages before a whole-book job advances', () => {
    expect(getReadyPagesDisplay(buildPregenJob())?.visualLabel).toBe('No pages ready yet')
  })

  it('does not claim a complete page before 350 words are ready', () => {
    const display = getReadyPagesDisplay(buildPregenJob({ readyWordsInSegment: 349 }))

    expect(display?.visualLabel).toBe('Less than 1 page ready')
  })

  it('uses singular and plural full-page estimates while generation is active', () => {
    expect(getReadyPagesDisplay(buildPregenJob({ readyWordsInSegment: 350 }))?.visualLabel).toBe(
      '~1 page ready',
    )
    expect(getReadyPagesDisplay(buildPregenJob({ readyWordsInSegment: 1_099 }))?.visualLabel).toBe(
      '~3 pages ready',
    )
  })

  it('includes the final partial page when a segment reaches completion', () => {
    const display = getReadyPagesDisplay(
      buildPregenJob({
        status: PREGEN_JOB_STATUS.COMPLETED,
        readyWordsInSegment: 351,
      }),
    )

    expect(display?.visualLabel).toBe('~2 pages ready')
  })

  it('qualifies repositioned progress as ready from here', () => {
    const display = getReadyPagesDisplay(
      buildPregenJob({
        generationStartChapter: 4,
        generationStartParagraph: 12,
        generationSegmentNumber: 1,
        readyWordsInSegment: 700,
      }),
    )

    expect(display).toMatchObject({
      visualLabel: '~2 pages ready from here',
      wholeBook: false,
    })
    expect(display?.accessibleLabel).toContain('estimated at 350 words per page')
  })

  it('returns null when a legacy job has no trustworthy segment data', () => {
    expect(getReadyPagesDisplay(buildPregenJob({ readyWordsInSegment: null }))).toBeNull()
  })
})
