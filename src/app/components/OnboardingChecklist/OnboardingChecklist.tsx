'use client'

import { Badge, Button, cardVariants, Tooltip } from '@carbonid1/design-system'
import { X } from 'lucide-react'
import { useId } from 'react'
import { buildPregenOnboardingHref } from '@/lib/consts/onboarding/onboarding.consts'
import { getMostRecentBookId } from '@/lib/helpers/getMostRecentBookId/getMostRecentBookId'
import { useOnboardingDerivation } from '@/lib/hooks/useOnboardingDerivation/useOnboardingDerivation'
import { useLibraryStore } from '@/store/useLibraryStore'
import { type OnboardingStepId, useOnboardingStore } from '@/store/useOnboardingStore'
import { useProgressStore } from '@/store/useProgressStore'
import { STEP_DEFINITIONS } from './OnboardingChecklist.consts'
import { ChecklistStep, type ChecklistStepAction } from './components/ChecklistStep/ChecklistStep'

export const OnboardingChecklist = () => {
  const headingId = useId()
  const { done, total, visible } = useOnboardingDerivation()
  const setDismissed = useOnboardingStore(s => s.setDismissed)

  const books = useLibraryStore(s => s.books)
  const progress = useProgressStore(s => s.progress)

  if (!visible) return null

  const mostRecentBookId = getMostRecentBookId(books, progress)

  const actionFor = (id: OnboardingStepId): ChecklistStepAction | undefined => {
    if (id === 'voice') return { label: 'Choose voice', href: '/settings#voices' }
    if (id === 'pregen' && mostRecentBookId) {
      return { label: 'Open a book', href: buildPregenOnboardingHref(mostRecentBookId) }
    }
    return undefined
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cardVariants({ className: 'mb-6 p-5 motion-safe:transition-opacity' })}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 id={headingId} className="text-base font-semibold">
            Get started
          </h2>
          <Badge>
            {done.size} of {total}
          </Badge>
        </div>
        <Tooltip label="Won't show again" position="bottom">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss getting started permanently"
            onClick={() => setDismissed(true)}
          >
            <X />
          </Button>
        </Tooltip>
      </div>

      <div className="space-y-1">
        {STEP_DEFINITIONS.map(step => (
          <ChecklistStep
            key={step.id}
            status={done.has(step.id) ? 'done' : 'pending'}
            title={step.title}
            description={step.description}
            action={actionFor(step.id)}
          />
        ))}
      </div>
    </section>
  )
}
