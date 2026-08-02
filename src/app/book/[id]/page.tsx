'use client'

import { Button, Tooltip, buttonVariants, toast, useHotkeys } from '@carbonid1/design-system'
import { BookMarked, ChevronLeft, List, Loader2, Search } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '@/components/PageHeader/PageHeader'
import { PregenPanelButton } from '@/components/PregenPanelButton/PregenPanelButton'
import {
  ONBOARDING_PREGEN_VALUE,
  ONBOARDING_QUERY_PARAM,
} from '@/lib/consts/onboarding/onboarding.consts'
import { useBookVoice } from '@/lib/hooks/useBookVoice/useBookVoice'
import { useBookmarkToggle } from '@/lib/hooks/useBookmarkToggle/useBookmarkToggle'
import { useDebouncedLoading } from '@/lib/hooks/useDebouncedLoading/useDebouncedLoading'
import { ESTIMATED_WORDS_PER_PAGE } from '@/lib/services/book/helpers/estimatePageCount/estimatePageCount'
import type { Bookmark } from '@/lib/services/bookmark/bookmark.types'
import type { ChapterInfo, ParsedChapter } from '@/lib/types/book'
import { useBookmarkStore } from '@/store/useBookmarkStore'
import { useProgressStore } from '@/store/useProgressStore'
import { BookmarkDrawer } from './components/BookmarkDrawer/BookmarkDrawer'
import { ChapterDrawer } from './components/ChapterDrawer/ChapterDrawer'
import { ChapterEndModal } from './components/ChapterEndModal/ChapterEndModal'
import { FontSizePopover } from './components/FontSizePopover/FontSizePopover'
import { PageSkeleton } from './components/PageSkeleton/PageSkeleton'
import { PregenOnboardingPanel } from './components/PregenOnboardingPanel/PregenOnboardingPanel'
import { ProgressIndicator } from './components/ProgressIndicator/ProgressIndicator'
import { Reader } from './components/Reader/Reader'
import { ReaderSkeleton } from './components/ReaderSkeleton/ReaderSkeleton'
import { RecoveryBanner } from './components/RecoveryBanner/RecoveryBanner'
import { ReturnPill } from './components/ReturnPill/ReturnPill'
import { SearchPalette } from './components/SearchPalette/SearchPalette'
import { VoiceSelector } from './components/VoiceSelector/VoiceSelector'
import { PlayerContainer } from './components/player/PlayerContainer'
import { computePagePosition } from './helpers/computePagePosition/computePagePosition'
import { shouldShowChapterProgress } from './helpers/shouldShowChapterProgress/shouldShowChapterProgress'
import { useAudioAvailability } from './hooks/useAudioAvailability/useAudioAvailability'
import { useAudioGenerationStatus } from './hooks/useAudioGenerationStatus/useAudioGenerationStatus'
import { useBookOverview } from './hooks/useBookOverview/useBookOverview'
import { useBookSearch } from './hooks/useBookSearch/useBookSearch'
import { useRecoveryBanner } from './hooks/useRecoveryBanner/useRecoveryBanner'
import { useReturnPosition } from './hooks/useReturnPosition/useReturnPosition'

const EMPTY_BOOKMARKS: Bookmark[] = []
const EMPTY_CHAPTERS: ChapterInfo[] = []

export default function BookReader() {
  const params = useParams<{ id: string }>()
  const bookId = params.id
  const router = useRouter()
  const searchParams = useSearchParams()
  const showPregenOnboarding = searchParams.get(ONBOARDING_QUERY_PARAM) === ONBOARDING_PREGEN_VALUE

  const closePregenOnboarding = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())

    next.delete(ONBOARDING_QUERY_PARAM)
    const queryString = next.toString()

    router.replace(`/book/${bookId}${queryString ? `?${queryString}` : ''}`)
  }, [router, searchParams, bookId])

  const { effectiveVoice } = useBookVoice(bookId)
  const { overview, loading, error, initialChapter, initialParagraph } = useBookOverview(bookId)
  const [chapterData, setChapterData] = useState<ParsedChapter | null>(null)
  const [userPosition, setUserPosition] = useState<{ chapter: number; paragraph: number } | null>(
    null,
  )
  const currentChapter = userPosition?.chapter ?? initialChapter ?? 0
  const currentParagraph = userPosition?.paragraph ?? initialParagraph ?? 0
  const positionResolved =
    userPosition !== null || (initialChapter !== null && initialParagraph !== null)
  const search = useBookSearch(bookId, currentChapter)
  const { savedPosition, savePosition, clearPosition, navigateBack } = useReturnPosition()
  const [chapterLoading, setChapterLoading] = useState(false)
  const [activeDrawer, setActiveDrawer] = useState<'chapter' | 'bookmark' | null>(null)
  const [showChapterEndModal, setShowChapterEndModal] = useState(false)
  const [replayKey, setReplayKey] = useState(0)
  const activeParagraphRef = useRef<HTMLSpanElement>(null)

  const setProgress = useProgressStore(s => s.setProgress)
  const getProgress = useProgressStore(s => s.getProgress)

  // Fetch chapter content when currentChapter changes
  useEffect(() => {
    if (!overview || !positionResolved) return

    const fetchChapter = async () => {
      setChapterLoading(true)
      try {
        const response = await fetch(`/api/book/${bookId}/chapter/${currentChapter}`)

        if (!response.ok) throw new Error('Failed to load chapter')
        const data: ParsedChapter = await response.json()

        setChapterData(data)
      } catch (e) {
        console.error('Failed to fetch chapter:', e)
      } finally {
        setChapterLoading(false)
      }
    }

    fetchChapter()
  }, [bookId, overview, currentChapter, positionResolved])

  const handleProgressChange = useCallback(
    (chapter: number, paragraph: number) => {
      setUserPosition({ chapter, paragraph })
      setProgress(bookId, chapter, paragraph)
    },
    [bookId, setProgress],
  )

  const { missingAudioParagraphs } = useAudioAvailability({
    bookId,
    chapter: currentChapter,
    voice: effectiveVoice,
  })

  const handleParagraphClick = useCallback(
    (chapter: number, paragraph: number) => {
      handleProgressChange(chapter, paragraph)
    },
    [handleProgressChange],
  )

  const handleAudioReady = useCallback(() => setReplayKey(key => key + 1), [])
  const audioGenerationStatus = useAudioGenerationStatus({
    bookId,
    chapters: overview?.chapters ?? EMPTY_CHAPTERS,
    currentChapter,
    currentParagraph,
    missingAudioParagraphs,
    onAudioReady: handleAudioReady,
  })

  const handleCopyText = useCallback(
    (_chapter: number, paragraph: number) => {
      const text = chapterData?.paragraphs[paragraph]?.trim()

      if (text) navigator.clipboard.writeText(text)
    },
    [chapterData],
  )

  // Chapter end interstitial
  const handleChapterEnd = useCallback(() => setShowChapterEndModal(true), [])
  const handleContinueChapter = useCallback(() => {
    setShowChapterEndModal(false)
    handleProgressChange(currentChapter + 1, 0)
  }, [currentChapter, handleProgressChange])
  const handleDismissChapterEnd = useCallback(() => setShowChapterEndModal(false), [])

  // Bookmarks
  const fetchBookmarks = useBookmarkStore(s => s.fetchBookmarks)
  const bookmarksForBook = useBookmarkStore(s => s.bookmarks[bookId] ?? EMPTY_BOOKMARKS)
  const { isBookmarked: isCurrentBookmarked, toggle: toggleBookmark } = useBookmarkToggle({
    bookId,
    chapter: currentChapter,
    paragraph: currentParagraph,
    preview: chapterData?.paragraphs[currentParagraph]?.trim() || undefined,
  })
  const bookmarkedParagraphs = useMemo(
    () => new Set(bookmarksForBook.filter(b => b.chapter === currentChapter).map(b => b.paragraph)),
    [bookmarksForBook, currentChapter],
  )

  useEffect(() => {
    fetchBookmarks(bookId)
  }, [bookId, fetchBookmarks])

  // Keyboard shortcuts
  useHotkeys('b', toggleBookmark)
  useHotkeys('shift+b', () => setActiveDrawer(prev => (prev === 'bookmark' ? null : 'bookmark')))
  useHotkeys('t', () => setActiveDrawer(prev => (prev === 'chapter' ? null : 'chapter')))
  useHotkeys(
    'mod+f',
    e => {
      e.preventDefault()
      search.open()
    },
    { preventDefault: true },
  )
  useHotkeys('escape', () => search.close(), { enabled: search.isOpen })
  useHotkeys('escape', closePregenOnboarding, {
    enabled: showPregenOnboarding && !search.isOpen,
  })
  useHotkeys('mod+z', () => {
    const { lastDeleted, undoRemoveBookmark } = useBookmarkStore.getState()

    if (!lastDeleted) return
    undoRemoveBookmark()
    toast.dismiss()
  })
  useHotkeys('backspace', () => navigateBack(handleProgressChange), {
    enabled: savedPosition !== null,
  })

  // Drawer callbacks
  const closeDrawer = useCallback(() => setActiveDrawer(null), [])
  const handleChapterNavigate = useCallback(
    (chapter: number) => {
      clearPosition()
      const saved = getProgress(bookId).chapterPositions?.[chapter] ?? 0

      handleProgressChange(chapter, saved)
    },
    [bookId, getProgress, handleProgressChange, clearPosition],
  )

  const closeSearch = search.close
  const handleSearchSelect = useCallback(
    (chapter: number, paragraph: number) => {
      savePosition(currentChapter, currentParagraph)
      handleParagraphClick(chapter, paragraph)
      closeSearch()
    },
    [savePosition, currentChapter, currentParagraph, handleParagraphClick, closeSearch],
  )

  const handleBookmarkNavigate = useCallback(
    (chapter: number, paragraph: number) => {
      clearPosition()
      handleProgressChange(chapter, paragraph)
    },
    [clearPosition, handleProgressChange],
  )

  const showChapterLoading = useDebouncedLoading(chapterLoading)
  const currentProgress = getProgress(bookId)

  const chapterNames = useMemo(
    () => overview?.chapters.map(ch => ch.title) ?? [],
    [overview?.chapters],
  )

  const {
    recoveryBookmark,
    showBanner: showRecoveryBanner,
    dismissBanner,
  } = useRecoveryBanner({
    bookmarks: bookmarksForBook,
    currentChapter,
    currentParagraph,
  })

  if (loading || !positionResolved) return <PageSkeleton />

  if (error || !overview) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="text-destructive">{error || 'Book not found'}</div>
        <Link href="/" className="text-primary hover:text-primary/80 underline">
          Return to library
        </Link>
      </div>
    )
  }

  const currentChapterInfo = overview.chapters[currentChapter] ?? {
    title: '',
    paragraphCount: 0,
    wordCount: 0,
  }

  const pagePosition =
    currentProgress.wordsPerChapter && currentProgress.paragraphsPerChapter
      ? computePagePosition({
          chapter: currentChapter,
          paragraph: currentParagraph,
          wordsPerChapter: currentProgress.wordsPerChapter,
          paragraphsPerChapter: currentProgress.paragraphsPerChapter,
        })
      : null

  const nextChapter = overview.chapters[currentChapter + 1]
  const nextChapterPageCount =
    nextChapter && shouldShowChapterProgress({ wordsInChapter: nextChapter.wordCount })
      ? Math.ceil(nextChapter.wordCount / ESTIMATED_WORDS_PER_PAGE)
      : null

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader noBorder>
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-2">
          <Tooltip label="Back to Library" position="bottom">
            <Link href="/" className={buttonVariants({ size: 'icon', className: '-ml-2' })}>
              <ChevronLeft />
            </Link>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{overview.title}</h1>
            <p className="text-muted-foreground truncate text-sm">{overview.author}</p>
          </div>
          <Tooltip label="Search" shortcut={['mod', 'F']} position="bottom">
            <Button
              size="icon"
              onClick={() => (search.isOpen ? search.close() : search.open())}
              aria-label="Search in book"
            >
              <Search />
            </Button>
          </Tooltip>
          <PregenPanelButton />
          <Tooltip label="Bookmarks" shortcut={['shift', 'B']} position="bottom">
            <Button
              size="icon"
              onClick={() => setActiveDrawer('bookmark')}
              aria-label="Bookmarks"
              className="-mr-2"
            >
              <BookMarked />
            </Button>
          </Tooltip>
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-1.5">
          <div className="flex items-center gap-2">
            {overview.chapters.length > 1 && (
              <Tooltip label="Table of Contents" shortcut="T" position="bottom">
                <button
                  onClick={() => setActiveDrawer('chapter')}
                  className="bg-muted hover:bg-accent flex min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 text-sm transition-colors"
                  aria-label="Table of Contents"
                >
                  <List className="size-4 shrink-0" />
                  <span className="truncate">{currentChapterInfo.title}</span>
                </button>
              </Tooltip>
            )}
            {showChapterLoading && (
              <>
                <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
                <span className="sr-only">Loading chapter</span>
              </>
            )}
            <VoiceSelector bookId={bookId} />
            <FontSizePopover />
            {pagePosition && (
              <Tooltip label="Based on 350 words per page" position="bottom" className="ml-auto">
                <p className="text-muted-foreground cursor-default text-xs whitespace-nowrap">
                  Page {pagePosition.currentPage} of {pagePosition.totalPages}
                </p>
              </Tooltip>
            )}
          </div>
        </div>

        <ProgressIndicator paragraph={currentParagraph} chapterInfo={currentChapterInfo} />
      </PageHeader>

      <main className="focus-visible:ring-primary/40 min-h-0 flex-1 overflow-y-auto focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset">
        <div className="mx-auto max-w-3xl">
          {showPregenOnboarding && (
            <PregenOnboardingPanel
              bookId={bookId}
              bookTitle={overview.title}
              onClose={closePregenOnboarding}
            />
          )}
          {showRecoveryBanner && recoveryBookmark && (
            <RecoveryBanner
              chapterName={
                chapterNames[recoveryBookmark.chapter] ?? `Chapter ${recoveryBookmark.chapter + 1}`
              }
              onNavigate={() => {
                dismissBanner()
                handleProgressChange(recoveryBookmark.chapter, recoveryBookmark.paragraph)
              }}
              onDismiss={dismissBanner}
            />
          )}
          {chapterData ? (
            <Reader
              chapter={chapterData}
              currentChapter={currentChapter}
              currentParagraph={currentParagraph}
              onParagraphClick={handleParagraphClick}
              onCopyText={handleCopyText}
              bookmarkedParagraphs={bookmarkedParagraphs}
              missingAudioParagraphs={
                chapterLoading ? undefined : (missingAudioParagraphs ?? undefined)
              }
              activeParagraphRef={activeParagraphRef}
              autoScroll={!showPregenOnboarding}
            />
          ) : (
            <ReaderSkeleton />
          )}
        </div>
      </main>

      {savedPosition && (
        <ReturnPill
          chapterName={
            chapterNames[savedPosition.chapter] ?? `Chapter ${savedPosition.chapter + 1}`
          }
          onNavigate={() => navigateBack(handleProgressChange)}
          onDismiss={clearPosition}
        />
      )}

      {search.isOpen && (
        <SearchPalette
          query={search.query}
          results={search.results}
          highlightedIndex={search.highlightedIndex}
          loading={search.loading}
          truncated={search.truncated}
          scope={search.scope}
          onQueryChange={search.setQuery}
          onScopeChange={search.setScope}
          onHighlightNext={search.highlightNext}
          onHighlightPrevious={search.highlightPrevious}
          onHighlight={search.setHighlightedIndex}
          onSelect={handleSearchSelect}
          onClose={search.close}
        />
      )}

      <PlayerContainer
        bookId={bookId}
        chapters={overview.chapters}
        currentChapter={currentChapter}
        currentParagraph={currentParagraph}
        disablePlayReason={audioGenerationStatus?.message}
        audioGenerationStatus={audioGenerationStatus ?? undefined}
        onProgressChange={handleProgressChange}
        isCurrentBookmarked={isCurrentBookmarked}
        onBookmarkToggle={toggleBookmark}
        onChapterEnd={handleChapterEnd}
        replayKey={replayKey}
        activeParagraphRef={activeParagraphRef}
      />

      <ChapterDrawer
        isOpen={activeDrawer === 'chapter'}
        onClose={closeDrawer}
        onNavigate={handleChapterNavigate}
        chapters={overview.chapters}
        tocTree={overview.tocTree}
        currentChapter={currentChapter}
      />

      <BookmarkDrawer
        bookId={bookId}
        isOpen={activeDrawer === 'bookmark'}
        onClose={closeDrawer}
        onNavigate={handleBookmarkNavigate}
        chapterNames={chapterNames}
      />

      <ChapterEndModal
        isOpen={showChapterEndModal}
        completedChapterTitle={currentChapterInfo.title}
        nextChapterTitle={nextChapter?.title ?? ''}
        nextChapterPageCount={nextChapterPageCount}
        onContinue={handleContinueChapter}
        onDismiss={handleDismissChapterEnd}
      />
    </div>
  )
}
