'use client'

import { cn } from '@carbonid1/design-system'
import type { ComponentProps } from 'react'

export const Textarea = ({ className, ...props }: ComponentProps<'textarea'>) => (
  <textarea
    data-slot="textarea"
    className={cn(
      'border-input-border bg-surface-inset inset-shadow-surface text-foreground placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-lg border px-3 py-2 text-sm outline-hidden dark:inset-shadow-none',
      'enabled:hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
      'forced-colors:focus-visible:ring-0 forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 forced-colors:focus-visible:outline-[Highlight]',
      'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
      'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:ring-3',
      className,
    )}
    {...props}
  />
)
