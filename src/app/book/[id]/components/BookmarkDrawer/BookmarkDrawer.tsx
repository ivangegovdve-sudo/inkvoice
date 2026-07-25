'use client'

import { Button, getModKey, toast, Tooltip, useHotkeys } from '@carbonid1/design-system'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { formatTimeAgo } from '@/lib/helpers/formatTimeAgo/formatTimeAgo'
import type { Bookmark } from '@/lib/services/bookmark/bookmark.types'
import { useBookmarkStore } from '@/store/useBookmarkStore'

interface BookmarkDrawerProps {
  bookId: string
  isOpen: boolean
  onClose: () => void
  onNavigate: (chapter: number, paragraph: number) => void
  chapterNames: string[]
}

const EMPTY_BOOKMARKS: Bookmark[] = []

export const BookmarkDrawer = ({
  bookId,
  isOpen,
  onClose,
  onNavigate,
  chapterNames,
}: BookmarkDrawerProps) => {
  const bookmarks = useBookmarkStore(s => s.bookmarks[bookId]) ?? EMPTY_BOOKMARKS
  const removeBookmark = useBookmarkStore(s => s.removeBookmark)
  const undoRemoveBookmark = useBookmarkStore(s => s.undoRemoveBookmark)
  const [listParent] = useAutoAnimate()
  const drawerRef = useRef<HTMLDivElement>(null)
  const prevBookmarkIdsRef = useRef(new Set(bookmarks.map(b => b.id)))

  const handleRemove = (bookmark: Bookmark) => {
    removeBookmark(bookId, bookmark.id)
    toast('Bookmark removed', {
      description: `${getModKey()}+Z to undo`,
      action: { label: 'Undo', onClick: () => undoRemoveBookmark() },
      duration: 5000,
    })
  }

  useHotkeys('shift+b', onClose, { enabled: isOpen })
  useHotkeys('escape', onClose, { enabled: isOpen })

  // Scroll restored bookmark into view
  useEffect(() => {
    const prevIds = prevBookmarkIdsRef.current
    const restoredId = bookmarks.find(b => !prevIds.has(b.id))?.id

    prevBookmarkIdsRef.current = new Set(bookmarks.map(b => b.id))

    if (restoredId) {
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-bookmark-id="${restoredId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }, [bookmarks])

  // Trap focus inside drawer when open
  useEffect(() => {
    if (isOpen) {
      drawerRef.current?.focus()
    }
  }, [isOpen])

  const sorted = [...bookmarks].sort((a, b) => {
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.paragraph - b.paragraph
  })

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Bookmarks"
        tabIndex={-1}
        className={`bg-popover shadow-popover fixed inset-y-0 right-0 z-40 w-96 max-w-[85vw] outline-hidden transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Bookmarks</h2>
          <Tooltip label="Close" shortcut="Esc" position="bottom">
            <Button size="icon" onClick={onClose} aria-label="Close bookmarks">
              <X />
            </Button>
          </Tooltip>
        </div>

        {/* List */}
        <div className="h-[calc(100%-57px)] overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">No bookmarks yet</p>
            </div>
          ) : (
            <ul ref={listParent} className="pt-1 pb-8">
              {sorted.map(bookmark => (
                <li
                  key={`${bookmark.chapter}-${bookmark.paragraph}`}
                  data-bookmark-id={bookmark.id}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onNavigate(bookmark.chapter, bookmark.paragraph)
                      onClose()
                    }}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                        e.preventDefault()
                        onNavigate(bookmark.chapter, bookmark.paragraph)
                        onClose()
                      }
                    }}
                    className="group hover:bg-accent flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {chapterNames[bookmark.chapter] ?? `Chapter ${bookmark.chapter + 1}`}
                      </div>
                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {bookmark.preview ?? `Paragraph ${bookmark.paragraph + 1}`}
                      </p>
                      <span className="text-muted-foreground text-xs">
                        {formatTimeAgo(bookmark.createdAt)}
                      </span>
                    </div>
                    <Button
                      variant="danger"
                      size="icon"
                      onClick={e => {
                        e.stopPropagation()
                        handleRemove(bookmark)
                      }}
                      className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                      aria-label="Remove bookmark"
                    >
                      <X />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
