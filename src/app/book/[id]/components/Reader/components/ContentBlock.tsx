'use client'

import type { RefObject } from 'react'
import { isSpeakableText } from '@/lib/helpers/isSpeakableText/isSpeakableText'
import type { ContentBlock as ContentBlockType, TextSegment } from '@/lib/types/book'
import { ParagraphContextMenu } from '../../ParagraphContextMenu/ParagraphContextMenu'
import { ACTIVE_PARAGRAPH_HIGHLIGHT, MISSING_AUDIO_DIM } from '../Reader.consts'
import { isFilenameAlt } from '../helpers/isFilenameAlt/isFilenameAlt'
import { renderSegments } from '../helpers/renderSegments/renderSegments'

// not-italic counters the quote frame's italic so a structured quote's title
// reads as a label over the quote body; mb-2 clusters it with what it titles.
// Applied whether the source marked the title as <p> or as an h-tag.
const QUOTE_TITLE_EMPHASIS = 'mb-2 leading-relaxed font-semibold not-italic'

interface ContentBlockProps {
  block: ContentBlockType
  currentParagraph: number
  onParagraphClick?: (chapter: number, paragraph: number) => void
  onCopyText?: (chapter: number, paragraph: number) => void
  currentChapter: number
  paragraphRef: RefObject<HTMLSpanElement | null>
  isInTitleGroup?: boolean
  isSubtitle?: boolean
  bookmarkedParagraphs?: Set<number>
  missingAudioParagraphs?: Set<number>
}

export const ContentBlock = ({
  block,
  currentParagraph,
  onParagraphClick,
  onCopyText,
  currentChapter,
  paragraphRef,
  isInTitleGroup,
  isSubtitle,
  bookmarkedParagraphs,
  missingAudioParagraphs,
}: ContentBlockProps) => {
  const segments = (segs: TextSegment[] | undefined) =>
    renderSegments({
      segments: segs,
      currentParagraph,
      onParagraphClick,
      onCopyText,
      currentChapter,
      paragraphRef,
      bookmarkedParagraphs,
      missingAudioParagraphs,
    })

  switch (block.type) {
    case 'heading': {
      const HEADING_TAGS: Record<number, 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'> = {
        1: 'h1',
        2: 'h2',
        3: 'h3',
        4: 'h4',
        5: 'h5',
        6: 'h6',
      }
      const HeadingTag = HEADING_TAGS[block.level || 2] ?? 'h2'

      if (isInTitleGroup) {
        const titleClasses = isSubtitle
          ? 'text-lg font-medium text-muted-foreground text-center mb-6'
          : 'text-2xl font-bold text-center mt-12 mb-2'

        return <HeadingTag className={titleClasses}>{segments(block.segments)}</HeadingTag>
      }

      if (block.isQuoteTitle) {
        return <HeadingTag className={QUOTE_TITLE_EMPHASIS}>{segments(block.segments)}</HeadingTag>
      }

      const headingClasses: Record<number, string> = {
        1: 'text-3xl font-bold mt-8 mb-4',
        2: 'text-2xl font-semibold mt-6 mb-3',
        3: 'text-xl font-semibold mt-5 mb-2',
        4: 'text-lg font-medium mt-4 mb-2',
        5: 'text-base font-medium mt-3 mb-1',
        6: 'text-sm font-medium mt-2 mb-1',
      }

      return (
        <HeadingTag className={headingClasses[block.level || 2] || headingClasses[2]}>
          {segments(block.segments)}
        </HeadingTag>
      )
    }

    case 'paragraph':
      if (isInTitleGroup) {
        const titleClasses = isSubtitle
          ? 'text-lg font-medium text-muted-foreground text-center mb-6'
          : 'text-2xl font-bold text-center mt-12 mb-2'

        return <p className={titleClasses}>{segments(block.segments)}</p>
      }
      if (block.isQuoteTitle) {
        return <p className={QUOTE_TITLE_EMPHASIS}>{segments(block.segments)}</p>
      }
      return <p className="mb-4 leading-relaxed">{segments(block.segments)}</p>

    case 'blockquote': {
      // A structured quote (Standard Ebooks letter / titled list) keeps its
      // interior as nested blocks so the title and each list item stay distinct
      // highlight/tap units; a plain quote renders its flattened segments. Both
      // share the one quote frame.
      //
      // A structured quote is a standalone multi-line block, so it gets
      // block-level separation matching the table/figure rhythm. The leaf quote
      // keeps tight margins so an epigraph clusters with its attribution line
      // inside the epigraph wrapper (see Reader.tsx).
      const verticalMargin = block.children ? 'my-6' : 'my-1'

      return (
        <blockquote
          className={`border-border text-muted-foreground ${verticalMargin} border-l-2 pl-5 text-[0.95rem] leading-relaxed italic`}
        >
          {block.children
            ? block.children.map((child, idx) => (
                <ContentBlock
                  key={idx}
                  block={child}
                  currentParagraph={currentParagraph}
                  onParagraphClick={onParagraphClick}
                  onCopyText={onCopyText}
                  currentChapter={currentChapter}
                  paragraphRef={paragraphRef}
                  bookmarkedParagraphs={bookmarkedParagraphs}
                  missingAudioParagraphs={missingAudioParagraphs}
                />
              ))
            : segments(block.segments)}
        </blockquote>
      )
    }

    case 'attribution':
      return (
        <p className="text-muted-foreground my-1 pl-5 text-right text-sm">
          {'\u2014 '}
          {segments(block.segments)}
        </p>
      )

    case 'list': {
      const depthPadding = ['', 'pl-6', 'pl-12', 'pl-16'][block.level ?? 0] ?? 'pl-16'

      return (
        <ul className={`mb-1 list-none space-y-1 ${depthPadding}`}>
          {block.items?.map((itemSegments, idx) => (
            <li key={idx}>{segments(itemSegments)}</li>
          ))}
        </ul>
      )
    }

    case 'scene-break':
      return <div className="h-12" aria-hidden="true" />

    case 'image': {
      if (!block.src) return null
      const caption = block.alt && !isFilenameAlt(block.alt) ? block.alt : undefined

      return (
        <figure className="my-6">
          <img
            src={block.src}
            alt={block.alt || ''}
            className="mx-auto h-auto max-w-full rounded-sm"
          />
          {caption && (
            <figcaption className="text-muted-foreground mt-2 text-center text-sm">
              {caption}
            </figcaption>
          )}
        </figure>
      )
    }

    case 'table': {
      // Row is the unit: the whole <tr> is the play/highlight/tap target (the
      // narrator speaks one row as one utterance), while cells lay out as aligned
      // columns. Highlight + bookmark mirror the prose conventions in
      // renderSegments, lifted from the span up to the row.
      return (
        <div className="bg-surface-inset inset-shadow-surface my-6 overflow-x-auto rounded-lg">
          <table className="w-full text-sm">
            <tbody>
              {block.rows?.map((row, rowIndex) => {
                const paragraphIndex = row.segments[0]?.paragraphIndex ?? -1
                const isActive = paragraphIndex === currentParagraph
                const isBookmarked = bookmarkedParagraphs?.has(paragraphIndex) ?? false
                const isMissingAudio = missingAudioParagraphs?.has(paragraphIndex) ?? false

                const tableRow = (
                  <tr
                    key={rowIndex}
                    data-reading-chapter={currentChapter}
                    data-reading-paragraph={paragraphIndex}
                    onClick={() => {
                      if (window.getSelection()?.isCollapsed === false) return
                      onParagraphClick?.(currentChapter, paragraphIndex)
                    }}
                    className={`border-border cursor-pointer border-b transition-[color,background-color,opacity] last:border-0 ${
                      isActive ? ACTIVE_PARAGRAPH_HIGHLIGHT : 'hover:bg-accent'
                    } ${isMissingAudio ? MISSING_AUDIO_DIM : ''}`}
                  >
                    {row.cells.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`px-4 py-2 align-top tabular-nums ${
                          isBookmarked && cellIndex === 0 ? 'border-attention border-l-2' : ''
                        }`}
                      >
                        <span
                          ref={isActive && cellIndex === 0 ? paragraphRef : undefined}
                          data-paragraph={cellIndex === 0 ? true : undefined}
                          data-active-paragraph={isActive && cellIndex === 0 ? true : undefined}
                          dangerouslySetInnerHTML={{ __html: cell }}
                        />
                      </td>
                    ))}
                  </tr>
                )

                return onCopyText && isSpeakableText(row.segments[0]?.html ?? '') ? (
                  <ParagraphContextMenu
                    key={rowIndex}
                    chapter={currentChapter}
                    paragraph={paragraphIndex}
                    onCopyText={onCopyText}
                  >
                    {tableRow}
                  </ParagraphContextMenu>
                ) : (
                  tableRow
                )
              })}
            </tbody>
          </table>
        </div>
      )
    }

    default:
      return null
  }
}
