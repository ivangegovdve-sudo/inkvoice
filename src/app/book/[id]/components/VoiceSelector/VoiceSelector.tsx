'use client'

import { Tooltip } from '@carbonid1/design-system'
import { useMemo, useState } from 'react'
import { VoiceSelect } from '@/components/VoiceSelect/VoiceSelect'
import { useBookVoice } from '@/lib/hooks/useBookVoice/useBookVoice'
import { useVoices } from '@/lib/hooks/useVoices/useVoices'

interface VoiceSelectorProps {
  bookId: string
}

const DEFAULT_SENTINEL = '__default__'

export const VoiceSelector = ({ bookId }: VoiceSelectorProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { voices, loading } = useVoices()
  const voiceNames = useMemo(() => voices.map(v => v.name), [voices])
  const { effectiveVoice, globalVoice, isOverridden, isStale, setVoice, clearVoice } = useBookVoice(
    bookId,
    voiceNames,
  )

  if (loading || voices.length === 0) {
    return <div className="bg-muted h-7 w-28 animate-pulse rounded-sm" />
  }

  const globalDisplayName = voices.find(v => v.name === globalVoice)?.displayName ?? globalVoice

  const handleChange = (value: string) => {
    if (value === DEFAULT_SENTINEL) {
      clearVoice()
    } else {
      setVoice(value)
    }
  }

  return (
    <div>
      <Tooltip label="Voice" position="bottom" disabled={dropdownOpen}>
        <VoiceSelect
          voices={voices}
          value={isOverridden ? effectiveVoice : DEFAULT_SENTINEL}
          onChange={handleChange}
          onOpenChange={setDropdownOpen}
          aria-label="Voice"
          className="bg-muted rounded-sm border-none px-2 py-1 text-left text-sm"
          menuAlign="end"
          extraOptions={[{ value: DEFAULT_SENTINEL, label: `Default (${globalDisplayName})` }]}
        />
      </Tooltip>
      {isStale && (
        <p className="text-attention-foreground mt-1 text-xs">
          Voice not found — using {effectiveVoice}
        </p>
      )}
    </div>
  )
}
