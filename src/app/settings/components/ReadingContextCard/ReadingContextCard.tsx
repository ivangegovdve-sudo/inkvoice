'use client'

import { Card, Switch, Text, toast } from '@carbonid1/design-system'
import { useCallback, useEffect, useState } from 'react'
import { SETTINGS_KEYS } from '@/lib/services/settings/settings.keys'

interface SettingResponse {
  value?: unknown
  available?: boolean
}

interface StatusOptions {
  enabled: boolean
  loaded: boolean
  saving: boolean
}

const getStatus = ({ enabled, loaded, saving }: StatusOptions): string => {
  if (!loaded) return 'Loading…'
  if (saving) return 'Saving…'
  return enabled ? 'On' : 'Off'
}

export const ReadingContextCard = () => {
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/settings/${SETTINGS_KEYS.READING_CONTEXT_MCP_ENABLED}`)

        if (response.ok) {
          const data: SettingResponse = await response.json()

          setEnabled(data.value === true)
        }
      } catch {
        toast.error('Failed to load AI reading access setting')
      } finally {
        setLoaded(true)
      }
    }

    load()
  }, [])

  const handleCheckedChange = useCallback(async (nextEnabled: boolean) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/settings/${SETTINGS_KEYS.READING_CONTEXT_MCP_ENABLED}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: nextEnabled }),
      })

      if (!response.ok) throw new Error('Setting update failed')

      const data: SettingResponse = await response.json()

      setEnabled(nextEnabled)
      if (nextEnabled && data.available === false) {
        toast.error('Reading access is enabled, but the local endpoint could not start')
      }
    } catch {
      toast.error('Failed to update AI reading access')
    } finally {
      setSaving(false)
    }
  }, [])

  const status = getStatus({ enabled, loaded, saving })

  return (
    <Card.Root className="p-5">
      <Text as="h2" className="mb-1 text-base font-semibold">
        AI reading access
      </Text>
      <Text className="text-muted-foreground mb-4 text-xs">
        Let local AI clients ask InkVoice for the book, reading position, selected text, and earlier
        paragraphs.
      </Text>

      <Text as="div" className="flex items-center justify-between gap-4 text-sm font-medium">
        <Text as="span">Share reading context</Text>
        <Text as="span" className="text-muted-foreground ml-auto text-xs font-normal">
          {status}
        </Text>
        <Switch.Root
          checked={enabled}
          disabled={!loaded || saving}
          onCheckedChange={handleCheckedChange}
          aria-label="Share reading context"
        >
          <Switch.Thumb />
        </Switch.Root>
      </Text>

      <Text className="text-muted-foreground mt-4 text-xs leading-relaxed">
        When enabled, a connected client can read book excerpts and may send them to its model
        provider. InkVoice never starts a model or changes your books through this connection.
      </Text>
    </Card.Root>
  )
}
