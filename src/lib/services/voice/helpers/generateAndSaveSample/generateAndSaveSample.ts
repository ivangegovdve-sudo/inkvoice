import { getTTSService } from '@/lib/services/tts/tts.server'
import { voiceSampleEvents } from '@/lib/services/voiceSampleEvents/voiceSampleEvents.service'
import { voiceService } from '../../voice.service'

export const generateAndSaveSample = async (voiceName: string, text: string): Promise<void> => {
  const result = await getTTSService().generate(text, voiceName, {
    includeAlignment: false,
  })

  await voiceService.saveSample(voiceName, result.audio)
  voiceSampleEvents.publish(voiceName, 'ready')
  console.warn(`Generated sample for voice "${voiceName}"`)
}
