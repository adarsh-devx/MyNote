import { useRef, useEffect, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const [expanded, setExpanded] = useState(false)
  const desktopInputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  // Listen for '/' key to focus search
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeTag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
        if (activeTag === 'input' || activeTag === 'textarea') return

        e.preventDefault()
        if (window.innerWidth <= 700) {
          setExpanded(true)
        } else {
          desktopInputRef.current?.focus()
          desktopInputRef.current?.select()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Auto-focus the input when the mobile overlay opens.
  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(() => mobileInputRef.current?.focus())
    }
  }, [expanded])

  // Escape collapses the mobile overlay or blurs desktop search.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (expanded) setExpanded(false)
        if (document.activeElement === desktopInputRef.current) {
          desktopInputRef.current?.blur()
        }
      }
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
          ref={desktopInputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search..."
          aria-label="Search notes"
        />
        <span className="search-shortcut-hint" title="Press / to search">/</span>
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
            ref={mobileInputRef}
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
