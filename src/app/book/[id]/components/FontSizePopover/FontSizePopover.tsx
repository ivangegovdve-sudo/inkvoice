'use client'

import { Tooltip, useHotkeys } from '@carbonid1/design-system'
import { ALargeSmall } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDisplayStore } from '@/store/useDisplayStore'
import { FONT_SIZE_OPTIONS } from './FontSizePopover.consts'

export const FontSizePopover = () => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fontSize = useDisplayStore(s => s.fontSize)
  const setFontSize = useDisplayStore(s => s.setFontSize)

  const toggle = useCallback(() => setOpen(prev => !prev), [])

  useHotkeys('f', toggle)

  // Close on click outside
  useEffect(() => {
    if (!open) return

    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        e.target instanceof Node &&
        !containerRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <Tooltip label="Font Size" shortcut="F" position="bottom" disabled={open}>
        <button
          onClick={toggle}
          className="bg-muted hover:bg-accent inline-flex items-center rounded-sm px-2 py-1.5 transition-colors"
          aria-label="Font Size"
        >
          <ALargeSmall className="size-4" />
        </button>
      </Tooltip>

      {open && (
        <div className="bg-popover shadow-popover absolute right-0 z-50 mt-1 flex gap-1 rounded-lg p-1">
          {FONT_SIZE_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => setFontSize(option.value)}
              aria-pressed={fontSize === option.value}
              className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                fontSize === option.value
                  ? 'bg-primary-muted text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
