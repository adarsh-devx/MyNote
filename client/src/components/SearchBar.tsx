import { useRef, useEffect, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the input when the mobile overlay opens.
  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [expanded])

  // Escape collapses the mobile overlay.
  useEffect(() => {
    if (!expanded) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded])

  // Clicking outside the overlay collapses it.
  useEffect(() => {
    if (!expanded) return
    function handleMouseDown(e: MouseEvent) {
      if (!(e.target as Element | null)?.closest('.search-mobile-overlay')) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [expanded])

  return (
    <>
      {/* Desktop search — always visible on >700px, hidden on mobile via CSS */}
      <label className="search-box">
        <Search size={17} />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search..."
          aria-label="Search notes"
        />
      </label>

      {/* Mobile search trigger — visible on ≤700px only */}
      {!expanded && (
        <button
          className="search-mobile-trigger"
          onClick={() => setExpanded(true)}
          aria-label="Open search"
        >
          <Search size={17} />
        </button>
      )}

      {/* Mobile expanded search — overlay that covers the topbar */}
      {expanded && (
        <div className="search-mobile-overlay">
          <button
            className="search-mobile-back"
            onClick={() => setExpanded(false)}
            aria-label="Close search"
            type="button"
          >
            <ArrowLeft size={18} />
          </button>
          <input
            ref={inputRef}
            className="search-mobile-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Search notes..."
            aria-label="Search notes"
          />
          {value && (
            <button
              className="search-mobile-clear"
              onClick={() => onChange('')}
              aria-label="Clear search"
              type="button"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}
    </>
  )
}
