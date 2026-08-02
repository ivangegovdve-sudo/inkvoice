import {
  ESTIMATED_WORDS_PER_PAGE,
  estimatePageCount,
} from '@/lib/services/book/helpers/estimatePageCount/estimatePageCount'
import { type PregenJob, PREGEN_JOB_STATUS } from '@/lib/services/pregenQueue/pregenQueue.types'

type ReadyPagesJob = Pick<
  PregenJob,
  | 'status'
  | 'generationStartChapter'
  | 'generationStartParagraph'
  | 'generationSegmentNumber'
  | 'readyWordsInSegment'
>

interface ReadyPagesDisplay {
  visualLabel: string
  accessibleLabel: string
  wholeBook: boolean
}

export const getReadyPagesDisplay = (job: ReadyPagesJob): ReadyPagesDisplay | null => {
  if (
    job.readyWordsInSegment === null ||
    job.generationStartChapter === null ||
    job.generationStartParagraph === null ||
    job.generationSegmentNumber === null
  ) {
    return null
  }

  const wholeBook =
    job.generationSegmentNumber === 0 &&
    job.generationStartChapter === 0 &&
    job.generationStartParagraph === 0
  const fromHere = !wholeBook
  const qualifier = fromHere ? ' from here' : ''
  const estimateDescription = `estimated at ${ESTIMATED_WORDS_PER_PAGE} words per page`

  if (job.readyWordsInSegment === 0) {
    const visualLabel = fromHere ? 'No pages ready from here yet' : 'No pages ready yet'

    return { visualLabel, accessibleLabel: visualLabel, wholeBook }
  }

  const pageCount = estimatePageCount({
    wordCount: job.readyWordsInSegment,
    rounding: job.status === PREGEN_JOB_STATUS.COMPLETED ? 'including-partial' : 'complete',
  })

  if (pageCount === 0) {
    const visualLabel = `Less than 1 page ready${qualifier}`

    return {
      visualLabel,
      accessibleLabel: `Less than one page ready${qualifier}, ${estimateDescription}`,
      wholeBook,
    }
  }

  const pageNoun = pageCount === 1 ? 'page' : 'pages'

  return {
    visualLabel: `~${pageCount} ${pageNoun} ready${qualifier}`,
    accessibleLabel: `About ${pageCount} ${pageNoun} ready${qualifier}, ${estimateDescription}`,
    wholeBook,
  }
}
