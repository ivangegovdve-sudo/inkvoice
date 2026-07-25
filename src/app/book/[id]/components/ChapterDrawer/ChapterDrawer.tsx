'use client'

import { Button, Tooltip, useHotkeys } from '@carbonid1/design-system'
import { ChevronDown, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChapterInfo, TocNode } from '@/lib/types/book'
import { computeStartPages } from '../../helpers/computeStartPages/computeStartPages'

interface ChapterDrawerProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (chapter: number) => void
  chapters: ChapterInfo[]
  tocTree?: TocNode[]
  currentChapter: number
}

export const ChapterDrawer = ({
  isOpen,
  onClose,
  onNavigate,
  chapters,
  tocTree,
  currentChapter,
}: ChapterDrawerProps) => {
  const drawerRef = useRef<HTMLDivElement>(null)

  const startPages = useMemo(() => computeStartPages(chapters.map(c => c.wordCount)), [chapters])

  useHotkeys('t', onClose, { enabled: isOpen })
  useHotkeys('escape', onClose, { enabled: isOpen })

  useEffect(() => {
    if (isOpen) {
      drawerRef.current?.focus()
      requestAnimationFrame(() => {
        drawerRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'center' })
      })
    }
  }, [isOpen])

  const handleNavigate = (chapterIndex: number) => {
    onNavigate(chapterIndex)
    onClose()
  }

  const renderChapterRow = (chapterIndex: number, title: string, indent: number = 0) => {
    const chapter = chapters[chapterIndex]

    if (!chapter) return null

    const startPage = startPages[chapterIndex]
    const isCurrent = chapterIndex === currentChapter

    return (
      <button
        key={`${chapterIndex}-${title}`}
        data-active={isCurrent || undefined}
        data-chapter-index={chapterIndex}
        title={title}
        onClick={() => handleNavigate(chapterIndex)}
        className={`flex w-full min-w-0 items-center gap-2 px-4 py-2.5 text-left transition-colors ${
          isCurrent ? 'bg-primary-muted' : 'hover:bg-accent'
        }`}
        style={indent > 0 ? { paddingLeft: `${16 + indent * 20}px` } : undefined}
      >
        <span className={`flex-1 truncate text-sm ${isCurrent ? 'text-primary font-medium' : ''}`}>
          {title}
        </span>
        {startPage !== undefined && (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{startPage}</span>
        )}
      </button>
    )
  }

  const renderTocGroup = (node: TocNode, indent: number = 0) => {
    if (node.children.length === 0) {
      return renderChapterRow(node.chapterIndex, node.title, indent)
    }

    return (
      <TocGroupCollapsible
        key={`group-${node.chapterIndex}-${node.title}`}
        node={node}
        indent={indent}
        currentChapter={currentChapter}
        startPage={startPages[node.chapterIndex]}
        onNavigate={handleNavigate}
        renderTocGroup={renderTocGroup}
      />
    )
  }

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
        aria-label="Table of Contents"
        tabIndex={-1}
        className={`bg-popover shadow-popover fixed inset-y-0 left-0 z-40 w-96 max-w-[85vw] outline-hidden transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Table of Contents</h2>
          <Tooltip label="Close" shortcut="Esc" position="bottom">
            <Button size="icon" onClick={onClose} aria-label="Close table of contents">
              <X />
            </Button>
          </Tooltip>
        </div>

        {/* Chapter list — only rendered when open to avoid re-rendering on every paragraph advance */}
        <div className="h-[calc(100%-57px)] overflow-y-auto">
          {isOpen &&
            (tocTree ? (
              <div className="pt-1 pb-8">{tocTree.map(node => renderTocGroup(node))}</div>
            ) : (
              <div className="pt-1 pb-8">
                {chapters.map((chapter, idx) => renderChapterRow(idx, chapter.title))}
              </div>
            ))}
        </div>
      </div>
    </>
  )
}

interface TocGroupCollapsibleProps {
  node: TocNode
  indent: number
  currentChapter: number
  startPage: number | undefined
  onNavigate: (chapter: number) => void
  renderTocGroup: (node: TocNode, indent: number) => React.ReactNode
}

const TocGroupCollapsible = ({
  node,
  indent,
  currentChapter,
  startPage,
  onNavigate,
  renderTocGroup,
}: TocGroupCollapsibleProps) => {
  const containsCurrent = nodeContainsChapter(node, currentChapter)
  const isCurrent = node.chapterIndex === currentChapter
  const [isExpanded, setIsExpanded] = useState(containsCurrent)

  return (
    <div>
      <div
        data-active={isCurrent || undefined}
        className={`flex items-center gap-1 ${isCurrent ? 'bg-primary-muted' : ''}`}
      >
        <button
          onClick={() => setIsExpanded(prev => !prev)}
          className="hover:bg-accent rounded-sm p-2.5 transition-colors"
          style={indent > 0 ? { marginLeft: `${indent * 20}px` } : undefined}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <ChevronDown
            className={`text-muted-foreground size-4 transition-transform ${
              isExpanded ? '' : '-rotate-90'
            }`}
          />
        </button>
        <button
          onClick={() => onNavigate(node.chapterIndex)}
          className={`flex-1 py-2.5 pr-4 text-left text-sm transition-colors ${
            isCurrent ? 'text-primary font-medium' : 'hover:text-primary'
          }`}
        >
          {node.title}
        </button>
        {startPage !== undefined && (
          <span className="text-muted-foreground shrink-0 pr-4 text-xs tabular-nums">
            {startPage}
          </span>
        )}
      </div>

      {isExpanded && <div>{node.children.map(child => renderTocGroup(child, indent + 1))}</div>}
    </div>
  )
}

const nodeContainsChapter = (node: TocNode, chapter: number): boolean => {
  if (node.chapterIndex === chapter) return true
  return node.children.some(child => nodeContainsChapter(child, chapter))
}
