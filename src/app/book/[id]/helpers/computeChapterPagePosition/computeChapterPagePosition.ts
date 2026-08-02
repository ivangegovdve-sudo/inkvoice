import { ESTIMATED_WORDS_PER_PAGE } from '@/lib/services/book/helpers/estimatePageCount/estimatePageCount'

interface ChapterPagePositionInput {
  paragraph: number
  paragraphCount: number
  wordCount: number
}

interface ChapterPagePosition {
  currentPage: number
  totalPages: number
}

export const computeChapterPagePosition = ({
  paragraph,
  paragraphCount,
  wordCount,
}: ChapterPagePositionInput): ChapterPagePosition | null => {
  if (paragraphCount === 0 || wordCount === 0) return null

  const totalPages = Math.ceil(wordCount / ESTIMATED_WORDS_PER_PAGE)
  const paragraphFraction = paragraph / paragraphCount
  const wordsRead = paragraphFraction * wordCount
  const currentPage = Math.min(Math.floor(wordsRead / ESTIMATED_WORDS_PER_PAGE) + 1, totalPages)

  return { currentPage, totalPages }
}
