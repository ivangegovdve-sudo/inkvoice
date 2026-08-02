import { expect, userEvent, waitFor } from 'storybook/test'
import preview from '#.storybook/preview'
import { buildPregenJob } from '@/lib/services/pregenQueue/pregenQueue.fixtures'
import type { Book } from '@/lib/types/book'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePregenStore } from '@/store/usePregenStore'
import { GenerationQueuePanel } from './GenerationQueuePanel'

const ODYSSEY_JOB = buildPregenJob({
  id: 'job-odyssey',
  bookId: 'the-odyssey',
  status: 'paused',
  totalParagraphs: 1259,
  completedParagraphs: 12,
  currentParagraph: 12,
  generationStartChapter: 7,
  generationStartParagraph: 5,
  generationSegmentNumber: 1,
  readyWordsInSegment: 700,
})

const JEKYLL_JOB = buildPregenJob({
  id: 'job-jekyll',
  bookId: 'the-strange-case-of-dr-jekyll-and-mr-hyde',
  status: 'in_progress',
  totalParagraphs: 364,
  completedParagraphs: 130,
  generatedDurationMs: 754_000,
  currentChapter: 4,
  currentParagraph: 130,
  readyWordsInSegment: 4_200,
})

const BOOKS: Book[] = [
  { id: 'the-odyssey', title: 'The Odyssey', author: 'Homer', filename: 'the-odyssey.epub' },
  {
    id: 'the-strange-case-of-dr-jekyll-and-mr-hyde',
    title: 'The Strange Case of Dr. Jekyll and Mr. Hyde',
    author: 'Robert Louis Stevenson',
    filename: 'the-strange-case-of-dr-jekyll-and-mr-hyde.epub',
  },
]

const meta = preview.meta({
  component: GenerationQueuePanel,
  beforeEach: () => {
    useLibraryStore.setState({ books: BOOKS, loaded: true, fetching: false, error: null })
    usePregenStore.setState({
      panelOpen: true,
      jobs: { [ODYSSEY_JOB.bookId]: ODYSSEY_JOB, [JEKYLL_JOB.bookId]: JEKYLL_JOB },
      samplingRates: { [JEKYLL_JOB.bookId]: 5.2 },
      // 30 paragraphs over 60 seconds = 0.5/s → 234 paragraphs left ≈ 7m.
      progressSamples: {
        [JEKYLL_JOB.bookId]: [
          { at: 0, completedParagraphs: 100 },
          { at: 60_000, completedParagraphs: 130 },
        ],
      },
      warmingUpBookId: null,
    })
  },
})

/** Queue popover with a paused job and an actively generating job. */
export const WithJobs = meta.story({})

WithJobs.test('exposes each generation job as a named list item', ({ canvas }) => {
  expect(canvas.getAllByRole('listitem')).toHaveLength(2)
  canvas.getByRole('listitem', {
    name: /The Odyssey: Paused, About 2 pages ready from here/,
  })
  canvas.getByRole('listitem', {
    name: /The Strange Case of Dr\. Jekyll and Mr\. Hyde: Generating, About 12 pages ready, estimated at 350 words per page, 130 of 364 paragraphs, about 7m left/,
  })
})

WithJobs.test(
  'makes pages the primary metric and omits the internal generation rate',
  ({ canvas }) => {
    expect(canvas.getByText('~12 pages ready')).toBeVisible()
    expect(canvas.getByText('~2 pages ready from here')).toBeVisible()
    expect(canvas.queryByText(/it\/s/)).not.toBeInTheDocument()
  },
)

WithJobs.test('estimates time left for the actively generating job', ({ canvas }) => {
  expect(canvas.getByText(/~7m left/)).toBeVisible()
})

WithJobs.test('names the panel region and its close button for assistive tech', ({ canvas }) => {
  canvas.getByRole('region', { name: 'Generation Queue' })
  canvas.getByRole('button', { name: 'Close generation queue' })
  expect(canvas.queryByRole('button', { name: /Dismiss completed generation/ })).toBeNull()
})

const stubDismissFetch = () => {
  const original = globalThis.fetch
  const stub: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.startsWith('/api/pregenerate/') && init?.method === 'PATCH') {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
      const job = Object.values(usePregenStore.getState().jobs).find(
        candidate => candidate.id === body?.jobId,
      )

      if (!job || job.status !== 'completed' || job.dismissedAt !== null) {
        return Promise.resolve(Response.json({ error: 'Not dismissible' }, { status: 409 }))
      }

      return Promise.resolve(Response.json({ ...job, dismissedAt: Date.now() }))
    }

    return original(input, init)
  }

  globalThis.fetch = stub

  return () => {
    globalThis.fetch = original
  }
}

/** Completed whole-book and generate-from-here segments keep their scopes distinct. */
export const CompletedSegments = meta.story({
  beforeEach: () => {
    const wholeBook = buildPregenJob({
      ...JEKYLL_JOB,
      status: 'completed',
      completedParagraphs: JEKYLL_JOB.totalParagraphs,
      readyWordsInSegment: 34_651,
    })
    const fromHere = buildPregenJob({
      ...ODYSSEY_JOB,
      status: 'completed',
      readyWordsInSegment: 1_051,
    })

    usePregenStore.setState({
      jobs: { [wholeBook.bookId]: wholeBook, [fromHere.bookId]: fromHere },
      progressSamples: {},
    })

    return stubDismissFetch()
  },
})

CompletedSegments.test('distinguishes whole-book completion from ready-to-end', ({ canvas }) => {
  expect(canvas.getByText('~100 pages ready')).toBeVisible()
  expect(canvas.getByText('Entire book', { exact: false })).toBeVisible()
  expect(canvas.getByText('~4 pages ready from here')).toBeVisible()
  expect(canvas.getByText('Ready to the end')).toBeVisible()
})

CompletedSegments.test(
  'dismisses a completed generation by its accessible action',
  async ({ canvas }) => {
    const dismiss = canvas.getByRole('button', {
      name: 'Dismiss completed generation for The Strange Case of Dr. Jekyll and Mr. Hyde',
    })

    dismiss.focus()
    expect(dismiss).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(
        canvas.queryByRole('listitem', {
          name: /^The Strange Case of Dr\. Jekyll and Mr\. Hyde:/,
        }),
      ).toBeNull()
    })
    expect(canvas.getByRole('listitem', { name: /^The Odyssey:/ })).toBeVisible()
  },
)

/** Queue popover with no generation jobs queued. */
export const Empty = meta.story({
  beforeEach: () => {
    usePregenStore.setState({ jobs: {}, samplingRates: {} })
  },
})

const stubBooksFetch = () => {
  const original = globalThis.fetch
  const stub: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.includes('/api/books')) return Promise.resolve(Response.json(BOOKS))
    return original(input, init)
  }

  globalThis.fetch = stub

  return () => {
    globalThis.fetch = original
  }
}

/** Queue popover opened from a reader page, where the library list was never loaded. */
export const OpenedOutsideLibrary = meta.story({
  beforeEach: () => {
    useLibraryStore.setState({ books: [], loaded: false })
    return stubBooksFetch()
  },
})

OpenedOutsideLibrary.test(
  'loads book titles instead of showing raw book IDs',
  async ({ canvas }) => {
    await waitFor(() => {
      canvas.getByRole('listitem', { name: /^The Odyssey:/ })
      canvas.getByRole('listitem', { name: /^The Strange Case of Dr\. Jekyll and Mr\. Hyde:/ })
    })
  },
)
