import { getBookService } from '@/lib/services/book/book.service'
import type { ParsedChapter } from '@/lib/types/book'
import { readingContextLiveService } from '../readingContextLive/readingContextLive.service'
import type {
  LiveReadingContext,
  ReadingContextSnapshot,
  ReadingInstance,
  ReadingParagraph,
  ReadingRange,
  ReadingRangeRequest,
  ReadingSelection,
} from './readingContext.types'

interface Dependencies {
  getLiveContext: () => LiveReadingContext | null
  getChapter: (bookId: string, chapter: number) => Promise<ParsedChapter | null>
  getInstance: () => ReadingInstance
}

const getInstance = (): ReadingInstance => ({
  kind: process.env.INKVOICE_RUNTIME === 'packaged' ? 'packaged' : 'development',
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
})

const getSelectionParagraphs = (
  chapter: ParsedChapter,
  selection: ReadingSelection,
): ReadingParagraph[] => {
  if (selection.start.chapter !== selection.end.chapter) return []

  return chapter.paragraphs
    .slice(selection.start.paragraph, selection.end.paragraph + 1)
    .map((text, offset) => {
      const index = selection.start.paragraph + offset

      return {
        index,
        text: index === selection.end.paragraph ? text.slice(0, selection.end.offset) : text,
      }
    })
}

export const createReadingContextService = (dependencies: Dependencies) => {
  const getSnapshot = async (): Promise<ReadingContextSnapshot> => {
    const instance = dependencies.getInstance()
    const context = dependencies.getLiveContext()

    if (!context) {
      return { schemaVersion: 1, instance, book: null, pointer: null, selection: null }
    }

    const chapter = await dependencies.getChapter(context.book.id, context.pointer.chapter)
    const paragraphText = chapter?.paragraphs[context.pointer.paragraph]

    if (!chapter || paragraphText === undefined) {
      return { schemaVersion: 1, instance, book: context.book, pointer: null, selection: null }
    }

    return {
      schemaVersion: 1,
      instance,
      book: context.book,
      pointer: {
        chapter: { index: context.pointer.chapter, title: chapter.title },
        paragraph: { index: context.pointer.paragraph, text: paragraphText },
        playing: context.pointer.playing,
      },
      selection: context.selection
        ? {
            ...context.selection,
            paragraphs: getSelectionParagraphs(chapter, context.selection),
          }
        : null,
    }
  }

  const readRange = async (request: ReadingRangeRequest): Promise<ReadingRange> => {
    const context = dependencies.getLiveContext()

    if (!context) throw new Error('No book is open in InkVoice')

    const ceiling = {
      chapter: context.pointer.chapter,
      paragraph: context.pointer.paragraph,
    }
    const afterCeiling = request.chapter > ceiling.chapter
    const allowedEnd =
      request.chapter === ceiling.chapter
        ? Math.min(request.endParagraph, ceiling.paragraph)
        : request.endParagraph
    const capped = afterCeiling || allowedEnd < request.endParagraph

    if (afterCeiling || request.startParagraph > allowedEnd) {
      return {
        schemaVersion: 1,
        instance: dependencies.getInstance(),
        book: context.book,
        ceiling,
        requested: request,
        returned: {
          chapter: request.chapter,
          title: null,
          startParagraph: null,
          endParagraph: null,
          paragraphs: [],
        },
        capped,
      }
    }

    const chapter = await dependencies.getChapter(context.book.id, request.chapter)

    if (!chapter) throw new Error('Requested chapter is unavailable')

    const paragraphs = chapter.paragraphs
      .slice(request.startParagraph, allowedEnd + 1)
      .map((text, offset) => ({ index: request.startParagraph + offset, text }))

    return {
      schemaVersion: 1,
      instance: dependencies.getInstance(),
      book: context.book,
      ceiling,
      requested: request,
      returned: {
        chapter: request.chapter,
        title: chapter.title,
        startParagraph: paragraphs[0]?.index ?? null,
        endParagraph: paragraphs.at(-1)?.index ?? null,
        paragraphs,
      },
      capped,
    }
  }

  return { getSnapshot, readRange }
}

export const readingContextService = createReadingContextService({
  getLiveContext: readingContextLiveService.get,
  getChapter: (bookId, chapter) => getBookService().getChapter(bookId, chapter),
  getInstance,
})
