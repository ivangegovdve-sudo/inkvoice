import { type NextRequest, NextResponse } from 'next/server'
import { isSpeakableText } from '@/lib/helpers/isSpeakableText/isSpeakableText'
import { getBookService } from '@/lib/services/book/book.service'
import { getCacheService } from '@/lib/services/cache/cache.service'
import { textNormalizationService } from '@/lib/services/textNormalization/textNormalization.service'
import { resolveValidVoice } from '@/lib/services/voice/helpers/resolveValidVoice/resolveValidVoice'
import { DEFAULT_VOICE } from '@/lib/services/voice/voice.consts'
import { voiceService } from '@/lib/services/voice/voice.service'

interface RouteParams {
  params: Promise<{ bookId: string; chapter: string }>
}

export const GET = async (request: NextRequest, { params }: RouteParams) => {
  const { bookId, chapter } = await params
  const chapterIndex = parseInt(chapter, 10)

  if (isNaN(chapterIndex)) {
    return NextResponse.json({ error: 'Invalid chapter index' }, { status: 400 })
  }

  const requestedVoice = request.nextUrl.searchParams.get('voice') || DEFAULT_VOICE
  const { voice } = await resolveValidVoice(
    requestedVoice,
    voiceService.resolveVoicePath,
    voiceService.listVoices,
  )

  try {
    const parsedChapter = await getBookService().getChapter(bookId, chapterIndex)

    if (!parsedChapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }

    const synthesisTexts = await textNormalizationService.resolveTexts(parsedChapter.paragraphs)
    const cached = await getCacheService().hasMany(synthesisTexts, voice)
    // Unspeakable paragraphs never get audio and never need it — reporting
    // them as missing would disable play with nothing to generate.
    const missingParagraphs = cached.flatMap((isCached, index) =>
      isCached || !isSpeakableText(parsedChapter.paragraphs[index] ?? '') ? [] : [index],
    )

    return NextResponse.json({ missingParagraphs }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Failed to check audio availability:', error)
    return NextResponse.json({ error: 'Failed to check audio availability' }, { status: 500 })
  }
}
