'use client'

import { Button, cn, Input, Select, Slider, Switch, toast, Tooltip } from '@carbonid1/design-system'
import { AudioLines, Dices, HelpCircle, Play, RefreshCw, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs/Tabs'
import { Textarea } from '@/components/ui/Textarea/Textarea'
import { VOICE_PRESET_TEXTS } from '@/lib/consts/voicePresetTexts/voicePresetTexts'
import { generateRandomVoiceName } from '@/lib/helpers/generateRandomVoiceName/generateRandomVoiceName'
import { useTTSLifecycleStore } from '@/lib/hooks/useTTSLifecycle/useTTSLifecycle'
import {
  ATTRIBUTE_LABELS,
  ATTRIBUTE_OPTIONS,
  ATTRIBUTE_ORDER,
  type AttributeKey,
  type AttributeValues,
  EMPTY_ATTRIBUTES,
} from './VoiceDesignSection.consts'
import { DesignPresets } from './components/DesignPresets/DesignPresets'
import { getVoiceDesignTags } from './helpers/getVoiceDesignTags/getVoiceDesignTags'

const MAX_CUSTOM_CHARS = 500
const DEFAULT_VARIATION = 0.3
const VARIATION_MIN = 0
const VARIATION_MAX = 1
const VARIATION_STEP = 0.05
const SEED_MAX = 2_147_483_647

const VARIATION_TOOLTIP =
  'Controls how strictly the model follows the description. Lower values stick closer to the requested attributes; higher values let the model improvise, producing more variety between takes but a looser match. Default 0.3.'
const SEED_TOOLTIP =
  'A fixed number that makes the same description regenerate the same voice. Leave blank to get a different voice every time.'

type PreviewSource = 'en' | 'uk' | 'ru' | 'custom'

const SOURCE_OPTIONS: ReadonlyArray<{ value: PreviewSource; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ru', label: 'Russian' },
  { value: 'custom', label: 'Custom' },
]

const isPreviewSource = (value: string): value is PreviewSource =>
  SOURCE_OPTIONS.some(option => option.value === value)

interface NameFormValues {
  name: string
}

interface CachedTake {
  audioBlob: Blob
  text: string
  source: PreviewSource
  // Snapshot at generation time so tags reflect the audio the user just heard,
  // not whatever the form holds at save time after a re-tweak.
  attributes: AttributeValues
}

interface VoiceDesignSectionProps {
  onVoicesChanged: () => void
  onSampleStarted: (voiceName: string) => void
}

const buildInstruct = (attributes: AttributeValues): string =>
  ATTRIBUTE_ORDER.map(key => attributes[key])
    .filter(value => value.length > 0)
    .join(', ')

const generateRandomSeed = (): number => Math.floor(Math.random() * SEED_MAX)

export const VoiceDesignSection = ({
  onVoicesChanged,
  onSampleStarted,
}: VoiceDesignSectionProps) => {
  const nameFieldId = useId()
  const lifecycleState = useTTSLifecycleStore(s => s.state)

  const [open, setOpen] = useState(false)
  const [attributes, setAttributes] = useState<AttributeValues>(EMPTY_ATTRIBUTES)
  const [variation, setVariation] = useState(DEFAULT_VARIATION)
  // Seed is pre-filled on mount so consecutive Generate presses produce the same
  // voice (useful for sampling more text in the voice you just heard). Use the
  // "New voice" action or clear the field to get a different voice.
  const [seedText, setSeedText] = useState(() => String(generateRandomSeed()))
  const [previewSource, setPreviewSource] = useState<PreviewSource>('en')
  const [customText, setCustomText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastTake, setLastTake] = useState<CachedTake | null>(null)
  const hasGenerated = lastTake !== null

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    reset: resetForm,
    formState: { errors },
  } = useForm<NameFormValues>({
    mode: 'onSubmit',
    defaultValues: { name: generateRandomVoiceName() },
  })

  useEffect(
    () => () => {
      audioRef.current?.pause()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    },
    [],
  )

  const instruct = useMemo(() => buildInstruct(attributes), [attributes])

  const activeText = previewSource === 'custom' ? customText : VOICE_PRESET_TEXTS[previewSource]

  const canSave = lastTake !== null && !saving && !generating

  const generatingLabel =
    lifecycleState === 'starting' || lifecycleState === 'stopped'
      ? 'Starting voice engine…'
      : 'Generating…'

  const resetEverything = () => {
    setLastTake(null)
    setAttributes(EMPTY_ATTRIBUTES)
    setVariation(DEFAULT_VARIATION)
    setSeedText(String(generateRandomSeed()))
    setCustomText('')
    setPreviewSource('en')
    setGenerateError(null)
    setSaveError(null)
    resetForm({ name: generateRandomVoiceName() })
  }

  const handleClose = () => {
    resetEverything()
    setOpen(false)
  }

  const handleAttributeChange = (key: AttributeKey, value: string) => {
    setAttributes(prev => ({ ...prev, [key]: value }))
  }

  const handleRerollName = () => {
    setValue('name', generateRandomVoiceName(), { shouldValidate: false })
  }

  const handleGenerate = async () => {
    if (generating) return

    const validationErrors: string[] = []

    if (!activeText.trim()) validationErrors.push('Add some preview text.')

    const trimmedSeed = seedText.trim()
    const parsedSeed = trimmedSeed ? Number(trimmedSeed) : null

    if (
      parsedSeed !== null &&
      (!Number.isInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > SEED_MAX)
    ) {
      validationErrors.push(`Seed must be a whole number between 0 and ${SEED_MAX}.`)
    }

    if (validationErrors.length) {
      setGenerateError(validationErrors.join(' '))
      return
    }

    setGenerating(true)
    setGenerateError(null)

    const controller = new AbortController()

    abortControllerRef.current = controller

    try {
      const response = await fetch('/api/voices/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: activeText.trim(),
          instruct,
          classTemperature: variation,
          seed: parsedSeed ?? undefined,
        }),
        cache: 'no-store',
        signal: controller.signal,
      })

      if (!response.ok) {
        let message = 'Generation failed.'

        try {
          const data = await response.json()
          const errorText = data?.error

          if (typeof errorText === 'string') message = errorText
        } catch {
          // ignore parse error, use default message
        }
        setGenerateError(message)
        return
      }

      const audioBlob = await response.blob()

      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      const url = URL.createObjectURL(audioBlob)

      audioUrlRef.current = url
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play().catch(() => {
          // Autoplay can be blocked; controls are visible so user can press play.
        })
      }

      // Snapshot at generation time so Save persists exactly what was heard,
      // not whatever the form holds after a re-tweak.
      setLastTake({ audioBlob, text: activeText.trim(), source: previewSource, attributes })
    } catch (error) {
      // User-initiated cancel — silent, no error UI.
      if (error instanceof Error && error.name === 'AbortError') return
      setGenerateError('Generation failed. The voice engine may still be warming up — try again.')
    } finally {
      abortControllerRef.current = null
      setGenerating(false)
    }
  }

  const handleStopGeneration = () => {
    abortControllerRef.current?.abort()
  }

  const onSave = handleSubmit(async values => {
    if (!lastTake) {
      setSaveError('Generate at least one preview before saving.')
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      const formData = new FormData()

      formData.append('name', values.name.trim())
      formData.append('refText', lastTake.text)
      formData.append('audio', lastTake.audioBlob, 'narrator.wav')
      // Language tag from the preview source (Custom is untagged) plus
      // descriptive tags derived from the design attributes the user picked.
      const languageTags = lastTake.source !== 'custom' ? [lastTake.source] : []
      const designTags = getVoiceDesignTags(lastTake.attributes)
      const tags = Array.from(new Set([...languageTags, ...designTags]))

      tags.forEach(tag => formData.append('tags', tag))

      const response = await fetch('/api/voices/design/save', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json().catch(() => null)
      const errorMessage = typeof data?.error === 'string' ? data.error : 'Save failed.'

      if (!response.ok) {
        setSaveError(errorMessage)
        return
      }

      const savedName = typeof data?.name === 'string' ? data.name : null

      if (!savedName) {
        setSaveError('Save succeeded but the response was malformed. Please try again.')
        return
      }

      onVoicesChanged()
      onSampleStarted(savedName)
      toast('Voice designed', { description: 'Sample is generating in the background.' })
      handleClose()
    } catch {
      setSaveError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  })

  if (!open) {
    return (
      <Button
        variant="outline"
        fullWidth
        size="large"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        <Sparkles />
        Design with AI
      </Button>
    )
  }

  const customCharCount = customText.length
  const customOverLimit = customCharCount > MAX_CUSTOM_CHARS

  return (
    <div className="bg-surface-inset inset-shadow-surface space-y-3 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Design a voice</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            abortControllerRef.current?.abort()
            handleClose()
          }}
          aria-label="Close"
        >
          <X />
        </Button>
      </div>

      {/* Name field with reroll */}
      <div className="space-y-1">
        <label htmlFor={nameFieldId} className="text-muted-foreground text-xs font-medium">
          Name
        </label>
        <div className="flex gap-2">
          <Input
            id={nameFieldId}
            {...register('name', { required: 'Name is required' })}
            placeholder="e.g. velvet-otter"
            aria-invalid={errors.name ? true : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <Tooltip label="Suggest another name">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRerollName}
              aria-label="Suggest another name"
              disabled={saving}
            >
              <RefreshCw />
            </Button>
          </Tooltip>
        </div>
      </div>

      <DesignPresets attributes={attributes} onSelect={setAttributes} />

      {/* Attribute dropdowns — Style is handled separately as a Switch below */}
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">Characteristics</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          {ATTRIBUTE_ORDER.filter(key => key !== 'style').map(key => (
            <div key={key} className="space-y-1">
              <label className="text-muted-foreground text-xs">{ATTRIBUTE_LABELS[key]}</label>
              <Select
                value={attributes[key]}
                onChange={value => handleAttributeChange(key, value)}
                options={[...ATTRIBUTE_OPTIONS[key]]}
                aria-label={ATTRIBUTE_LABELS[key]}
              />
            </div>
          ))}
        </div>

        {/* Whisper modifier — only Style attribute the model supports */}
        <label className="mt-2 flex cursor-pointer items-center gap-3 py-1">
          <Switch.Root
            checked={attributes.style === 'whisper'}
            onCheckedChange={checked => handleAttributeChange('style', checked ? 'whisper' : '')}
            aria-label="Whisper"
          >
            <Switch.Thumb />
          </Switch.Root>
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-medium">Whisper</span>
            <span className="text-muted-foreground text-xs">Hushed, breathy delivery</span>
          </span>
        </label>

        {instruct && (
          <p
            className="text-muted-foreground mt-1 font-mono text-xs"
            aria-label="Description sent to the model"
          >
            {instruct}
          </p>
        )}
      </div>

      {/* Generation knobs — variation (class_temperature) + reproducibility seed */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Variation</span>
              <Tooltip label={VARIATION_TOOLTIP} maxWidth={300}>
                <HelpCircle className="text-muted-foreground h-3.5 w-3.5" />
              </Tooltip>
            </span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {variation.toFixed(2)}
            </span>
          </div>
          <Slider
            value={variation}
            onChange={setVariation}
            min={VARIATION_MIN}
            max={VARIATION_MAX}
            step={VARIATION_STEP}
            aria-label="Variation"
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs" htmlFor="voice-design-seed">
            <span className="text-muted-foreground">Seed</span>
            <Tooltip label={SEED_TOOLTIP} maxWidth={300}>
              <HelpCircle className="text-muted-foreground h-3.5 w-3.5" />
            </Tooltip>
          </label>
          <div className="flex gap-2">
            <Input
              id="voice-design-seed"
              type="number"
              inputMode="numeric"
              min={0}
              max={SEED_MAX}
              step={1}
              value={seedText}
              onChange={e => setSeedText(e.target.value)}
              placeholder="Random"
              autoComplete="off"
            />
            <Tooltip label="Roll a new random seed">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSeedText(String(generateRandomSeed()))}
                aria-label="Roll a new random seed"
                disabled={generating}
              >
                <Dices />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Preview text source */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Tabs
            value={previewSource}
            onValueChange={value => {
              if (isPreviewSource(value)) setPreviewSource(value)
            }}
            aria-label="Preview text source"
          >
            <TabsList>
              {SOURCE_OPTIONS.map(option => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {previewSource === 'custom' && (
            <span
              className={`text-xs ${customOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}
              aria-live="polite"
            >
              {customCharCount}/{MAX_CUSTOM_CHARS}
            </span>
          )}
        </div>

        {previewSource !== 'custom' && (
          <p className="text-muted-foreground bg-surface-inset inset-shadow-surface rounded-md p-3 text-sm leading-relaxed">
            {VOICE_PRESET_TEXTS[previewSource]}
          </p>
        )}

        {previewSource === 'custom' && (
          <Textarea
            value={customText}
            onChange={e => setCustomText(e.target.value.slice(0, MAX_CUSTOM_CHARS))}
            placeholder="Type any text to preview the voice"
            rows={3}
            aria-label="Custom preview text"
          />
        )}
      </div>

      {/* Audio player slot — three states: idle / generating / ready.
          Audio element stays mounted so the ref is available on first generate. */}
      <div className="min-h-12">
        <audio
          ref={audioRef}
          controls
          className={cn('w-full', (!hasGenerated || generating) && 'hidden')}
          aria-label="Voice preview"
        />
        {generating && (
          <div
            className="border-border flex h-12 items-center justify-center rounded-md border"
            role="status"
            aria-label={generatingLabel}
          >
            <AudioLines className="text-muted-foreground h-5 w-5 animate-pulse" />
          </div>
        )}
        {!generating && !hasGenerated && (
          <div className="border-border/60 flex h-12 items-center justify-center rounded-md border border-dashed">
            <AudioLines className="text-muted-foreground h-4 w-4" />
          </div>
        )}
      </div>

      {/* Errors */}
      {generateError && (
        <p className="text-destructive text-sm" role="alert">
          {generateError}
        </p>
      )}
      {saveError && (
        <p className="text-destructive text-sm" role="alert">
          {saveError}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {generating ? (
          <Button variant="outline" size="default" onClick={handleStopGeneration}>
            <Square />
            Stop
          </Button>
        ) : (
          <Tooltip
            label="Generate audio with the current voice. Roll a new seed to try a different voice."
            maxWidth={300}
          >
            <Button variant="outline" size="default" onClick={handleGenerate}>
              <Play />
              Generate
            </Button>
          </Tooltip>
        )}
        <Tooltip
          label={
            canSave
              ? 'Save the most recent preview as a voice'
              : 'Generate at least one preview first'
          }
          maxWidth={300}
        >
          <Button
            variant="primary"
            size="default"
            onClick={onSave}
            disabled={!canSave}
            loading={saving}
          >
            Save voice
          </Button>
        </Tooltip>
        <Button
          variant="ghost"
          size="default"
          onClick={() => {
            abortControllerRef.current?.abort()
            handleClose()
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
