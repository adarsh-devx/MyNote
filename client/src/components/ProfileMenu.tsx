import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { LogOut, Settings, User, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from './Avatar'
import { ManageProfileModal } from './ManageProfileModal'
import type { User as UserType } from '../types/user'

interface ProfileMenuProps {
  user: UserType
  onLogout: () => void
  onUserUpdated: (user: UserType) => void
}

/** "Shivam Kumar" -> "SK"; falls back to "?" for empty names. */
function initialsOf(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return initials || '?'
}

type Placeholder = 'settings' | null

export function ProfileMenu({ user, onLogout, onUserUpdated }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const [placeholder, setPlaceholder] = useState<Placeholder>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const avatarButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const placeholderCloseRef = useRef<HTMLButtonElement>(null)

  // Close the menu when clicking outside of it.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  // Escape closes the menu and returns focus to the avatar button.
  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        avatarButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Focus the first menu item when the menu opens, so keyboard users can act
  // immediately (ArrowDown/ArrowUp cycle through the items).
  useEffect(() => {
    if (!open) return
    menuRef.current
      ?.querySelector<HTMLButtonElement>('.profile-menu-item')
      ?.focus()
  }, [open])

  // Escape closes the placeholder dialog and returns focus to its close button.
  useEffect(() => {
    if (!placeholder) return
    placeholderCloseRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPlaceholder(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [placeholder])

  // Escape closes the profile modal.
  useEffect(() => {
    if (!profileOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [profileOpen])

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '.profile-menu-item',
      ) ?? [],
    )
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === 'ArrowDown'
        ? (current + 1) % items.length
        : (current - 1 + items.length) % items.length
    items[next]?.focus()
  }

  function openProfile() {
    setOpen(false)
    setProfileOpen(true)
  }

  function openPlaceholder(kind: Exclude<Placeholder, null>) {
    setOpen(false)
    setPlaceholder(kind)
  }

  return (
    <div className="profile-menu-root" ref={rootRef}>
      <button
        ref={avatarButtonRef}
        className="profile-avatar-button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar size="md">
          {user.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt={user.name} />
          ) : (
            <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
          )}
        </Avatar>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            className="profile-dropdown"
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            onKeyDown={handleMenuKeyDown}
          >
            <div className="profile-dropdown-header">
              <Avatar size="sm">
                {user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt="" />
                ) : (
                  <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
                )}
              </Avatar>
              <span className="profile-dropdown-name">{user.name}</span>
            </div>

            <div className="profile-dropdown-divider" />

            <button
              className="profile-menu-item"
              role="menuitem"
              onClick={openProfile}
            >
              <User size={18} />
              Manage Profile
            </button>
            <button
              className="profile-menu-item"
              role="menuitem"
              onClick={() => openPlaceholder('settings')}
            >
              <Settings size={18} />
              Settings
            </button>

            <div className="profile-dropdown-divider" />

            <button
              className="profile-menu-item"
              role="menuitem"
              onClick={onLogout}
            >
              <LogOut size={18} />
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {placeholder && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPlaceholder(null)
            }}
          >
            <motion.div
              className="placeholder-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.15 }}
            >
              <div className="modal-header">
                <h2>Settings</h2>
                <button
                  ref={placeholderCloseRef}
                  className="icon-button"
                  onClick={() => setPlaceholder(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="placeholder-note">Coming soon.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {profileOpen && (
          <ManageProfileModal
            user={user}
            onSaved={onUserUpdated}
            onClose={() => setProfileOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}