'use client'

import { type SelectGroup, type SelectOption, Select } from '@carbonid1/design-system'
import { useCallback, useMemo } from 'react'
import type { VoiceEntry } from '@/lib/services/voice/voice.types'
import { VoiceSourceBadge } from '../VoiceSourceBadge/VoiceSourceBadge'

interface VoiceSelectProps {
  voices: VoiceEntry[]
  value: string
  onChange: (name: string) => void
  placeholder?: string
  id?: string
  className?: string
  menuAlign?: 'start' | 'center' | 'end'
  extraOptions?: SelectOption[]
  onOpenChange?: (open: boolean) => void
  'aria-label'?: string
}

export const VoiceSelect = ({
  voices,
  value,
  onChange,
  placeholder,
  id,
  className,
  menuAlign,
  extraOptions,
  onOpenChange,
  'aria-label': ariaLabel,
}: VoiceSelectProps) => {
  const groups: SelectGroup[] = useMemo(() => {
    const appVoices = voices.filter(v => v.type === 'app')
    const customVoices = voices.filter(v => v.type === 'custom')

    return [
      ...(customVoices.length > 0
        ? [
            {
              label: 'Your Voices',
              options: customVoices.map(v => ({ value: v.name, label: v.displayName })),
            },
          ]
        : []),
      ...(appVoices.length > 0
        ? [
            {
              label: 'Included Voices',
              options: appVoices.map(v => ({ value: v.name, label: v.displayName })),
            },
          ]
        : []),
    ]
  }, [voices])

  const voicesByName = useMemo(() => new Map(voices.map(v => [v.name, v])), [voices])

  const renderOption = useCallback(
    (option: SelectOption) => {
      const voice = voicesByName.get(option.value)

      if (!voice) return <span>{option.label}</span>
      return (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span>{voice.displayName}</span>
            <VoiceSourceBadge source={voice.source} />
          </span>
          {voice.tags.length > 0 && (
            <span className="text-muted-foreground mt-0.5 block text-xs">
              {voice.tags.join(', ')}
            </span>
          )}
        </>
      )
    },
    [voicesByName],
  )

  return (
    <Select
      value={value}
      onChange={onChange}
      options={extraOptions}
      groups={groups}
      placeholder={placeholder}
      id={id}
      className={className}
      menuAlign={menuAlign}
      renderOption={renderOption}
      onOpenChange={onOpenChange}
      aria-label={ariaLabel}
    />
  )
}
