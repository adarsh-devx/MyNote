import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from './Avatar'
import type { User } from '../types/user'

interface ManageProfileModalProps {
  user: User
  onSaved: (updated: User) => void
  onClose: () => void
}

/** "Shivam Kumar" -> "SK" — same logic used by ProfileMenu. */
function initialsOf(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return initials || '?'
}

export function ManageProfileModal({
  user,
  onSaved,
  onClose,
}: ManageProfileModalProps) {
  const [name, setName] = useState(user.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Focus the name input when the modal opens.
  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  // Escape closes the modal.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const trimmedName = name.trim()
  const isDirty = trimmedName !== user.name
  const isValid = trimmedName.length > 0
  const canSubmit = isDirty && isValid && !saving

  const handleSave = useCallback(async () => {
    if (!canSubmit) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      // Dynamically import the API module to avoid circular deps at module level.
      const { updateProfile } = await import('../lib/api')
      const updated = await updateProfile(trimmedName)
      onSaved(updated)
      setSuccess(true)
      // Brief pause so the user sees confirmation, then close.
      setTimeout(() => onClose(), 600)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update profile.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [canSubmit, trimmedName, onSaved, onClose])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSave()
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Manage Profile"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.15 }}
      >
        {/* Header */}
        <div className="profile-modal-top">
          <button
            className="profile-back-button"
            onClick={onClose}
            aria-label="Back"
            type="button"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="profile-modal-title">Manage Profile</h2>
        </div>

        {/* Avatar + name */}
        <div className="profile-modal-hero">
          <Avatar size="lg">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.name} />
            ) : (
              <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
            )}
          </Avatar>
          <p className="profile-hero-name">{user.name}</p>
          <p className="profile-hero-email">{user.email}</p>
        </div>

        <div className="profile-divider" />

        {/* Form */}
        <form className="profile-form" onSubmit={handleSubmit}>
          <label className="profile-label" htmlFor="profile-display-name">
            Display Name
          </label>
          <input
            ref={nameInputRef}
            id="profile-display-name"
            className="profile-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
              setSuccess(false)
            }}
            maxLength={100}
            autoComplete="name"
          />

          <label className="profile-label" htmlFor="profile-email">
            Email
          </label>
          <div className="profile-input-read-only-wrap">
            <input
              id="profile-email"
              className="profile-input profile-input-readonly"
              type="email"
              value={user.email}
              readOnly
              tabIndex={-1}
            />
            <Lock size={16} className="profile-lock-icon" />
          </div>

          {/* Feedback */}
          {error && (
            <p className="profile-feedback profile-feedback-error">{error}</p>
          )}
          {success && (
            <p className="profile-feedback profile-feedback-success">
              Profile updated.
            </p>
          )}

          <button
            type="submit"
            className="profile-save-button"
            disabled={!canSubmit}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}
