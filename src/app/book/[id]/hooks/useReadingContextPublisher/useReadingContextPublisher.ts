'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { ReadingSelection } from '@/lib/services/readingContext/readingContext.types'
import { getReaderSelection } from '../../helpers/getReaderSelection/getReaderSelection'

interface Options {
  book: { id: string; title: string; author: string } | null
  chapter: number
  paragraph: number
  playing: boolean
}

const publish = (body: object) =>
  fetch('/api/reading-context', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(error => console.error('Failed to publish reading context:', error))

export const useReadingContextPublisher = ({
  book,
  chapter,
  paragraph,
  playing,
}: Options): void => {
  const sessionIdRef = useRef<string | null>(null)
  const selectionRef = useRef<ReadingSelection | null>(null)

  const publishCurrentContext = useCallback(() => {
    const sessionId = sessionIdRef.current

    if (!sessionId || !book) return
    publish({
      sessionId,
      book,
      pointer: { chapter, paragraph, playing },
      selection: selectionRef.current,
    })
  }, [book, chapter, paragraph, playing])

  useEffect(() => {
    const sessionId = crypto.randomUUID()

    sessionIdRef.current = sessionId

    return () => {
      fetch(`/api/reading-context?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        keepalive: true,
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const captureSelection = () => {
      selectionRef.current = getReaderSelection({
        selection: window.getSelection(),
        chapter,
      })
      publishCurrentContext()
    }

    document.addEventListener('selectionchange', captureSelection)
    captureSelection()

    return () => document.removeEventListener('selectionchange', captureSelection)
  }, [chapter, publishCurrentContext])

  useEffect(() => {
    publishCurrentContext()
  }, [book, chapter, paragraph, playing, publishCurrentContext])
}
