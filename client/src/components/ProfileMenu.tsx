import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { LogOut, Settings, Trash2, User } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from './Avatar'
import { ManageProfileModal } from './ManageProfileModal'
import { SettingsModal } from './SettingsModal'
import { DeletedModal } from './DeletedModal'
import { initialsOf } from '../lib/utils'
import type { User as UserType } from '../types/user'
import type { NoteItem } from '../types/note'

interface ProfileMenuProps {
  user: UserType
  onLogout: () => void
  onUserUpdated: (user: UserType) => void
  onRestore: (item: NoteItem) => void
}

export function ProfileMenu({ user, onLogout, onUserUpdated, onRestore }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [deletedOpen, setDeletedOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const avatarButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  // Escape closes the settings modal.
  useEffect(() => {
    if (!settingsOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSettings()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [settingsOpen])

  // Escape closes the profile modal.
  useEffect(() => {
    if (!profileOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeProfile()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [profileOpen])

  // Escape closes the deleted modal.
  useEffect(() => {
    if (!deletedOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDeleted()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [deletedOpen])

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

  function openSettings() {
    setOpen(false)
    setSettingsOpen(true)
  }

  function openDeleted() {
    setOpen(false)
    setDeletedOpen(true)
  }

  // The menu items that opened these modals unmount together with the
  // dropdown, so the modal's own focus restore has no target — close handlers
  // return focus to the persistent trigger (the avatar button) instead.
  function closeSettings() {
    setSettingsOpen(false)
    avatarButtonRef.current?.focus()
  }

  function closeProfile() {
    setProfileOpen(false)
    avatarButtonRef.current?.focus()
  }

  function closeDeleted() {
    setDeletedOpen(false)
    avatarButtonRef.current?.focus()
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
              onClick={openSettings}
            >
              <Settings size={18} />
              Settings
            </button>
            <button
              className="profile-menu-item"
              role="menuitem"
              onClick={openDeleted}
            >
              <Trash2 size={18} />
              Deleted
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
        {settingsOpen && <SettingsModal onClose={closeSettings} />}
      </AnimatePresence>

      <AnimatePresence>
        {profileOpen && (
          <ManageProfileModal
            user={user}
            onSaved={onUserUpdated}
            onClose={closeProfile}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletedOpen && (
          <DeletedModal onClose={closeDeleted} onRestore={onRestore} />
        )}
      </AnimatePresence>
    </div>
  )
}