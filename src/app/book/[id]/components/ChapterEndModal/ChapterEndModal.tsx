'use client'

import { Button, useHotkeys } from '@carbonid1/design-system'

interface ChapterEndModalProps {
  isOpen: boolean
  completedChapterTitle: string
  nextChapterTitle: string
  nextChapterPageCount: number | null
  onContinue: () => void
  onDismiss: () => void
}

export const ChapterEndModal = ({
  isOpen,
  completedChapterTitle,
  nextChapterTitle,
  nextChapterPageCount,
  onContinue,
  onDismiss,
}: ChapterEndModalProps) => {
  useHotkeys('escape', onDismiss, { enabled: isOpen })

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="chapter-end-backdrop"
        className="fixed inset-0 z-30 bg-black/20 transition-opacity duration-200 ease-out"
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-labelledby="chapter-end-title"
        className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
      >
        <div className="bg-popover shadow-popover pointer-events-auto mx-4 w-full max-w-sm rounded-xl p-8 text-center motion-safe:animate-[fade-scale-in_200ms_ease-out]">
          {/* Section break ornament */}
          <div className="text-muted-foreground mb-6 text-lg tracking-[0.5em]">* * *</div>

          {/* Completed chapter */}
          <h2 id="chapter-end-title" className="text-foreground font-medium">
            {completedChapterTitle}
          </h2>

          {/* Divider */}
          <div className="border-border my-5 border-t" />

          {/* Next chapter */}
          <p className="text-muted-foreground mb-1 text-sm">Up next</p>
          <p className="text-foreground font-medium">{nextChapterTitle}</p>
          {nextChapterPageCount !== null && (
            <p className="text-muted-foreground mt-1 text-sm">~{nextChapterPageCount} pages</p>
          )}

          {/* Continue button */}
          <Button
            variant="primary"
            size="large"
            fullWidth
            onClick={onContinue}
            autoFocus
            className="mt-6"
          >
            Continue to Next Chapter
          </Button>
        </div>
      </div>
    </>
  )
}
