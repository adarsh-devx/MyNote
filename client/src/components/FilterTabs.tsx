import type { ItemFilter } from '../types/note'

interface FilterTabsProps {
  value: ItemFilter
  onChange: (filter: ItemFilter) => void
}

const filters: Array<[ItemFilter, string]> = [
  ['all', 'All'],
  ['pinned', '📌 Pinned'],
  ['tasks', 'Tasks'],
  ['notes', 'Notes'],
  ['completed', '✓ Completed'],
]

export function FilterTabs({ value, onChange }: FilterTabsProps) {
  return (
    <nav className="filters" aria-label="Filters">
      {filters.map(([filter, label]) => (
        <button
          key={filter}
          className={value === filter ? 'filter active' : 'filter'}
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
