'use client'

import { Button, Card, toast, Tooltip } from '@carbonid1/design-system'
import { X } from 'lucide-react'
import { useEffect, useId } from 'react'
import { VoiceSelect } from '@/components/VoiceSelect/VoiceSelect'
import { formatBytes } from '@/lib/helpers/formatBytes/formatBytes'
import { formatDuration } from '@/lib/helpers/formatDuration/formatDuration'
import { useBookVoice } from '@/lib/hooks/useBookVoice/useBookVoice'
import { useVoices } from '@/lib/hooks/useVoices/useVoices'
import { startPregeneration } from '@/lib/services/pregeneration/helpers/startPregeneration/startPregeneration'
import { useOnboardingStore } from '@/store/useOnboardingStore'
import { type Estimate, usePregenStore } from '@/store/usePregenStore'

interface Props {
  bookId: string
  bookTitle: string
  onClose: () => void
}

export const PregenOnboardingPanel = ({ bookId, bookTitle, onClose }: Props) => {
  const voiceFieldId = useId()
  const estimate = usePregenStore(s => s.estimates[bookId])
  const updateEstimate = usePregenStore(s => s.updateEstimate)
  const markComplete = useOnboardingStore(s => s.markComplete)
  const { effectiveVoice, setVoice } = useBookVoice(bookId)
  const { voices } = useVoices()

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/pregenerate/estimate/${bookId}`)

        if (!response.ok) return
        const data: Estimate = await response.json()

        if (!cancelled) updateEstimate(bookId, data)
      } catch {
        // estimate is non-critical; the panel falls back to a "Calculating…" state.
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [bookId, effectiveVoice, updateEstimate])

  const overBudget = estimate ? !estimate.budget.ok : false
  const shortfallLabel =
    estimate && !estimate.budget.ok ? formatBytes(estimate.budget.shortfallBytes) : null
  const canStart = Boolean(estimate) && !overBudget

  const handleStart = async () => {
    const job = await startPregeneration(bookId)

    if (!job) return
    markComplete('pregen')
    toast('Generation started', {
      description: 'Keep reading or come back when it’s ready.',
    })
    onClose()
  }

  return (
    <Card.Root className="mx-4 my-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          Pre-generate <span className="italic">{bookTitle}</span>
        </h2>
        <Tooltip label="Close" position="bottom">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X />
          </Button>
        </Tooltip>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Audio generates in the background, sentence by sentence. Pre-generation gives you the
        smoothest playback — no buffering between lines.
      </p>

      <div className="mt-4 space-y-1">
        <label htmlFor={voiceFieldId} className="text-muted-foreground text-xs font-medium">
          Voice
        </label>
        <VoiceSelect
          id={voiceFieldId}
          value={effectiveVoice}
          onChange={setVoice}
          voices={voices}
          aria-label="Voice for pre-generation"
        />
        <p className="text-muted-foreground pt-1 text-xs">
          {estimate ? <Estimation estimate={estimate} /> : 'Calculating estimate…'}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <StartGenerationButton
          canStart={canStart}
          overBudget={overBudget}
          shortfallLabel={shortfallLabel}
          onStart={handleStart}
        />
        <Button variant="ghost" onClick={onClose}>
          Maybe later
        </Button>
      </div>
    </Card.Root>
  )
}

interface StartGenerationButtonProps {
  canStart: boolean
  overBudget: boolean
  shortfallLabel: string | null
  onStart: () => void
}

const StartGenerationButton = ({
  canStart,
  overBudget,
  shortfallLabel,
  onStart,
}: StartGenerationButtonProps) => {
  const button = (
    <Button variant="primary" onClick={onStart} disabled={!canStart}>
      Start generation
    </Button>
  )

  if (overBudget && shortfallLabel) {
    return (
      <Tooltip
        label={`Free ${shortfallLabel} in Settings or raise the cache limit.`}
        position="bottom"
      >
        {button}
      </Tooltip>
    )
  }
  return button
}

const Estimation = ({ estimate }: { estimate: Estimate }) => {
  const cachedPercent =
    estimate.totalParagraphs > 0
      ? Math.round((estimate.cachedParagraphs / estimate.totalParagraphs) * 100)
      : 0

  return (
    <>
      ~{formatBytes(estimate.estimatedSizeBytes)} · ~
      {formatDuration(estimate.estimatedGenerationMinutes * 60_000)} · {cachedPercent}% cached
    </>
  )
}
