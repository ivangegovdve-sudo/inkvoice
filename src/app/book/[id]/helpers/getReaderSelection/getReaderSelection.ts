import type { ReadingSelection } from '@/lib/services/readingContext/readingContext.types'

interface Options {
  selection: Selection | null
  chapter: number
}

const READER_PARAGRAPH_SELECTOR = '[data-reading-paragraph]'

const getElement = (node: Node): Element | null =>
  node instanceof Element ? node : node.parentElement

const getParagraphElement = (node: Node): HTMLElement | null =>
  getElement(node)?.closest<HTMLElement>(READER_PARAGRAPH_SELECTOR) ?? null

const getIntersectingParagraphs = (range: Range): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(READER_PARAGRAPH_SELECTOR)).filter(element =>
    range.intersectsNode(element),
  )

const getOffset = (
  paragraphElement: HTMLElement,
  boundaryNode: Node,
  boundaryOffset: number,
  fallback: 'start' | 'end',
): number => {
  if (!paragraphElement.contains(boundaryNode)) {
    return fallback === 'start' ? 0 : (paragraphElement.textContent?.length ?? 0)
  }

  const range = document.createRange()

  range.selectNodeContents(paragraphElement)
  range.setEnd(boundaryNode, boundaryOffset)
  return range.toString().length
}

const getParagraphIndex = (element: HTMLElement): number | null => {
  const index = Number(element.dataset.readingParagraph)

  return Number.isInteger(index) && index >= 0 ? index : null
}

export const getReaderSelection = ({ selection, chapter }: Options): ReadingSelection | null => {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const intersectingParagraphs = getIntersectingParagraphs(range)
  const startElement =
    getParagraphElement(range.startContainer) ?? intersectingParagraphs.at(0) ?? null
  const endElement =
    getParagraphElement(range.endContainer) ?? intersectingParagraphs.at(-1) ?? null
  const text = selection.toString()

  if (!startElement || !endElement || !text.trim()) return null

  const startParagraph = getParagraphIndex(startElement)
  const endParagraph = getParagraphIndex(endElement)

  if (startParagraph === null || endParagraph === null) return null

  return {
    text,
    start: {
      chapter,
      paragraph: startParagraph,
      offset: getOffset(startElement, range.startContainer, range.startOffset, 'start'),
    },
    end: {
      chapter,
      paragraph: endParagraph,
      offset: getOffset(endElement, range.endContainer, range.endOffset, 'end'),
    },
  }
}
