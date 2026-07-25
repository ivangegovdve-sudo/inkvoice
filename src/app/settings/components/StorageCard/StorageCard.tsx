'use client'

import { Badge, Button, cardVariants, Slider, toast } from '@carbonid1/design-system'
import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatBytes } from '@/lib/helpers/formatBytes/formatBytes'
import { SETTINGS_KEYS } from '@/lib/services/settings/settings.keys'
import { useCacheStats } from './hooks/useCacheStats/useCacheStats'
import type { BookCacheStat } from './hooks/useCacheStats/useCacheStats.types'

const GB = 1024 * 1024 * 1024
const MIN_CACHE_GB = 1
const MAX_CACHE_GB = 30
const DEFAULT_CACHE_GB = 10

export const StorageCard = () => {
  const { stats, loading, refetch } = useCacheStats()
  const [maxSizeGB, setMaxSizeGB] = useState(DEFAULT_CACHE_GB)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const diskGB = stats?.diskTotalBytes ? Math.floor(stats.diskTotalBytes / GB) : MAX_CACHE_GB
  const maxSliderGB = Math.min(diskGB, MAX_CACHE_GB)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings')

        if (response.ok) {
          const settings = await response.json()

          if (typeof settings[SETTINGS_KEYS.MAX_CACHE_SIZE_MB] === 'number') {
            setMaxSizeGB(Math.round(settings[SETTINGS_KEYS.MAX_CACHE_SIZE_MB] / 1024))
          }
        }
      } catch {
        // Settings load failed — use defaults
      } finally {
        setSettingsLoaded(true)
      }
    }

    loadSettings()
  }, [])

  const handleMaxSizeCommit = useCallback(
    async (gb: number) => {
      await fetch('/api/cache/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxSizeMB: gb * 1024 }),
      })
      refetch()
    },
    [refetch],
  )

  const handleDeleteBookCache = useCallback(
    async (book: BookCacheStat) => {
      const url = `/api/cache/tts/${book.bookId}?voice=${encodeURIComponent(book.voice)}`
      const response = await fetch(url, { method: 'DELETE' })

      if (response.ok) {
        const { freedBytes } = await response.json()

        toast(
          `Removed ${formatBytes(freedBytes)} of cached audio for "${book.title}" (${book.voiceDisplayName})`,
        )
        refetch()
      }
    },
    [refetch],
  )

  const usedRatio = stats ? stats.usedBytes / stats.maxBytes : 0
  const usedPercent = Math.min(Math.round(usedRatio * 100), 100)

  return (
    <section className={cardVariants({ className: 'p-5' })}>
      <h2 className="mb-3 text-base font-semibold">Storage</h2>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Max cache size</span>
          {settingsLoaded ? (
            <span className="text-sm font-medium">{maxSizeGB} GB</span>
          ) : (
            <span className="bg-muted-foreground/20 inline-block h-4 w-10 rounded-sm" />
          )}
        </div>
        {settingsLoaded ? (
          <Slider
            value={maxSizeGB}
            onChange={setMaxSizeGB}
            onCommit={handleMaxSizeCommit}
            min={MIN_CACHE_GB}
            max={maxSliderGB}
            aria-label="Max cache size"
          />
        ) : (
          <div className="bg-input h-1.5 w-full rounded-full" />
        )}

        {stats && (
          <div className="space-y-1">
            <div className="bg-input h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {formatBytes(stats.usedBytes)} of {formatBytes(stats.maxBytes)} used
            </p>
          </div>
        )}
      </div>

      <div className="border-border my-4 border-t" />

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Cached Books</h3>
        {(() => {
          if (loading) {
            return (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="bg-muted-foreground/10 h-10 rounded-lg" />
                ))}
              </div>
            )
          }
          if (stats?.books.length) {
            return (
              <div className="space-y-1">
                {stats.books.map(book => (
                  <div
                    key={`${book.bookId}|${book.voice}`}
                    className="group hover:bg-accent flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm">{book.title}</p>
                        <Badge className="shrink-0">{book.voiceDisplayName}</Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">{formatBytes(book.usedBytes)}</p>
                    </div>
                    <Button
                      variant="danger"
                      size="smallIcon"
                      className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                      onClick={() => handleDeleteBookCache(book)}
                      aria-label={`Delete ${book.voiceDisplayName} cache for ${book.title}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )
          }
          return <p className="text-muted-foreground text-sm">No cached audio.</p>
        })()}
      </div>
    </section>
  )
}
