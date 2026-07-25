import { Card } from '@carbonid1/design-system'
import { expect, fn, waitFor, within } from 'storybook/test'
import preview from '#.storybook/preview'
import { PREGEN_JOB_STATUS, type PregenJob } from '@/lib/services/pregenQueue/pregenQueue.types'
import { usePregenStore } from '@/store/usePregenStore'
import { useProgressStore } from '@/store/useProgressStore'
import { BookCardContextMenu } from './BookCardContextMenu'

const BOOK_ID = 'book-1'

const buildJob = (overrides: Partial<PregenJob>): PregenJob => ({
  id: 'job-1',
  bookId: BOOK_ID,
  voice: 'narrator',
  status: PREGEN_JOB_STATUS.IN_PROGRESS,
  totalParagraphs: 100,
  completedParagraphs: 40,
  generatedDurationMs: 0,
  currentChapter: 0,
  currentParagraph: 40,
  errorMessage: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

const resetStores = () => {
  useProgressStore.setState({ progress: {}, loaded: true })
  usePregenStore.setState({ jobs: {}, estimates: {}, warmingUpBookId: null, loaded: true })
}

const meta = preview.meta({
  component: BookCardContextMenu,
  args: {
    bookId: BOOK_ID,
    onRemove: fn(),
    children: (
      <Card.Root className="flex h-40 w-56 items-center justify-center p-4 select-none">
        Book card
      </Card.Root>
    ),
  },
  decorators: [
    Story => (
      <div style={{ padding: 48 }}>
        <Story />
      </div>
    ),
  ],
})

/** Book card with no pregen job and not-yet-finished progress. Shows Mark as Done + Pre-generate + Remove. */
export const Default = meta.story({
  beforeEach: () => {
    resetStores()
  },
})

Default.test('Mark as Done toggles the book to finished', async ({ canvas, userEvent }) => {
  const body = within(document.body)
  const trigger = canvas.getByText('Book card')

  await userEvent.pointer({ keys: '[MouseRight]', target: trigger })
  const item = await waitFor(() => body.getByRole('menuitemcheckbox', { name: 'Mark as Done' }))

  await userEvent.click(item)
  await expect(useProgressStore.getState().progress[BOOK_ID]?.finishedAt).toEqual(
    expect.any(Number),
  )
})

Default.test('Remove Book calls onRemove with bookId', async ({ canvas, args, userEvent }) => {
  const body = within(document.body)
  const trigger = canvas.getByText('Book card')

  await userEvent.pointer({ keys: '[MouseRight]', target: trigger })
  const item = await waitFor(() => body.getByRole('menuitem', { name: 'Remove Book' }))

  await userEvent.click(item)
  await expect(args.onRemove).toHaveBeenCalledWith(BOOK_ID)
})

/** Book already marked as finished. Shows Mark as Unread with the checkmark filled. */
export const Finished = meta.story({
  beforeEach: () => {
    resetStores()
    useProgressStore.setState({
      progress: { [BOOK_ID]: { chapter: 0, paragraph: 0, finishedAt: 1000 } },
      loaded: true,
    })
  },
})

Finished.test('Mark as Unread clears finishedAt', async ({ canvas, userEvent }) => {
  const body = within(document.body)
  const trigger = canvas.getByText('Book card')

  await userEvent.pointer({ keys: '[MouseRight]', target: trigger })
  const item = await waitFor(() => body.getByRole('menuitemcheckbox', { name: 'Mark as Unread' }))

  await userEvent.click(item)
  await expect(useProgressStore.getState().progress[BOOK_ID]?.finishedAt).toBeNull()
})

/** Book with an in-progress pregen job. Shows Pause + Cancel items alongside the finished toggle. */
export const InProgress = meta.story({
  beforeEach: () => {
    resetStores()
    usePregenStore.setState({
      jobs: { [BOOK_ID]: buildJob({ status: PREGEN_JOB_STATUS.IN_PROGRESS }) },
    })
  },
})

/** Book with a cache estimate that exceeds the budget. Pre-generate item is disabled with a tooltip. */
export const OverBudget = meta.story({
  beforeEach: () => {
    resetStores()
    usePregenStore.setState({
      estimates: {
        [BOOK_ID]: {
          totalParagraphs: 100,
          cachedParagraphs: 0,
          estimatedSizeBytes: 500_000_000,
          estimatedGenerationMinutes: 20,
          budget: {
            ok: false,
            shortfallBytes: 200_000_000,
            requiredBytes: 500_000_000,
            usedBytes: 300_000_000,
            maxBytes: 600_000_000,
          },
        },
      },
    })
  },
})
