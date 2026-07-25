'use client'

import { cn } from '@carbonid1/design-system'
import { Loader2, X } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef } from 'react'
import type { SearchScope } from '@/app/book/[id]/hooks/useBookSearch/useBookSearch.types'
import { SearchInput } from '@/components/ui/SearchInput/SearchInput'
import { useDebouncedLoading } from '@/lib/hooks/useDebouncedLoading/useDebouncedLoading'
import type { SearchPaletteProps } from './SearchPalette.types'
import { SearchResultsPanel } from './components/SearchResultsPanel/SearchResultsPanel'

const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: 'book', label: 'Book' },
  { value: 'chapter', label: 'Chapter' },
]

export const SearchPalette = ({
  query,
  results,
  highlightedIndex,
  loading,
  truncated,
  scope,
  onQueryChange,
  onScopeChange,
  onHighlightNext,
  onHighlightPrevious,
  onHighlight,
  onSelect,
  onClose,
}: SearchPaletteProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      onHighlightNext()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      onHighlightPrevious()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const match = results[highlightedIndex]

      if (match) {
        onSelect(match.chapter, match.paragraph)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const handleSelectResult = (resultIndex: number) => {
    const match = results[resultIndex]

    if (match) {
      onSelect(match.chapter, match.paragraph)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (panelRef.current && e.target instanceof Node && !panelRef.current.contains(e.target)) {
      onClose()
    }
  }

  const showSpinner = useDebouncedLoading(loading)
  const showMatchCount = query.length >= 2 && !loading
  const showNoResults = showMatchCount && results.length === 0
  const hasResults = results.length > 0 && query.length >= 2
  const placeholder = scope === 'book' ? 'Search in book...' : 'Search in chapter...'

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={handleBackdropClick}>
      <div
        ref={panelRef}
        className="animate-in fade-in-0 slide-in-from-top-2 bg-popover shadow-popover mx-auto mt-[15vh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-xl duration-150"
      >
        <SearchInput
          ref={inputRef}
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          className="has-[[data-slot=input-group-control]:focus-visible]:border-border rounded-none border-x-0 border-t-0 px-4 py-3 has-[[data-slot=input-group-control]:focus-visible]:ring-0"
          trailing={
            <>
              <div className="bg-muted flex shrink-0 rounded-md p-0.5">
                {SCOPE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    className={cn(
                      'rounded px-2 py-0.5 text-xs transition-colors',
                      scope === option.value
                        ? 'bg-accent text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => onScopeChange(option.value)}
                    aria-pressed={scope === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="flex min-w-18 shrink-0 items-center justify-end">
                {showSpinner && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
                {showMatchCount && results.length > 0 && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {results.length} {results.length === 1 ? 'result' : 'results'}
                  </span>
                )}
              </span>
              <button
                onClick={onClose}
                className="hover:bg-accent shrink-0 rounded-sm p-1 transition-colors"
                aria-label="Close search"
              >
                <X className="size-4" />
              </button>
            </>
          }
        />
        {showNoResults && (
          <div className="px-4 py-6 text-center">
            <p className="text-muted-foreground text-sm">
              {scope === 'chapter' ? 'No results in this chapter' : 'No results'}
            </p>
            {scope === 'chapter' && (
              <button
                className="text-primary hover:text-primary/80 mt-1 text-xs transition-colors"
                onClick={() => onScopeChange('book')}
              >
                Search entire book
              </button>
            )}
          </div>
        )}
        {hasResults && (
          <SearchResultsPanel
            results={results}
            query={query}
            highlightedIndex={highlightedIndex}
            truncated={truncated}
            scope={scope}
            onSelect={handleSelectResult}
            onHighlight={onHighlight}
          />
        )}
      </div>
    </div>
  )
}
