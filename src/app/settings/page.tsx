'use client'

import { buttonVariants, Tooltip } from '@carbonid1/design-system'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { PageHeader } from '@/components/PageHeader/PageHeader'
import { PregenPanelButton } from '@/components/PregenPanelButton/PregenPanelButton'
import { useVoices } from '@/lib/hooks/useVoices/useVoices'
import { getVoiceFallback } from '@/lib/services/voice/helpers/getVoiceFallback/getVoiceFallback'
import { useVoiceStore } from '@/store/useVoiceStore'
import { AppearanceCard } from './components/AppearanceCard/AppearanceCard'
import { CreditsCard } from './components/CreditsCard/CreditsCard'
import { ReadingContextCard } from './components/ReadingContextCard/ReadingContextCard'
import { StorageCard } from './components/StorageCard/StorageCard'
import { VoiceManagerCard } from './components/VoiceManagerCard/VoiceManagerCard'

export default function Settings() {
  const { voices, loading, refetch } = useVoices()
  const voice = useVoiceStore(s => s.voice)
  const setVoice = useVoiceStore(s => s.setVoice)

  // Load voice preferences from API on mount
  useEffect(() => {
    useVoiceStore.getState().loadAll()
  }, [])

  // Auto-correct stale global voice when voice list loads
  useEffect(() => {
    if (loading || voices.length === 0) return
    const voiceNames = voices.map(v => v.name)
    const fallback = getVoiceFallback(voice, voiceNames)

    if (fallback !== voice) setVoice(fallback)
  }, [loading, voices, voice, setVoice])

  return (
    <div className="flex h-full flex-col">
      <PageHeader>
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2">
          <Tooltip label="Back to Library" position="bottom">
            <Link
              href="/"
              className={buttonVariants({ size: 'icon' })}
              aria-label="Back to Library"
            >
              <ChevronLeft />
            </Link>
          </Tooltip>
          <h1 className="font-semibold">Settings</h1>
          <PregenPanelButton className="ml-auto" />
        </div>
      </PageHeader>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-8 lg:grid-cols-[2fr_1fr] lg:gap-6">
          <section id="voices" className="min-w-0 scroll-mt-20">
            <VoiceManagerCard voices={voices} loading={loading} onVoicesChanged={refetch} />
          </section>
          <div className="min-w-0 space-y-4 lg:space-y-6">
            <StorageCard />
            <AppearanceCard />
            <ReadingContextCard />
            <CreditsCard />
          </div>
        </div>
      </main>
    </div>
  )
}
