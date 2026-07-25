'use client'

import { Badge, Input } from '@carbonid1/design-system'
import { useState } from 'react'

interface VoiceTagEditorProps {
  tags: string[]
  onTagsChanged: (tags: string[]) => void
  saving: boolean
}

export const VoiceTagEditor = ({ tags, onTagsChanged, saving }: VoiceTagEditorProps) => {
  const [tagInput, setTagInput] = useState('')

  const handleRemove = (tag: string) => {
    onTagsChanged(tags.filter(t => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()

    const trimmed = tagInput.trim().toLowerCase()

    if (!trimmed) return

    if (!tags.includes(trimmed)) {
      onTagsChanged([...tags, trimmed])
    }
    setTagInput('')
  }

  return (
    <div className="space-y-3 px-3 pt-2 pb-2.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <Badge key={tag} variant="primary" onRemove={() => handleRemove(tag)}>
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <Input
        type="text"
        value={tagInput}
        onChange={e => setTagInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add tag..."
        aria-label="Add tag"
        disabled={saving}
        className="h-auto rounded-sm p-1.5 text-xs"
      />
    </div>
  )
}
