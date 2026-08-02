export const ESTIMATED_WORDS_PER_PAGE = 350

type PageCountRounding = 'complete' | 'including-partial'

interface EstimatePageCountParams {
  wordCount: number
  rounding: PageCountRounding
}

export const estimatePageCount = ({ wordCount, rounding }: EstimatePageCountParams): number => {
  const safeWordCount = Math.max(0, wordCount)
  const exactPages = safeWordCount / ESTIMATED_WORDS_PER_PAGE

  return rounding === 'complete' ? Math.floor(exactPages) : Math.ceil(exactPages)
}
