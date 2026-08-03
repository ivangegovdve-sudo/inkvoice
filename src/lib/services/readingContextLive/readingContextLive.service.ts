import type { LiveReadingContext } from '@/lib/services/readingContext/readingContext.types'

interface ReadingContextLiveState {
  context: LiveReadingContext | null
}

declare global {
  var readingContextLiveState: ReadingContextLiveState | undefined
}

const state = (globalThis.readingContextLiveState ??= { context: null })

const get = (): LiveReadingContext | null => state.context

const set = (context: LiveReadingContext): void => {
  state.context = context
}

const clear = (sessionId: string): boolean => {
  if (state.context?.sessionId !== sessionId) return false

  state.context = null
  return true
}

export const readingContextLiveService = { get, set, clear }
