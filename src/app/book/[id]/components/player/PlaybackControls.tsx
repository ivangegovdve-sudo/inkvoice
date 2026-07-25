'use client'

import { Button, Tooltip, useHotkeys } from '@carbonid1/design-system'
import { ChevronLeft, ChevronRight, Loader2, Pause, Play } from 'lucide-react'

interface PlaybackControlsProps {
  isPlaying: boolean
  isLoading: boolean
  /** When set, starting playback is blocked (pausing stays available) and the tooltip shows this reason. */
  disablePlayReason?: string
  onPlayPause: () => void
  onSkipBack: () => void
  onSkipForward: () => void
}

export const PlaybackControls = ({
  isPlaying,
  isLoading,
  disablePlayReason,
  onPlayPause,
  onSkipBack,
  onSkipForward,
}: PlaybackControlsProps) => {
  const blockReason = isPlaying ? undefined : disablePlayReason
  const playPauseAction = isPlaying ? 'Pause' : 'Play'
  const playPauseLabel = blockReason ?? playPauseAction

  useHotkeys(
    'space',
    () => {
      if (!blockReason) onPlayPause()
    },
    { preventDefault: true },
  )
  useHotkeys('left', onSkipBack)
  useHotkeys('right', onSkipForward)

  return (
    <div className="flex items-center justify-center gap-4">
      <Tooltip label="Previous Sentence" shortcut="←">
        <Button size="icon" onClick={onSkipBack}>
          <ChevronLeft />
        </Button>
      </Tooltip>

      <Tooltip label={playPauseLabel} shortcut={blockReason ? undefined : 'Space'}>
        {/* aria-disabled (not disabled) keeps hover/focus events flowing so the
            tooltip can explain why playback is blocked. */}
        <Button
          variant="primary"
          size="largeIcon"
          onClick={blockReason ? undefined : onPlayPause}
          aria-disabled={blockReason ? true : undefined}
          className={`relative ${blockReason ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          {isLoading && <Loader2 className="absolute inset-0 m-auto animate-spin" />}
          {isPlaying ? (
            <Pause className={isLoading ? 'opacity-30' : ''} />
          ) : (
            <Play className={isLoading ? 'opacity-30' : ''} />
          )}
        </Button>
      </Tooltip>

      <Tooltip label="Next Sentence" shortcut="→">
        <Button size="icon" onClick={onSkipForward}>
          <ChevronRight />
        </Button>
      </Tooltip>
    </div>
  )
}
