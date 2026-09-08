import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusTrap } from '../hooks/useFocusTrap'
import * as api from '../lib/api'
import type { NoteItem } from '../types/note'

interface DeletedModalProps {
  onClose: () => void
  onRestore: (item: NoteItem) => void
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function DeletedModal({ onClose, onRestore }: DeletedModalProps) {
  const [items, setItems] = useState<NoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Keeps keyboard focus inside the dialog and restores it to the trigger
  // when the modal closes.
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const confirmCancelRef = useRef<HTMLButtonElement | null>(null)
  const lastConfirmIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getDeletedItems()
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Escape closes the modal.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // The inline "Delete forever?" confirmation is the active dialog while it
  // is open: focus moves into it when it appears, and back to the card's
  // "Delete forever" button when it is dismissed (if that card still exists —
  // after a successful restore/delete it is gone and focus simply stays put).
  useEffect(() => {
    if (confirmDelete) {
      lastConfirmIdRef.current = confirmDelete
      confirmCancelRef.current?.focus()
    } else if (lastConfirmIdRef.current) {
      const confirmedId = lastConfirmIdRef.current
      lastConfirmIdRef.current = null
      dialogRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-delete-forever="${confirmedId}"]`,
        )
        ?.focus()
    }
  }, [confirmDelete, dialogRef])

  const handleRestore = useCallback(
    async (id: string) => {
      // Optimistic: remove from deleted list immediately.
      const previous = items
      setItems((current) => current.filter((item) => item.id !== id))
      setConfirmDelete(null)

      try {
        const restored = await api.restoreItem(id)
        onRestore(restored)
      } catch {
        // Rollback on failure.
        setItems(previous)
        setError('Failed to restore item.')
      }
    },
    [items, onRestore],
  )

  const handlePermanentDelete = useCallback(
    async (id: string) => {
      // Optimistic: remove from deleted list immediately.
      const previous = items
      setItems((current) => current.filter((item) => item.id !== id))
      setConfirmDelete(null)

      try {
        await api.permanentDeleteItem(id)
      } catch {
        // Rollback on failure.
        setItems(previous)
        setError('Failed to delete item.')
      }
    },
    [items],
  )

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
        ref={dialogRef}
        className="profile-modal deleted-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Deleted items"
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
          <div>
            <h2 className="profile-modal-title">Deleted</h2>
            <p className="deleted-subtitle">Items you've deleted</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="status-bar error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="deleted-loading">
            <span>⏳</span>
          </div>
        ) : items.length === 0 ? (
          <div className="deleted-empty">
            <div className="empty-icon">🗑️</div>
            <h3>Nothing deleted.</h3>
            <p>You've kept everything safe. 👀</p>
          </div>
        ) : (
          <div className="deleted-list">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  className="deleted-card"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                >
                  <div className="deleted-card-header">
                    <span className="deleted-card-title">{item.title}</span>
                    <span className="deleted-card-meta">
                      {item.type === 'task' ? 'Task' : 'Note'} · Deleted{' '}
                      {item.deletedAt ? relativeTime(item.deletedAt) : ''}
                    </span>
                  </div>

                  {item.content && (
                    <p className="deleted-card-content">{item.content}</p>
                  )}

                  <div className="deleted-card-actions">
                    <button
                      className="deleted-action-button restore"
                      onClick={() => void handleRestore(item.id)}
                      aria-label={`Restore ${item.title}`}
                    >
                      <RotateCcw size={14} />
                      Restore
                    </button>

                    {confirmDelete === item.id ? (
                      <div className="deleted-confirm">
                        <span className="deleted-confirm-text">
                          Delete forever?
                        </span>
                        <button
                          ref={confirmCancelRef}
                          className="deleted-action-button confirm-cancel"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="deleted-action-button confirm-delete"
                          onClick={() =>
                            void handlePermanentDelete(item.id)
                          }
                        >
                          Delete forever
                        </button>
                      </div>
                    ) : (
                      <button
                        className="deleted-action-button destroy"
                        onClick={() => setConfirmDelete(item.id)}
                        aria-label={`Delete ${item.title} forever`}
                        data-delete-forever={item.id}
                      >
                        <Trash2 size={14} />
                        Delete forever
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
