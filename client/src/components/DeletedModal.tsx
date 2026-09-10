import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusTrap } from '../hooks/useFocusTrap'
import * as api from '../lib/api'
import { cacheDeletedItems, loadCachedDeletedItems } from '../lib/authCache'
import {
  emptyTrashLocalFirst,
  permanentDeleteItemLocalFirst,
  restoreItemLocalFirst,
} from '../lib/store'
import type { NoteItem } from '../types/note'

// Best-effort connectivity probe, mirroring OfflineIndicator: navigator.onLine
// is false only when the browser is certain there is no network route. It
// cannot prove the server is reachable, but it is the correct gate for
// choosing between the cached trash read and the authoritative API fetch.
function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

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
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)

  // Keeps keyboard focus inside the dialog and restores it to the trigger
  // when the modal closes.
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const confirmCancelRef = useRef<HTMLButtonElement | null>(null)
  const lastConfirmIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // OFFLINE: serve the cached trash snapshot (previously synced deleted
      // items, newest deletion first) without waiting for a request that
      // cannot succeed. ONLINE: the server remains authoritative — fetch,
      // then mirror the response into the cache for the next offline open.
      if (!isOnline()) {
        const cached = await loadCachedDeletedItems()
        if (!cancelled) setItems(cached)
        setLoading(false)
        return
      }

      try {
        const data = await api.getDeletedItems()
        if (cancelled) return
        setItems(data)
        void cacheDeletedItems(data)
      } catch (err) {
        if (cancelled) return
        // Reachable but the request failed (server error, rate limit):
        // fall back to the cached trash so the modal stays useful, and
        // surface the failure exactly as before. With no cache (or an empty
        // one) the previous error-only behavior is preserved.
        const cached = await loadCachedDeletedItems()
        if (!cancelled) {
          if (cached.length > 0) setItems(cached)
          setError(err instanceof Error ? err.message : 'Failed to load.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
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
      // Local-first: the restore is applied to the durable store immediately
      // and the RESTORE op is queued; the background drain reaches the server.
      // The optimistic list removal below is preserved for the UI.
      const previous = items
      setItems((current) => current.filter((item) => item.id !== id))
      setConfirmDelete(null)

      try {
        const restored = await restoreItemLocalFirst(id)
        if (restored) {
          onRestore(restored)
          setError(null)
        }
      } catch {
        // Only an IndexedDB failure reaches here — roll back the list.
        setItems(previous)
        setError('Failed to restore item.')
      }
    },
    [items, onRestore],
  )

  const handlePermanentDelete = useCallback(
    async (id: string) => {
      // Local-first permanent delete: the record is removed and the
      // PERMANENT-DELETE op is queued in one transaction (or a still-pending
      // CREATE is cancelled so no server request is ever generated).
      const previous = items
      setItems((current) => current.filter((item) => item.id !== id))
      setConfirmDelete(null)

      try {
        await permanentDeleteItemLocalFirst(id)
      } catch {
        // Only an IndexedDB failure reaches here — roll back the list.
        setItems(previous)
        setError('Failed to delete item.')
      }
    },
    [items],
  )

  async function handleEmptyTrash() {
    setConfirmEmptyTrash(false)
    setItems([])
    try {
      await emptyTrashLocalFirst()
      if (isOnline()) {
        void api.emptyTrash().catch(() => {})
      }
    } catch {
      setError('Failed to empty trash.')
    }
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
        <div className="profile-modal-top" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
          {items.length > 0 && (
            <div>
              {confirmEmptyTrash ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="empty-trash-btn confirm"
                    onClick={handleEmptyTrash}
                  >
                    Confirm Empty
                  </button>
                  <button
                    type="button"
                    className="empty-trash-btn cancel"
                    onClick={() => setConfirmEmptyTrash(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="empty-trash-btn"
                  onClick={() => setConfirmEmptyTrash(true)}
                  title="Empty entire trash"
                >
                  <Trash2 size={13} />
                  Empty Trash
                </button>
              )}
            </div>
          )}
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
