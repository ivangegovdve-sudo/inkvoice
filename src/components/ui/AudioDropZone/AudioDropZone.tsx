'use client'

import { Button, Card, cn } from '@carbonid1/design-system'
import { AlertCircle, FileAudio, UploadCloud, X } from 'lucide-react'
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface Props {
  file: File | null
  onFileChange: (file: File | null) => void
  accept: string
  acceptHint: string
  durationSeconds: number | null
  minSeconds: number
  maxSeconds: number
  durationError?: string | null
  disabled?: boolean
  className?: string
}

export const AudioDropZone = ({
  file,
  onFileChange,
  accept,
  acceptHint,
  durationSeconds,
  minSeconds,
  maxSeconds,
  durationError,
  disabled,
  className,
}: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const audioUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    },
    [audioUrl],
  )

  const handleBrowse = useCallback(() => {
    if (disabled) return
    inputRef.current?.click()
  }, [disabled])

  const handleDrag = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    if (event.type === 'dragenter' || event.type === 'dragover') setDragActive(true)
    else if (event.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    if (disabled) return
    const dropped = event.dataTransfer.files?.[0]

    if (dropped) onFileChange(dropped)
  }

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation()
    onFileChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const durationOutOfRange =
    durationSeconds !== null && (durationSeconds < minSeconds || durationSeconds > maxSeconds)
  const showError = Boolean(durationError) || durationOutOfRange
  const formattedDuration = durationSeconds === null ? null : `${durationSeconds.toFixed(1)}s`
  const errorMessage =
    durationError ??
    (durationOutOfRange && formattedDuration
      ? `Audio must be ${minSeconds}–${maxSeconds} seconds (got ${formattedDuration})`
      : null)

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={event => onFileChange(event.target.files?.[0] ?? null)}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {!file && (
        <button
          type="button"
          onClick={handleBrowse}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          disabled={disabled}
          className={cn(
            'group flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm transition-colors',
            'focus:ring-primary/40 focus:ring-2 focus:outline-hidden',
            dragActive
              ? 'border-primary/60 bg-primary-muted/40'
              : 'border-border hover:border-primary/40 hover:bg-accent/40',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <UploadCloud
            className={cn(
              'size-6 transition-colors',
              dragActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary',
            )}
          />
          <span className="text-foreground font-medium">
            Drop audio here or <span className="text-primary">click to browse</span>
          </span>
          <span className="text-muted-foreground text-xs">{acceptHint}</span>
        </button>
      )}

      {file && (
        <Card.Root
          className={cn('flex flex-col gap-3 p-3', showError && 'ring-destructive/50 ring-1')}
        >
          <div className="flex items-start gap-3">
            <FileAudio
              className={cn(
                'mt-0.5 size-5 shrink-0',
                showError ? 'text-destructive' : 'text-primary',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground truncate text-sm font-medium">{file.name}</span>
                {formattedDuration && (
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-xs',
                      showError
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {formattedDuration}
                  </span>
                )}
              </div>
              {showError && errorMessage && (
                <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                  <AlertCircle className="size-3" />
                  {errorMessage}
                </p>
              )}
              {!showError && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Listen below to confirm this is the recording you want to use.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="subtle"
                size="small"
                onClick={handleBrowse}
                disabled={disabled}
                aria-label="Replace file"
              >
                Replace
              </Button>
              <Button
                variant="subtle"
                size="icon"
                onClick={handleClear}
                disabled={disabled}
                aria-label="Remove file"
              >
                <X />
              </Button>
            </div>
          </div>

          {audioUrl && (
            <audio
              src={audioUrl}
              controls
              preload="metadata"
              className="w-full"
              aria-label={`Preview of ${file.name}`}
            />
          )}
        </Card.Root>
      )}
    </div>
  )
}
