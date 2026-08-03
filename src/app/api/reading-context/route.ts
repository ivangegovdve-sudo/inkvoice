import { type NextRequest, NextResponse } from 'next/server'
import { liveReadingContextSchema } from '@/lib/services/readingContext/readingContext.types'
import { readingContextLiveService } from '@/lib/services/readingContextLive/readingContextLive.service'

export const PUT = async (request: NextRequest) => {
  const parsed = liveReadingContextSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  readingContextLiveService.set(parsed.data)
  return NextResponse.json({ success: true })
}

export const DELETE = (request: NextRequest) => {
  const sessionId = new URL(request.url).searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  readingContextLiveService.clear(sessionId)
  return NextResponse.json({ success: true })
}
