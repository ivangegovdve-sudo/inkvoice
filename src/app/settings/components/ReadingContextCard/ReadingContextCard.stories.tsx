import { expect, waitFor } from 'storybook/test'
import preview from '#.storybook/preview'
import { ReadingContextCard } from './ReadingContextCard'

interface FetchState {
  enabled: boolean
  updates: boolean[]
}

const stubFetch = (initialEnabled: boolean) => {
  const original = globalThis.fetch
  const state: FetchState = { enabled: initialEnabled, updates: [] }

  globalThis.fetch = (_input, init) => {
    if (init?.method === 'PUT') {
      const body: unknown = JSON.parse(String(init.body))

      if (
        typeof body !== 'object' ||
        body === null ||
        !('value' in body) ||
        typeof body.value !== 'boolean'
      ) {
        throw new Error('Expected a boolean setting value')
      }

      state.enabled = body.value
      state.updates.push(body.value)
      return Promise.resolve(Response.json({ success: true, available: body.value }))
    }

    return Promise.resolve(Response.json({ value: state.enabled }))
  }

  return {
    state,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

const fetchState: { current: ReturnType<typeof stubFetch> | null } = { current: null }

const meta = preview.meta({
  component: ReadingContextCard,
})

/** Reading access starts off and explains the model-provider privacy boundary before opt-in. */
export const Off = meta.story({
  beforeEach: () => {
    fetchState.current = stubFetch(false)
    return () => fetchState.current?.restore()
  },
})

Off.test('enables sharing from the accessible switch', async ({ canvas, userEvent }) => {
  const control = await canvas.findByRole('switch', { name: 'Share reading context' })

  await waitFor(() => expect(control).toBeEnabled())
  await expect(control).not.toBeChecked()
  await userEvent.click(control)

  await waitFor(() => expect(control).toBeChecked())
  expect(fetchState.current?.state.updates).toEqual([true])
})

/** The persisted opt-in is reflected when the settings page opens. */
export const On = meta.story({
  beforeEach: () => {
    fetchState.current = stubFetch(true)
    return () => fetchState.current?.restore()
  },
})

On.test('loads the enabled state', async ({ canvas }) => {
  const control = await canvas.findByRole('switch', { name: 'Share reading context' })

  await waitFor(() => expect(control).toBeChecked())
})
