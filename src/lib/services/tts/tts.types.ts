import type { WordTimestamp } from '@/lib/types/wordTimestamp'

export interface DesignResult {
  audio: Buffer
  generationTimeMs: number
  durationMs: number
}

export type DesignFormat = 'opus' | 'wav'

export interface GenerateOptions {
  includeAlignment?: boolean
}

export interface DesignOptions {
  format?: DesignFormat
  classTemperature?: number
  seed?: number
}

export interface TTSService {
  generate(
    text: string,
    voice: string,
    options?: GenerateOptions,
  ): Promise<{
    audio: Buffer
    generationTimeMs: number
    timestamps: WordTimestamp[] | null
    durationMs: number
    samplingRate: number | null
  }>
  design(text: string, instruct: string, options?: DesignOptions): Promise<DesignResult>
}

export type TTSErrorCode = 'VOICE_NOT_FOUND' | 'TTS_FAILED'

export class TTSError extends Error {
  constructor(
    public readonly code: TTSErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'TTSError'
  }
}
