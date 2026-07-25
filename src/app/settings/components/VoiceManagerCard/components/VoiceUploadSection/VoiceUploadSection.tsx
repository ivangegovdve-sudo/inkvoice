'use client'

import { Button, Input, Select, toast } from '@carbonid1/design-system'
import { Upload, X } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AudioDropZone } from '@/components/ui/AudioDropZone/AudioDropZone'
import { useUploadVoice } from '@/lib/hooks/useUploadVoice/useUploadVoice'
import { TranscriptionReview } from './components/TranscriptionReview/TranscriptionReview'
import { UploadTips } from './components/UploadTips/UploadTips'
import { getAudioDuration } from './helpers/getAudioDuration/getAudioDuration'

const ACCEPTED_FORMATS =
  'audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/flac,.wav,.mp3,.m4a,.ogg,.flac'

const MIN_DURATION = 10
const MAX_DURATION = 20

type LanguageValue = '' | 'en' | 'uk' | 'ru'

const LANGUAGE_OPTIONS: { value: LanguageValue; label: string }[] = [
  { value: '', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ru', label: 'Russian' },
]

const isLanguageValue = (value: string): value is LanguageValue =>
  LANGUAGE_OPTIONS.some(option => option.value === value)

interface UploadFormValues {
  name: string
}

interface UploadedVoice {
  name: string
  transcription: string
}

interface VoiceUploadSectionProps {
  onVoicesChanged: () => void
  onSampleStarted: (voiceName: string) => void
}

export const VoiceUploadSection = ({
  onVoicesChanged,
  onSampleStarted,
}: VoiceUploadSectionProps) => {
  const nameFieldId = useId()
  const languageFieldId = useId()
  const { uploading, error: uploadError, upload, reset: resetUpload } = useUploadVoice()
  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
  } = useForm<UploadFormValues>({ mode: 'onSubmit' })
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState<LanguageValue>('')
  const [fileDuration, setFileDuration] = useState<number | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [uploadedVoice, setUploadedVoice] = useState<UploadedVoice | null>(null)

  const resetEverything = () => {
    resetForm()
    resetUpload()
    setFile(null)
    setFileDuration(null)
    setFileError(null)
    setLanguage('')
    setUploadedVoice(null)
  }

  const handleFileChange = async (selectedFile: File | null) => {
    setFile(selectedFile)
    setFileDuration(null)
    setFileError(null)
    resetUpload()

    if (!selectedFile) return

    try {
      const duration = await getAudioDuration(selectedFile)

      setFileDuration(duration)
    } catch {
      setFileError('Could not read this audio file. Try a WAV, MP3, M4A, OGG, or FLAC.')
    }
  }

  const durationValid =
    fileDuration !== null && fileDuration >= MIN_DURATION && fileDuration <= MAX_DURATION
  const canSubmit = Boolean(file) && durationValid && !uploading

  const onSubmit = handleSubmit(async data => {
    if (!canSubmit || !file) return

    const result = await upload(file, data.name.trim(), language || undefined)

    if (result) {
      setUploadedVoice({ name: result.name, transcription: result.transcription ?? '' })
      onVoicesChanged()
      onSampleStarted(result.name)
    }
  })

  const handleClose = () => {
    resetEverything()
    setOpen(false)
  }

  const handleReviewDone = () => {
    handleClose()
    onVoicesChanged()
    toast('Voice uploaded', { description: 'Sample is generating in the background.' })
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        fullWidth
        size="large"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        <Upload />
        Upload voice
      </Button>
    )
  }

  return (
    <div className="bg-surface-inset inset-shadow-surface space-y-3 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {uploadedVoice ? 'Review transcription' : 'Upload a voice'}
        </h3>
        <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close upload form">
          <X />
        </Button>
      </div>

      {!uploadedVoice && (
        <>
          <UploadTips minSeconds={MIN_DURATION} maxSeconds={MAX_DURATION} />
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1">
                <label htmlFor={nameFieldId} className="text-muted-foreground text-xs font-medium">
                  Voice name
                </label>
                <Input
                  id={nameFieldId}
                  {...register('name', { required: 'Voice name is required' })}
                  placeholder="e.g. Marusia"
                  aria-invalid={errors.name ? true : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={languageFieldId}
                  className="text-muted-foreground text-xs font-medium"
                >
                  Language
                </label>
                <Select
                  id={languageFieldId}
                  value={language}
                  onChange={value => {
                    if (isLanguageValue(value)) setLanguage(value)
                  }}
                  options={LANGUAGE_OPTIONS}
                  aria-label="Voice language"
                />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium">Audio sample</p>
              <AudioDropZone
                file={file}
                onFileChange={handleFileChange}
                accept={ACCEPTED_FORMATS}
                acceptHint={`WAV, MP3, M4A, OGG, FLAC · ${MIN_DURATION}–${MAX_DURATION} seconds`}
                durationSeconds={fileDuration}
                minSeconds={MIN_DURATION}
                maxSeconds={MAX_DURATION}
                durationError={fileError}
                disabled={uploading}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                size="default"
                loading={uploading}
                disabled={!canSubmit}
              >
                {uploading ? 'Uploading & transcribing…' : 'Upload'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="default"
                onClick={handleClose}
                disabled={uploading}
              >
                Cancel
              </Button>
              {(errors.name?.message || uploadError) && (
                <p className="text-destructive text-sm" role="alert">
                  {errors.name?.message ?? uploadError}
                </p>
              )}
            </div>
          </form>
        </>
      )}

      {uploadedVoice && (
        <TranscriptionReview
          voiceName={uploadedVoice.name}
          language={language}
          languageWasAutoDetected={language === ''}
          initialTranscription={uploadedVoice.transcription}
          onClose={handleReviewDone}
        />
      )}
    </div>
  )
}
