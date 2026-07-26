import { parseTimestampsHeader } from '@/lib/helpers/parseTimestampsHeader/parseTimestampsHeader'
import { getPythonClient } from '@/lib/services/pythonClient/pythonClient'
import { type DesignOptions, type GenerateOptions, type TTSService, TTSError } from './tts.types'

const TTS_TIMEOUT_MS = 180_000
const TTS_COLD_TIMEOUT_MS = 300_000
const COLD_GENERATION_COUNT = 3

let lastInstanceId = -1
let generationCount = 0

class TTSServiceImpl implements TTSService {
  async generate(text: string, voice: string, options: GenerateOptions = {}) {
    const client = getPythonClient()
    const instanceId = client.getCurrentInstanceId()

    if (instanceId !== lastInstanceId) {
      lastInstanceId = instanceId
      generationCount = 0
    }
    const timeout = generationCount < COLD_GENERATION_COUNT ? TTS_COLD_TIMEOUT_MS : TTS_TIMEOUT_MS

    generationCount++

    const response = await client.fetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        include_alignment: options.includeAlignment ?? true,
      }),
      signal: AbortSignal.timeout(timeout),
    })

    if (!response.ok) {
      const errorText = await response.text()

      if (response.status === 400 && errorText.toLowerCase().includes('not found')) {
        throw new TTSError('VOICE_NOT_FOUND', errorText, 400)
      }
      throw new TTSError('TTS_FAILED', errorText, response.status)
    }

    const generationTimeMs = parseInt(response.headers.get('X-Generation-Time-Ms') ?? '0', 10) || 0
    const durationMs = parseInt(response.headers.get('X-Audio-Duration-Ms') ?? '0', 10) || 0
    const samplingRateRaw = response.headers.get('X-Sampling-Rate')
    const samplingRate = samplingRateRaw ? parseFloat(samplingRateRaw) : null
    const timestamps = parseTimestampsHeader(response)
    const audioBuffer = await response.arrayBuffer()

    return {
      audio: Buffer.from(audioBuffer),
      generationTimeMs,
      timestamps,
      durationMs,
      samplingRate,
    }
  }

  async design(text: string, instruct: string, options: DesignOptions = {}) {
    const client = getPythonClient()
    const instanceId = client.getCurrentInstanceId()

    if (instanceId !== lastInstanceId) {
      lastInstanceId = instanceId
      generationCount = 0
    }
    const timeout = generationCount < COLD_GENERATION_COUNT ? TTS_COLD_TIMEOUT_MS : TTS_TIMEOUT_MS

    generationCount++

    const { format = 'opus', classTemperature, seed } = options
    const response = await client.fetch('/tts/design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        instruct,
        format,
        class_temperature: classTemperature,
        seed,
      }),
      signal: AbortSignal.timeout(timeout),
    })

    if (!response.ok) {
      const errorText = await response.text()

      throw new TTSError('TTS_FAILED', errorText, response.status)
    }

    const generationTimeMs = parseInt(response.headers.get('X-Generation-Time-Ms') ?? '0', 10) || 0
    const durationMs = parseInt(response.headers.get('X-Audio-Duration-Ms') ?? '0', 10) || 0
    const audioBuffer = await response.arrayBuffer()

    return {
      audio: Buffer.from(audioBuffer),
      generationTimeMs,
      durationMs,
    }
  }
}

let _ttsService: TTSService | null = null

export const getTTSService = (): TTSService => {
  if (!_ttsService) {
    _ttsService = new TTSServiceImpl()
  }
  return _ttsService
}
