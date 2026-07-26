import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { ChapterInfo } from '@/lib/types/book'
import { PlayerContainer } from './PlayerContainer'

interface MockAudio {
  play: MockInstance
  pause: MockInstance
  src: string
  onended: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
}

const chapters: ChapterInfo[] = [
  { title: 'First Chapter', paragraphCount: 1, wordCount: 4 },
  { title: 'Second Chapter', paragraphCount: 1, wordCount: 4 },
]

const createMockAudio = (): MockAudio => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  src: '',
  onended: null,
  onerror: null,
})

let mockAudio: MockAudio

const PlayerHarness = () => {
  const [chapterEndOpen, setChapterEndOpen] = useState(false)

  return (
    <>
      <PlayerContainer
        bookId="book-1"
        chapters={chapters}
        currentChapter={0}
        currentParagraph={0}
        onProgressChange={vi.fn()}
        onChapterEnd={() => setChapterEndOpen(true)}
      />
      {chapterEndOpen && <button onClick={() => setChapterEndOpen(false)}>Dismiss</button>}
    </>
  )
}

beforeEach(() => {
  mockAudio = createMockAudio()
  vi.stubGlobal(
    'Audio',
    // eslint-disable-next-line prefer-arrow-callback
    vi.fn(function () {
      return mockAudio
    }),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/voices') {
        return Promise.resolve(
          new Response('[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      return Promise.resolve(new Response(new Blob(['audio']), { status: 200 }))
    }),
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/audio')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PlayerContainer', () => {
  it('replays the final paragraph after dismissal and prompts again only when it ends', async () => {
    const user = userEvent.setup()

    render(<PlayerHarness />)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(mockAudio.play).toHaveBeenCalledOnce())

    act(() => mockAudio.onended?.(new Event('ended')))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await user.click(screen.getByRole('button', { name: 'Play' }))

    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    await waitFor(() => expect(mockAudio.play).toHaveBeenCalledTimes(2))

    act(() => mockAudio.onended?.(new Event('ended')))

    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })
})
