'use client'

import type { RefObject } from 'react'
import { isSpeakableText } from '@/lib/helpers/isSpeakableText/isSpeakableText'
import type { TextSegment } from '@/lib/types/book'
import { ParagraphContextMenu } from '../../../ParagraphContextMenu/ParagraphContextMenu'
import { ACTIVE_PARAGRAPH_HIGHLIGHT, MISSING_AUDIO_DIM } from '../../Reader.consts'

export interface RenderSegmentsParams {
  segments: TextSegment[] | undefined
  currentParagraph: number
  onParagraphClick: ((chapter: number, paragraph: number) => void) | undefined
  onCopyText?: (chapter: number, paragraph: number) => void
  currentChapter: number
  paragraphRef: RefObject<HTMLSpanElement | null>
  bookmarkedParagraphs?: Set<number>
  missingAudioParagraphs?: Set<number>
}

export const SegmentList = (props: RenderSegmentsParams) => <>{renderSegments(props)}</>

export const renderSegments = ({
  segments,
  currentParagraph,
  onParagraphClick,
  onCopyText,
  currentChapter,
  paragraphRef,
  bookmarkedParagraphs,
  missingAudioParagraphs,
}: RenderSegmentsParams) => {
  if (!segments) return null
  return segments.map((segment, idx) => {
    const isActive = segment.paragraphIndex === currentParagraph
    const isBookmarked = bookmarkedParagraphs?.has(segment.paragraphIndex) ?? false
    const isMissingAudio = missingAudioParagraphs?.has(segment.paragraphIndex) ?? false

    const paragraphSpan = (
      <span
        ref={isActive ? paragraphRef : undefined}
        data-paragraph
        data-active-paragraph={isActive || undefined}
        data-reading-chapter={currentChapter}
        data-reading-paragraph={segment.paragraphIndex}
        onClick={() => {
          if (window.getSelection()?.isCollapsed === false) return
          onParagraphClick?.(currentChapter, segment.paragraphIndex)
        }}
        className={`cursor-pointer transition-[color,background-color,opacity] ${
          isActive ? `${ACTIVE_PARAGRAPH_HIGHLIGHT} -mx-0.5 px-0.5` : 'hover:bg-accent'
        } ${isBookmarked ? 'border-attention -ml-1 border-l-2 pl-1' : ''} ${
          isMissingAudio ? MISSING_AUDIO_DIM : ''
        }`}
        dangerouslySetInnerHTML={{ __html: segment.html }}
      />
    )

    // Separators ('———', '???') are decorative — no menu, nothing worth copying.
    const hasSpeakableText = isSpeakableText(segment.html.replace(/<[^>]+>/g, ''))

    const wrapped =
      onCopyText && hasSpeakableText ? (
        <ParagraphContextMenu
          chapter={currentChapter}
          paragraph={segment.paragraphIndex}
          onCopyText={onCopyText}
        >
          {paragraphSpan}
        </ParagraphContextMenu>
      ) : (
        paragraphSpan
      )

    return <span key={idx}>{wrapped} </span>
  })
}
