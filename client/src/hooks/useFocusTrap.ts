import { useEffect, useRef, type RefObject } from 'react'

/**
 * Traps keyboard focus inside the referenced dialog element and restores
 * focus to the previously focused element when the component unmounts.
 *
 * Usage:
 *   const dialogRef = useFocusTrap<HTMLDivElement>()
 *   return <div ref={dialogRef} role="dialog">…</div>
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(): RefObject<T> {
  const dialogRef = useRef<T>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    // Remember which element had focus before the dialog opened so we can
    // restore it when the dialog closes.
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move initial focus into the dialog: prefer the first focusable element,
    // fall back to the dialog itself.
    const focusable = getFocusableElements(dialog)
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      dialog.focus()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return

      const focusableNow = getFocusableElements(dialog)
      if (focusableNow.length === 0) return

      const first = focusableNow[0]
      const last = focusableNow[focusableNow.length - 1]

      // Shift+Tab: wrap from first to last
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault()
          last.focus()
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)

    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the element that was focused before the dialog opened.
      previouslyFocused?.focus()
    }
  }, [])

  return dialogRef
}

/** Returns all focusable elements within a container. */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}
