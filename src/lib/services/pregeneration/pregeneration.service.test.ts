import { beforeEach, describe, expect, it, vi } from 'vitest'

const makeJobResult = vi.hoisted(() => (overrides: Record<string, unknown> = {}) => ({
  id: 'job-1',
  bookId: 'book-1',
  voice: 'narrator',
  status: 'in_progress',
  totalParagraphs: 2,
  completedParagraphs: 0,
  generatedDurationMs: 0,
  currentChapter: 0,
  currentParagraph: 0,
  errorMessage: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
}))

const mockPregenQueue = vi.hoisted(() => ({
  getNext: vi.fn().mockResolvedValue(null),
  getJob: vi.fn().mockResolvedValue(makeJobResult({ status: 'in_progress' })),
  start: vi
    .fn()
    .mockImplementation(() => Promise.resolve(makeJobResult({ status: 'in_progress' }))),
  updateProgress: vi.fn().mockImplementation(() => Promise.resolve(makeJobResult())),
  complete: vi
    .fn()
    .mockImplementation(() => Promise.resolve(makeJobResult({ status: 'completed' }))),
  pause: vi.fn().mockImplementation(() => Promise.resolve(makeJobResult({ status: 'paused' }))),
  resume: vi.fn().mockImplementation(() => Promise.resolve(makeJobResult({ status: 'queued' }))),
  getAll: vi.fn().mockResolvedValue([]),
}))

const mockBookService = vi.hoisted(() => ({
  getBookOverview: vi.fn(),
  getParagraph: vi.fn(),
}))

const mockTtsService = vi.hoisted(() => ({
  generate: vi.fn(),
}))

const mockCacheService = vi.hoisted(() => ({
  has: vi.fn(),
  set: vi.fn().mockResolvedValue(true),
  setTimestamps: vi.fn().mockResolvedValue(undefined),
  getDurationMs: vi.fn().mockResolvedValue(0),
}))

const mockDiskSpace = vi.hoisted(() => ({
  getAvailableSpace: vi
    .fn()
    .mockResolvedValue({ available: 100_000_000_000, total: 500_000_000_000, percentFree: 20 }),
}))

vi.mock('@/lib/services/pregenQueue/pregenQueue.service', () => ({
  pregenQueueService: mockPregenQueue,
}))
vi.mock('@/lib/services/book/book.service', () => ({
  getBookService: () => mockBookService,
}))
vi.mock('@/lib/services/tts/tts.server', () => ({
  getTTSService: () => mockTtsService,
}))

const mockPythonClient = vi.hoisted(() => ({
  fetch: vi.fn(),
  getStatus: vi.fn(),
  getCurrentInstanceId: vi.fn().mockReturnValue(1),
}))

vi.mock('@/lib/services/pythonClient/pythonClient', () => ({
  getPythonClient: () => mockPythonClient,
}))
vi.mock('@/lib/services/cache/cache.service', () => ({
  getCacheService: () => mockCacheService,
}))
vi.mock('@/lib/services/platform/diskSpace', () => ({
  diskSpaceService: mockDiskSpace,
}))
vi.mock('@/lib/config/env', () => ({
  env: { cacheDir: '/tmp/test-cache', ttsApiUrl: 'http://localhost:8000/tts' },
}))
const mockPregenEvents = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  getWarmingUpBookId: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/services/pregenEvents/pregenEvents.service', () => ({
  pregenEvents: mockPregenEvents,
}))

import { pregenWorker, resetPregenWorker, signalStop } from './pregeneration.service'

const mockFetch = vi
  .fn()
  .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })

vi.stubGlobal('fetch', mockFetch)

describe('pregenWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })
    mockPythonClient.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })
    mockPythonClient.getCurrentInstanceId.mockReturnValue(1)
    mockCacheService.set.mockResolvedValue(true)
    resetPregenWorker()
    // Default: getJob returns in_progress (inner loop DB check)
    mockPregenQueue.getJob.mockResolvedValue(makeJobResult({ status: 'in_progress' }))
  })

  it('processes a queued job to completion', async () => {
    const job = {
      id: 'job-1',
      bookId: 'book-1',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 2,
      completedParagraphs: 0,
      generatedDurationMs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    }

    // Return job once, then null (no more jobs)
    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 2, wordCount: 100 }],
    })

    mockBookService.getParagraph
      .mockResolvedValueOnce('Hello world')
      .mockResolvedValueOnce('Goodbye world')

    mockCacheService.has.mockResolvedValue(false)

    mockTtsService.generate.mockResolvedValue({
      audio: Buffer.alloc(100),
      generationTimeMs: 5000,
      timestamps: [{ word: 'Hello', start: 0, end: 500 }],
      durationMs: 3000,
    })

    pregenWorker.start()

    // Wait for processing to complete
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    expect(mockPregenQueue.start).toHaveBeenCalledWith('job-1')
    expect(mockTtsService.generate).toHaveBeenCalledTimes(2)
    expect(mockCacheService.set).toHaveBeenCalledTimes(2)
    expect(mockPregenQueue.complete).toHaveBeenCalledWith('job-1')
    expect(mockPregenQueue.updateProgress).toHaveBeenCalledTimes(2)
  })

  it('skips already-cached paragraphs', async () => {
    const job = {
      id: 'job-1',
      bookId: 'book-1',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 2,
      completedParagraphs: 0,
      generatedDurationMs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    }

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 2, wordCount: 100 }],
    })

    mockBookService.getParagraph
      .mockResolvedValueOnce('Cached text')
      .mockResolvedValueOnce('New text')

    // First paragraph cached, second not
    mockCacheService.has.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    mockTtsService.generate.mockResolvedValue({
      audio: Buffer.alloc(100),
      generationTimeMs: 5000,
      timestamps: null,
      durationMs: 3000,
    })

    pregenWorker.start()
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    // Only 1 TTS call (second paragraph), first was skipped
    expect(mockTtsService.generate).toHaveBeenCalledTimes(1)
    expect(mockPregenQueue.complete).toHaveBeenCalledWith('job-1')
  })

  it('persists the next unprocessed paragraph as the resume cursor', async () => {
    const job = makeJobResult({
      status: 'queued',
      totalParagraphs: 2,
      completedParagraphs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    })

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)
    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [
        { title: 'Ch 1', paragraphCount: 1, wordCount: 50 },
        { title: 'Ch 2', paragraphCount: 1, wordCount: 50 },
      ],
    })
    mockBookService.getParagraph
      .mockResolvedValueOnce('First cached paragraph')
      .mockResolvedValueOnce('Second cached paragraph')
    mockCacheService.has.mockResolvedValue(true)
    mockCacheService.getDurationMs.mockResolvedValue(3000)

    pregenWorker.start()
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    expect(mockPregenQueue.updateProgress).toHaveBeenNthCalledWith(1, 'job-1', 1, 0, 1, 3000)
    expect(mockPregenQueue.updateProgress).toHaveBeenNthCalledWith(2, 'job-1', 2, 0, 2, 6000)
  })

  it('persists generated audio before advancing the resume cursor', async () => {
    const job = makeJobResult({
      status: 'queued',
      totalParagraphs: 1,
      completedParagraphs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    })
    const persistence = Promise.withResolvers<boolean>()

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)
    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 1, wordCount: 50 }],
    })
    mockBookService.getParagraph.mockResolvedValue('Generated paragraph')
    mockCacheService.has.mockResolvedValue(false)
    mockCacheService.set.mockReturnValueOnce(persistence.promise)
    mockTtsService.generate.mockResolvedValue({
      audio: Buffer.alloc(100),
      generationTimeMs: 5000,
      timestamps: null,
      durationMs: 3000,
    })

    pregenWorker.start()
    await vi.waitFor(() => expect(mockCacheService.set).toHaveBeenCalledOnce())

    expect(mockPregenQueue.updateProgress).not.toHaveBeenCalled()

    persistence.resolve(true)
    await vi.waitFor(() => expect(mockPregenQueue.updateProgress).toHaveBeenCalledOnce())
    pregenWorker.stop()
  })

  it('does not advance the resume cursor when generated audio cannot be persisted', async () => {
    vi.useFakeTimers()

    const job = makeJobResult({
      status: 'queued',
      totalParagraphs: 1,
      completedParagraphs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    })

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)
    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 1, wordCount: 50 }],
    })
    mockBookService.getParagraph.mockResolvedValue('Generated paragraph')
    mockCacheService.has.mockResolvedValue(false)
    mockCacheService.set.mockResolvedValue(false)
    mockTtsService.generate.mockResolvedValue({
      audio: Buffer.alloc(100),
      generationTimeMs: 5000,
      timestamps: null,
      durationMs: 3000,
    })

    pregenWorker.start()
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(35_000)
    }
    pregenWorker.stop()

    expect(mockCacheService.set).toHaveBeenCalledTimes(6)
    expect(mockPregenQueue.updateProgress).not.toHaveBeenCalled()
    expect(mockPregenQueue.pause).toHaveBeenCalledWith(
      'job-1',
      expect.stringContaining('5 retries'),
    )

    vi.useRealTimers()
  })

  it('skips unspeakable paragraphs without calling TTS', async () => {
    const job = {
      id: 'job-1',
      bookId: 'book-1',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 2,
      completedParagraphs: 0,
      generatedDurationMs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    }

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 2, wordCount: 100 }],
    })

    mockBookService.getParagraph.mockResolvedValueOnce('———').mockResolvedValueOnce('Real prose.')

    mockCacheService.has.mockResolvedValue(false)

    mockTtsService.generate.mockResolvedValue({
      audio: Buffer.alloc(100),
      generationTimeMs: 5000,
      timestamps: null,
      durationMs: 3000,
    })

    pregenWorker.start()
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    // Only the prose paragraph reaches TTS; the separator still counts as progress
    expect(mockTtsService.generate).toHaveBeenCalledTimes(1)
    expect(mockTtsService.generate).toHaveBeenCalledWith('Real prose.', 'narrator')
    expect(mockPregenQueue.updateProgress).toHaveBeenCalledWith('job-1', 0, 1, 1, 0)
    expect(mockPregenQueue.complete).toHaveBeenCalledWith('job-1')
  })

  it('retries with backoff then pauses after exhausting retries', async () => {
    vi.useFakeTimers()

    const job = {
      id: 'job-1',
      bookId: 'book-1',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 5,
      completedParagraphs: 0,
      generatedDurationMs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    }

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 5, wordCount: 250 }],
    })

    mockBookService.getParagraph.mockResolvedValue('Some text')
    mockCacheService.has.mockResolvedValue(false)
    mockTtsService.generate.mockRejectedValue(new Error('TTS failed'))

    pregenWorker.start()

    // Advance through all backoff sleeps (2s + 4s + 8s + 16s + 30s)
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(35_000)
    }

    pregenWorker.stop()

    // 1 initial attempt + 5 retries = 6 total
    expect(mockTtsService.generate).toHaveBeenCalledTimes(6)
    expect(mockPregenQueue.pause).toHaveBeenCalledWith(
      'job-1',
      expect.stringContaining('5 retries'),
    )

    vi.useRealTimers()
  })

  it('succeeds after transient TTS failures', async () => {
    vi.useFakeTimers()

    const job = {
      id: 'job-1',
      bookId: 'book-1',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 1,
      completedParagraphs: 0,
      generatedDurationMs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    }

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 1, wordCount: 50 }],
    })

    mockBookService.getParagraph.mockResolvedValue('Hello world')
    mockCacheService.has.mockResolvedValue(false)

    // Fail twice, succeed on third attempt
    mockTtsService.generate
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        audio: Buffer.alloc(100),
        generationTimeMs: 5000,
        timestamps: null,
      })

    pregenWorker.start()

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(10_000)
    }

    pregenWorker.stop()

    expect(mockTtsService.generate).toHaveBeenCalledTimes(3)
    expect(mockPregenQueue.complete).toHaveBeenCalledWith('job-1')
    expect(mockPregenQueue.pause).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('stops when job is paused externally', async () => {
    const job = {
      id: 'job-1',
      bookId: 'book-1',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 10,
      completedParagraphs: 0,
      generatedDurationMs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    }

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 10, wordCount: 500 }],
    })

    mockBookService.getParagraph.mockResolvedValue('Some text')
    mockCacheService.has.mockResolvedValue(false)

    // After first TTS call, signal external pause via in-memory flag
    mockTtsService.generate.mockImplementation(() => {
      signalStop(job.id)
      return Promise.resolve({
        audio: Buffer.alloc(100),
        generationTimeMs: 5000,
        timestamps: null,
        durationMs: 3000,
      })
    })

    pregenWorker.start()
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    // Should have generated only 1 paragraph before detecting pause
    expect(mockTtsService.generate).toHaveBeenCalledTimes(1)
    // Worker should NOT requeue — job is already paused in DB
    expect(mockPregenQueue.resume).not.toHaveBeenCalled()
  })

  it('emits warmup_start and warmup_complete around first job, skipped on subsequent jobs', async () => {
    const job1 = {
      id: 'job-1',
      bookId: 'book-1',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 1,
      completedParagraphs: 0,
      generatedDurationMs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    }
    const job2 = { ...job1, id: 'job-2', bookId: 'book-2' }

    mockPregenQueue.getNext
      .mockResolvedValueOnce(job1)
      .mockResolvedValueOnce(job2)
      .mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-x',
      title: 'Test',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 1, wordCount: 50 }],
    })
    mockBookService.getParagraph.mockResolvedValue('Some text')
    mockCacheService.has.mockResolvedValue(false)
    mockTtsService.generate.mockResolvedValue({
      audio: Buffer.alloc(100),
      generationTimeMs: 5000,
      timestamps: null,
      durationMs: 3000,
    })

    pregenWorker.start()
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    const warmupStartCalls = mockPregenEvents.emit.mock.calls.filter(
      ([e]) => e?.type === 'warmup_start',
    )
    const warmupCompleteCalls = mockPregenEvents.emit.mock.calls.filter(
      ([e]) => e?.type === 'warmup_complete',
    )

    expect(warmupStartCalls).toEqual([[{ type: 'warmup_start', bookId: 'book-1' }]])
    expect(warmupCompleteCalls).toEqual([[{ type: 'warmup_complete', bookId: 'book-1' }]])
  })

  it('stops when job is deleted mid-processing', async () => {
    const job = {
      id: 'job-1',
      bookId: 'book-1',
      voice: 'narrator',
      status: 'queued',
      totalParagraphs: 10,
      completedParagraphs: 0,
      generatedDurationMs: 0,
      currentChapter: 0,
      currentParagraph: 0,
    }

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 10, wordCount: 500 }],
    })

    mockBookService.getParagraph.mockResolvedValue('Some text')
    mockCacheService.has.mockResolvedValue(false)

    // After first TTS call, signal deletion via in-memory flag
    mockTtsService.generate.mockImplementation(() => {
      signalStop(job.id)
      return Promise.resolve({
        audio: Buffer.alloc(100),
        generationTimeMs: 5000,
        timestamps: null,
        durationMs: 3000,
      })
    })

    pregenWorker.start()
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    expect(mockTtsService.generate).toHaveBeenCalledTimes(1)
    // Worker exits cleanly — no resume, no complete, no errors
    expect(mockPregenQueue.resume).not.toHaveBeenCalled()
    expect(mockPregenQueue.complete).not.toHaveBeenCalled()
  })

  it('exits silently when the job row is deleted between TTS and updateProgress', async () => {
    const job = makeJobResult({
      status: 'queued',
      totalParagraphs: 5,
      currentChapter: 0,
      currentParagraph: 0,
    })

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 5, wordCount: 250 }],
    })

    mockBookService.getParagraph.mockResolvedValue('Some text')
    mockCacheService.has.mockResolvedValue(false)
    mockTtsService.generate.mockResolvedValue({
      audio: Buffer.alloc(100),
      generationTimeMs: 5000,
      timestamps: null,
      durationMs: 3000,
    })
    mockPregenQueue.updateProgress.mockResolvedValue(null)

    pregenWorker.start()
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    expect(mockTtsService.generate).toHaveBeenCalledTimes(1)
    expect(mockPregenQueue.updateProgress).toHaveBeenCalledTimes(1)
    expect(mockPregenQueue.pause).not.toHaveBeenCalled()
    expect(mockPregenQueue.complete).not.toHaveBeenCalled()
    expect(mockPregenQueue.resume).not.toHaveBeenCalled()
  })

  it('exits silently when the job row is deleted during a cached-skip batch', async () => {
    const job = makeJobResult({
      status: 'queued',
      totalParagraphs: 5,
      currentChapter: 0,
      currentParagraph: 0,
    })

    mockPregenQueue.getNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null)

    mockBookService.getBookOverview.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      author: 'Author',
      chapters: [{ title: 'Ch 1', paragraphCount: 5, wordCount: 250 }],
    })

    mockBookService.getParagraph.mockResolvedValue('Cached text')
    mockCacheService.has.mockResolvedValue(true)
    mockPregenQueue.updateProgress.mockResolvedValue(null)

    pregenWorker.start()
    await new Promise(r => setTimeout(r, 50))
    pregenWorker.stop()

    expect(mockTtsService.generate).not.toHaveBeenCalled()
    expect(mockPregenQueue.pause).not.toHaveBeenCalled()
    expect(mockPregenQueue.complete).not.toHaveBeenCalled()
  })
})
