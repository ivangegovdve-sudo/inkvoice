'use client'

import { cn, InputGroup } from '@carbonid1/design-system'
import { Search } from 'lucide-react'
import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from 'react'

type SearchInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'className'> & {
  trailing?: ReactNode
  className?: string
  inputClassName?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ trailing, className, inputClassName, ...inputProps }, ref) => (
    <InputGroup.Root className={className}>
      <Search className="text-muted-foreground size-4 shrink-0" />
      <InputGroup.Control
        ref={ref}
        type="text"
        {...inputProps}
        className={cn('px-0', inputClassName)}
      />
      {trailing}
    </InputGroup.Root>
  ),
)
SearchInput.displayName = 'SearchInput'
