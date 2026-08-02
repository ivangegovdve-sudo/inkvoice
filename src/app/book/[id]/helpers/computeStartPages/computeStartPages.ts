import { ESTIMATED_WORDS_PER_PAGE } from '@/lib/services/book/helpers/estimatePageCount/estimatePageCount'

export const computeStartPages = (wordsPerChapter: number[]): number[] => {
  const acc = { words: 0 }

  return wordsPerChapter.map(words => {
    const startPage = Math.floor(acc.words / ESTIMATED_WORDS_PER_PAGE) + 1

    acc.words += words
    return startPage
  })
}
