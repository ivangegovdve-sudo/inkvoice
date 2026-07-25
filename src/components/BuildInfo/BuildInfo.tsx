'use client'

import { useHotkeys } from '@carbonid1/design-system'
import { useCallback, useState } from 'react'

export const BuildInfo = () => {
  const [visible, setVisible] = useState(false)
  const toggle = useCallback(() => setVisible(prev => !prev), [])

  useHotkeys('shift+v', toggle)

  if (!visible) return null

  const commit = process.env.NEXT_PUBLIC_GIT_COMMIT
  const message = process.env.NEXT_PUBLIC_GIT_MESSAGE

  return (
    <div className="bg-popover/90 shadow-popover fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md px-3 py-1.5 backdrop-blur-sm">
      <code className="text-primary text-xs font-medium">{commit}</code>
      {message && (
        <span className="text-muted-foreground max-w-64 truncate text-xs" title={message}>
          {message}
        </span>
      )}
    </div>
  )
}
