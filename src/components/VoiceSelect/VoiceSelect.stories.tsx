import type { SelectOption } from '@carbonid1/design-system'
import { useState } from 'react'
import { expect, fn, waitFor, within } from 'storybook/test'
import preview from '#.storybook/preview'
import type { VoiceEntry } from '@/lib/services/voice/voice.types'
import { VoiceSelect } from './VoiceSelect'

const VOICES: VoiceEntry[] = [
  {
    name: 'narrator',
    displayName: 'Narrator',
    type: 'app',
    source: 'upload',
    hasSample: false,
    tags: [],
  },
  {
    name: 'casual',
    displayName: 'Casual',
    type: 'app',
    source: 'upload',
    hasSample: true,
    tags: ['warm', 'friendly'],
  },
  {
    name: 'alex',
    displayName: 'Alex',
    type: 'custom',
    source: 'upload',
    hasSample: false,
    tags: ['male', 'british'],
  },
  {
    name: 'velvet-otter',
    displayName: 'Velvet Otter',
    type: 'custom',
    source: 'design',
    hasSample: true,
    tags: ['en'],
  },
]

interface Args {
  initialValue: string
  voices: VoiceEntry[]
  placeholder?: string
  extraOptions?: SelectOption[]
  className?: string
  menuAlign?: 'start' | 'center' | 'end'
  onChange: (name: string) => void
}

const Controlled = ({
  initialValue,
  voices,
  placeholder,
  extraOptions,
  className,
  menuAlign,
  onChange,
}: Args) => {
  const [value, setValue] = useState(initialValue)

  return (
    <div className="w-72">
      <VoiceSelect
        voices={voices}
        value={value}
        onChange={next => {
          setValue(next)
          onChange(next)
        }}
        placeholder={placeholder}
        extraOptions={extraOptions}
        className={className}
        menuAlign={menuAlign}
      />
    </div>
  )
}

const meta = preview.meta({
  component: Controlled,
  args: {
    initialValue: 'casual',
    voices: VOICES,
    onChange: fn(),
  },
})

/** Combobox closed — shows the currently selected voice's display name. */
export const Default = meta.story({})

Default.test('renders selected voice in the trigger', ({ canvas }) => {
  expect(canvas.getByRole('combobox', { name: /casual/i })).toBeInTheDocument()
})

Default.test('opens listbox with all voices on click', async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole('combobox', { name: /casual/i }))
  const body = within(document.body)

  const listbox = await waitFor(() => body.getByRole('listbox'))

  expect(listbox).toBeInTheDocument()
  expect(body.getByRole('option', { name: /narrator/i })).toBeInTheDocument()
  expect(body.getByRole('option', { name: /casual/i })).toBeInTheDocument()
  expect(body.getByRole('option', { name: /alex/i })).toBeInTheDocument()
})

Default.test('groups voices into Your Voices + Included Voices', async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole('combobox', { name: /casual/i }))
  const body = within(document.body)

  expect(await waitFor(() => body.getByText('Your Voices'))).toBeInTheDocument()
  expect(body.getByText('Included Voices')).toBeInTheDocument()
})

Default.test('renders tag list under each option that has tags', async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole('combobox', { name: /casual/i }))
  const body = within(document.body)

  const casualOption = await waitFor(() => body.getByRole('option', { name: /casual/i }))

  expect(casualOption).toHaveTextContent('warm, friendly')
  expect(body.getByRole('option', { name: /alex/i })).toHaveTextContent('male, british')
  expect(body.getByRole('option', { name: /^narrator$/i })).not.toHaveTextContent(',')
})

Default.test(
  'selecting an option calls onChange and closes',
  async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: /casual/i }))
    const body = within(document.body)
    const alexOption = await waitFor(() => body.getByRole('option', { name: /alex/i }))

    await userEvent.click(alexOption)

    expect(args.onChange).toHaveBeenLastCalledWith('alex')
    expect(body.queryByRole('listbox')).not.toBeInTheDocument()
  },
)

Default.test('Escape closes the listbox', async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole('combobox', { name: /casual/i }))
  const body = within(document.body)

  expect(await waitFor(() => body.getByRole('listbox'))).toBeInTheDocument()

  await userEvent.keyboard('{Escape}')
  expect(body.queryByRole('listbox')).not.toBeInTheDocument()
})

Default.test('arrow keys + Enter select via keyboard', async ({ canvas, args, userEvent }) => {
  await userEvent.click(canvas.getByRole('combobox', { name: /casual/i }))
  const body = within(document.body)

  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

  expect(args.onChange).toHaveBeenCalled()
  expect(body.queryByRole('listbox')).not.toBeInTheDocument()
})

/** No voice in the list matches the current value — the trigger falls back to the placeholder. */
export const Placeholder = meta.story({
  args: {
    initialValue: 'unknown',
    placeholder: 'Pick a voice',
  },
})

Placeholder.test('shows placeholder when value matches no voice', ({ canvas }) => {
  expect(canvas.getByRole('combobox', { name: /pick a voice/i })).toBeInTheDocument()
})

/** Extra option (e.g. "Default (Narrator)") rendered above voice groups. */
export const WithExtraOptions = meta.story({
  args: {
    initialValue: '__default__',
    extraOptions: [{ value: '__default__', label: 'Default (Narrator)' }],
  },
})

WithExtraOptions.test('extra option renders before voice groups', async ({ canvas, userEvent }) => {
  expect(canvas.getByRole('combobox', { name: /default \(narrator\)/i })).toBeInTheDocument()

  await userEvent.click(canvas.getByRole('combobox', { name: /default \(narrator\)/i }))
  const body = within(document.body)
  const options = await waitFor(() => body.getAllByRole('option'))

  expect(options[0]).toHaveTextContent('Default (Narrator)')
})

/** End alignment keeps wider menus inside right-aligned book controls. */
export const EndAligned = meta.story({
  args: {
    className: 'ml-48 w-32',
    menuAlign: 'end',
    extraOptions: [
      {
        value: '__default__',
        label: 'Default (A deliberately long voice name)',
      },
    ],
  },
})

EndAligned.test('aligns the popup end edge with the trigger', async ({ canvas, userEvent }) => {
  const trigger = canvas.getByRole('combobox', { name: /casual/i })

  await userEvent.click(trigger)
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
  const listboxId = trigger.getAttribute('aria-controls')
  const listbox = listboxId ? document.getElementById(listboxId) : null

  if (!listbox?.parentElement) throw new Error('Select popup positioner not found')

  const popup = listbox.parentElement

  await waitFor(() => {
    expect(listbox).toHaveAttribute('role', 'listbox')
    expect(popup).not.toBeNull()
    expect(popup).toHaveAttribute('data-align', 'end')
    expect(popup.getBoundingClientRect().width).toBeGreaterThan(
      trigger.getBoundingClientRect().width,
    )
    expect(popup.getBoundingClientRect().right).toBeCloseTo(
      trigger.getBoundingClientRect().right,
      0,
    )
  })
})
