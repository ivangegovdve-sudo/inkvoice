'use client'

import {
  type SelectOption,
  type SelectOptionState,
  cardVariants,
  Kbd,
  Select,
  useTheme,
} from '@carbonid1/design-system'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useMounted } from '@/lib/hooks/useMounted/useMounted'

type ThemeOption = SelectOption & { icon: typeof Sun }

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const renderThemeOption = (option: SelectOption, state: SelectOptionState) => {
  const match = THEME_OPTIONS.find(t => t.value === option.value)

  if (!match) return null
  const Icon = match.icon

  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4" />
      <span className={state.selected ? 'font-medium' : ''}>{option.label}</span>
    </span>
  )
}

export const AppearanceCard = () => {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  return (
    <section className={cardVariants({ className: 'p-5' })}>
      <h2 className="mb-3 text-base font-semibold">Appearance</h2>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          Theme
          <Kbd keys={['shift', 'T']} size="sm" />
        </span>
        {mounted ? (
          <Select
            value={theme ?? 'system'}
            onChange={setTheme}
            options={THEME_OPTIONS}
            renderOption={renderThemeOption}
            className="bg-surface-inset inset-shadow-surface rounded-sm px-3 py-1.5 text-sm"
            aria-label="Theme"
          />
        ) : (
          <div className="bg-surface-inset inset-shadow-surface flex items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-sm">
            <span className="bg-muted-foreground/20 h-4 w-12 rounded-sm" />
            <span className="size-4 shrink-0" />
          </div>
        )}
      </div>
    </section>
  )
}
