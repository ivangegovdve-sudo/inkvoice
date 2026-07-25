import { expect } from 'storybook/test'
import preview from '#.storybook/preview'
import { SearchInput } from './SearchInput'

const meta = preview.meta({
  component: SearchInput,
  args: {
    'aria-label': 'Search library',
    placeholder: 'Search by title or author',
  },
  decorators: [
    Story => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
})

/** Search input composed from the design-system InputGroup. */
export const Default = meta.story({})

Default.test('accepts search text', async ({ canvas, userEvent }) => {
  const input = canvas.getByRole('textbox', { name: 'Search library' })

  await userEvent.type(input, 'Austen')

  expect(input).toHaveValue('Austen')
})

Default.test(
  'clicking the empty shell focuses the input',
  async ({ canvas, canvasElement, userEvent }) => {
    const input = canvas.getByRole('textbox', { name: 'Search library' })
    const shell = canvasElement.querySelector('[data-slot="input-group"]')

    expect(shell).not.toBeNull()
    if (!shell) throw new Error('Search input shell was not rendered')
    await userEvent.click(shell)

    expect(input).toHaveFocus()
  },
)

/** Consumers can place status or actions after the text control. */
export const WithTrailing = meta.story({
  args: {
    trailing: <span className="text-muted-foreground text-xs">⌘F</span>,
  },
})
