import { expect, fn } from 'storybook/test'
import preview from '#.storybook/preview'
import { ChapterEndModal } from './ChapterEndModal'

const meta = preview.meta({
  component: ChapterEndModal,
  args: {
    isOpen: true,
    completedChapterTitle: 'The Beginning',
    nextChapterTitle: 'The Journey',
    nextChapterPageCount: 10,
    onContinue: fn(),
    onDismiss: fn(),
  },
})

/** Modal shown after the last paragraph of a chapter, offering to continue into the next one. */
export const Open = meta.story({})

Open.test('renders the completed and next chapter details', ({ canvas }) => {
  expect(canvas.getByText('The Beginning')).toBeInTheDocument()
  expect(canvas.getByText('The Journey')).toBeInTheDocument()
  expect(canvas.getByText('~10 pages')).toBeInTheDocument()
})

Open.test('omits the internal chapter count', ({ canvas }) => {
  expect(canvas.queryByText(/^Chapter\b.*\bof\b/)).not.toBeInTheDocument()
})

Open.test('Continue button calls onContinue', async ({ canvas, args, userEvent }) => {
  await userEvent.click(canvas.getByRole('button', { name: /continue/i }))
  expect(args.onContinue).toHaveBeenCalledOnce()
})

Open.test('clicking the backdrop calls onDismiss', async ({ canvas, args, userEvent }) => {
  await userEvent.click(canvas.getByTestId('chapter-end-backdrop'))
  expect(args.onDismiss).toHaveBeenCalledOnce()
})

/** Closed — component renders nothing. */
export const Closed = meta.story({
  args: { isOpen: false },
})

Closed.test('does not render the dialog when closed', ({ canvas }) => {
  expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
})

/** Next chapter has no precomputed page count — the "~N pages" line is omitted. */
export const WithoutPageCount = meta.story({
  args: { nextChapterPageCount: null },
})

WithoutPageCount.test('omits the page-count line when count is null', ({ canvas }) => {
  expect(canvas.queryByText(/pages/i)).not.toBeInTheDocument()
})
