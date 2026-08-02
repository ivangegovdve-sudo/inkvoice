import { ESTIMATED_WORDS_PER_PAGE } from '@/lib/services/book/helpers/estimatePageCount/estimatePageCount'

interface PagePositionInput {
  chapter: number
  paragraph: number
  wordsPerChapter: number[]
  paragraphsPerChapter: number[]
}

interface PagePosition {
  currentPage: number
  totalPages: number
}

export const computePagePosition = (input: PagePositionInput): PagePosition | null => {
  const { chapter, paragraph, wordsPerChapter, paragraphsPerChapter } = input

  if (wordsPerChapter.length === 0 || paragraphsPerChapter.length === 0) return null

  const totalWords = wordsPerChapter.reduce((a, b) => a + b, 0)

  if (totalWords === 0) return null

  const totalPages = Math.ceil(totalWords / ESTIMATED_WORDS_PER_PAGE)

  const wordsInPriorChapters = wordsPerChapter.slice(0, chapter).reduce((a, b) => a + b, 0)
  const currentChapterParagraphs = paragraphsPerChapter[chapter] ?? 0
  const paragraphFraction = currentChapterParagraphs > 0 ? paragraph / currentChapterParagraphs : 0
  const currentChapterWords = wordsPerChapter[chapter] ?? 0
  const wordsRead = wordsInPriorChapters + paragraphFraction * currentChapterWords

  const currentPage = Math.min(Math.floor(wordsRead / ESTIMATED_WORDS_PER_PAGE) + 1, totalPages)

  return { currentPage, totalPages }
}
