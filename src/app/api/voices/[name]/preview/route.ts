import { NextResponse } from 'next/server'
import { getTTSService } from '@/lib/services/tts/tts.server'
import { validateVoiceParam } from '../helpers/validateVoiceParam/validateVoiceParam'

export const POST = async (request: Request, { params }: { params: Promise<{ name: string }> }) => {
  const { name } = await params

  const invalid = validateVoiceParam(name)

  if (invalid) return invalid

  try {
    const { text } = await request.json()

    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const result = await getTTSService().generate(text.trim(), name, {
      includeAlignment: false,
    })

    return new NextResponse(new Uint8Array(result.audio), {
      headers: {
        'Content-Type': 'audio/ogg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error(`Preview generation failed for "${name}":`, error)
    return NextResponse.json({ error: 'Preview generation failed' }, { status: 500 })
  }
}
