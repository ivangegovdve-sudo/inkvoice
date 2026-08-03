import { z } from 'zod'

export const readingAnchorSchema = z.object({
  chapter: z.number().int().nonnegative(),
  paragraph: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
})

export const readingSelectionSchema = z
  .object({
    text: z.string().min(1),
    start: readingAnchorSchema,
    end: readingAnchorSchema,
  })
  .refine(
    selection =>
      selection.start.chapter < selection.end.chapter ||
      (selection.start.chapter === selection.end.chapter &&
        (selection.start.paragraph < selection.end.paragraph ||
          (selection.start.paragraph === selection.end.paragraph &&
            selection.start.offset <= selection.end.offset))),
    { message: 'Selection anchors must be in reading order' },
  )

export const liveReadingContextSchema = z.object({
  sessionId: z.string().min(1),
  book: z.object({
    id: z.string().min(1),
    title: z.string(),
    author: z.string(),
  }),
  pointer: z.object({
    chapter: z.number().int().nonnegative(),
    paragraph: z.number().int().nonnegative(),
    playing: z.boolean(),
  }),
  selection: readingSelectionSchema.nullable(),
})

export const readingRangeRequestSchema = z
  .object({
    chapter: z.number().int().nonnegative(),
    startParagraph: z.number().int().nonnegative(),
    endParagraph: z.number().int().nonnegative(),
  })
  .refine(request => request.startParagraph <= request.endParagraph, {
    message: 'startParagraph must not be after endParagraph',
  })

export type ReadingAnchor = z.infer<typeof readingAnchorSchema>
export type ReadingSelection = z.infer<typeof readingSelectionSchema>
export type LiveReadingContext = z.infer<typeof liveReadingContextSchema>
export type ReadingRangeRequest = z.infer<typeof readingRangeRequestSchema>

export interface ReadingInstance {
  kind: 'packaged' | 'development'
  version: string
}

export interface ReadingParagraph {
  index: number
  text: string
}

export interface ReadingContextSnapshot {
  schemaVersion: 1
  instance: ReadingInstance
  book: LiveReadingContext['book'] | null
  pointer: {
    chapter: { index: number; title: string }
    paragraph: ReadingParagraph
    playing: boolean
  } | null
  selection: (ReadingSelection & { paragraphs: ReadingParagraph[] }) | null
}

export interface ReadingRange {
  schemaVersion: 1
  instance: ReadingInstance
  book: LiveReadingContext['book']
  ceiling: { chapter: number; paragraph: number }
  requested: ReadingRangeRequest
  returned: {
    chapter: number
    title: string | null
    startParagraph: number | null
    endParagraph: number | null
    paragraphs: ReadingParagraph[]
  }
  capped: boolean
}
