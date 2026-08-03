import { beforeEach, describe, expect, it } from 'vitest'
import { getReaderSelection } from './getReaderSelection'

describe('getReaderSelection', () => {
  beforeEach(() => {
    document.body.innerHTML = [
      '<span data-reading-paragraph="3">Alpha bravo</span>',
      '<span data-reading-paragraph="4"><em>Charlie</em> delta</span>',
    ].join(' ')
    window.getSelection()?.removeAllRanges()
  })

  it('maps a cross-paragraph DOM selection to stable paragraph offsets', () => {
    const paragraphs = document.querySelectorAll<HTMLElement>('[data-reading-paragraph]')
    const firstText = paragraphs[0]?.firstChild
    const secondText = paragraphs[1]?.querySelector('em')?.firstChild

    expect(firstText).toBeDefined()
    expect(secondText).toBeDefined()

    const range = document.createRange()

    range.setStart(firstText!, 6)
    range.setEnd(secondText!, 4)
    window.getSelection()?.addRange(range)

    expect(getReaderSelection({ selection: window.getSelection(), chapter: 2 })).toEqual({
      text: 'bravo Char',
      start: { chapter: 2, paragraph: 3, offset: 6 },
      end: { chapter: 2, paragraph: 4, offset: 4 },
    })
  })

  it('clears the live selection for a collapsed caret', () => {
    const firstText = document.querySelector<HTMLElement>('[data-reading-paragraph]')?.firstChild
    const range = document.createRange()

    range.setStart(firstText!, 2)
    range.collapse(true)
    window.getSelection()?.addRange(range)

    expect(getReaderSelection({ selection: window.getSelection(), chapter: 2 })).toBeNull()
  })
})
