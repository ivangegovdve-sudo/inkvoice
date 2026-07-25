'use client'

import { Card, getModKey, toast, useHotkeys } from '@carbonid1/design-system'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDeleteVoice } from '@/lib/hooks/useDeleteVoice/useDeleteVoice'
import { useSampleSSE } from '@/lib/hooks/useSampleSSE/useSampleSSE'
import { useUpdateVoiceTags } from '@/lib/hooks/useUpdateVoiceTags/useUpdateVoiceTags'
import { UNDO_WINDOW_MS } from '@/lib/services/voice/voice.consts'
import type { VoiceEntry } from '@/lib/services/voice/voice.types'
import { useVoiceStore } from '@/store/useVoiceStore'
import { VoiceDesignSection } from './components/VoiceDesignSection/VoiceDesignSection'
import { VoiceList } from './components/VoiceList'
import { VoiceListSkeleton } from './components/VoiceListSkeleton'
import { VoiceUploadSection } from './components/VoiceUploadSection/VoiceUploadSection'
import { useVoicePreview } from './hooks/useVoicePreview/useVoicePreview'

interface UndoState {
  voiceName: string
  previousVoice: string
  previousBookVoices: Record<string, string>
}

interface VoiceManagerCardProps {
  voices: VoiceEntry[]
  loading: boolean
  onVoicesChanged: () => void
}

export const VoiceManagerCard = ({ voices, loading, onVoicesChanged }: VoiceManagerCardProps) => {
  const voice = useVoiceStore(s => s.voice)
  const setVoice = useVoiceStore(s => s.setVoice)
  const setBookVoice = useVoiceStore(s => s.setBookVoice)
  const clearVoiceFromAllBooks = useVoiceStore(s => s.clearVoiceFromAllBooks)
  const { playing, error: previewError, play, stop } = useVoicePreview()
  const { deleteVoice, restoreVoice } = useDeleteVoice()
  const { saving: tagsSaving, updateTags } = useUpdateVoiceTags()
  const handleSampleFailed = useCallback((voiceName: string) => {
    toast('Sample generation failed', {
      description: `Could not generate a sample for "${voiceName}". You can still use the voice.`,
    })
  }, [])
  const { startListening } = useSampleSSE({
    onSampleReady: onVoicesChanged,
    onSampleFailed: handleSampleFailed,
  })

  const [hiddenVoices, setHiddenVoices] = useState<Set<string>>(new Set())
  const lastDeletedRef = useRef<UndoState | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearUndoTimeout = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
      undoTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    fetch('/api/voices/cleanup-expired', { method: 'POST' }).catch(() => {})

    return clearUndoTimeout
  }, [clearUndoTimeout])

  const unhideVoice = useCallback((name: string) => {
    setHiddenVoices(prev => {
      const next = new Set(prev)

      next.delete(name)
      return next
    })
  }, [])

  const restoreVoiceAssignments = useCallback(
    (undoState: UndoState) => {
      if (undoState.previousVoice === undoState.voiceName) setVoice(undoState.voiceName)
      Object.entries(undoState.previousBookVoices)
        .filter(([, v]) => v === undoState.voiceName)
        .forEach(([bookId]) => setBookVoice(bookId, undoState.voiceName))
    },
    [setVoice, setBookVoice],
  )

  const handleUndo = useCallback(async () => {
    const undoState = lastDeletedRef.current

    if (!undoState) return
    lastDeletedRef.current = null
    clearUndoTimeout()

    unhideVoice(undoState.voiceName)
    toast.dismiss()

    const restored = await restoreVoice(undoState.voiceName)

    if (!restored) {
      toast.error('Failed to restore voice')
      return
    }
    restoreVoiceAssignments(undoState)
    onVoicesChanged()
  }, [unhideVoice, clearUndoTimeout, restoreVoice, restoreVoiceAssignments, onVoicesChanged])

  useHotkeys('mod+z', handleUndo)

  const handleDelete = useCallback(
    (voiceName: string) => {
      if (playing?.name === voiceName) stop()
      setHiddenVoices(prev => new Set(prev).add(voiceName))

      const previousVoice = useVoiceStore.getState().voice
      const previousBookVoices = { ...useVoiceStore.getState().bookVoices }

      clearVoiceFromAllBooks(voiceName)

      const undoState: UndoState = { voiceName, previousVoice, previousBookVoices }

      lastDeletedRef.current = undoState
      clearUndoTimeout()
      undoTimeoutRef.current = setTimeout(() => {
        lastDeletedRef.current = null
        undoTimeoutRef.current = null
      }, UNDO_WINDOW_MS)

      toast.dismiss()
      toast('Voice removed', {
        description: `${getModKey()}+Z to undo`,
        action: {
          label: 'Undo',
          onClick: () => {
            handleUndo()
          },
        },
        duration: UNDO_WINDOW_MS,
      })

      deleteVoice(voiceName).then(deleted => {
        if (!deleted) {
          unhideVoice(voiceName)
          lastDeletedRef.current = null
          restoreVoiceAssignments(undoState)
          toast.error('Failed to delete voice')
        }
        onVoicesChanged()
      })
    },
    [
      playing,
      stop,
      clearVoiceFromAllBooks,
      clearUndoTimeout,
      deleteVoice,
      handleUndo,
      unhideVoice,
      restoreVoiceAssignments,
      onVoicesChanged,
    ],
  )

  const visibleVoices = useMemo(
    () => voices.filter(v => !hiddenVoices.has(v.name)),
    [voices, hiddenVoices],
  )

  return (
    <Card.Root className="p-5">
      <h2 className="mb-1 text-base font-semibold">Voices</h2>
      <p className="text-muted-foreground mb-4 text-xs">
        Pick a voice for narration. Switching re-generates any unheard audio.
      </p>

      {(() => {
        if (loading) return <VoiceListSkeleton />
        if (visibleVoices.length === 0) {
          return (
            <div className="text-muted-foreground">
              <p>No voices found.</p>
              <p className="mt-2 text-sm">
                Add voices to{' '}
                <code className="bg-muted rounded-sm px-1">
                  data/voices/&lt;name&gt;/source.wav
                </code>
              </p>
            </div>
          )
        }
        return (
          <div className="space-y-4">
            <VoiceList
              voices={visibleVoices}
              selectedVoice={voice}
              onSelect={setVoice}
              playing={playing}
              onPlay={play}
              onDelete={handleDelete}
              uploadSection={
                <>
                  <VoiceUploadSection
                    onVoicesChanged={onVoicesChanged}
                    onSampleStarted={startListening}
                  />
                  <VoiceDesignSection
                    onVoicesChanged={onVoicesChanged}
                    onSampleStarted={startListening}
                  />
                </>
              }
              tagsSaving={tagsSaving}
              updateTags={updateTags}
            />

            {previewError && <p className="text-destructive text-sm">{previewError}</p>}
          </div>
        )
      })()}
    </Card.Root>
  )
}
