import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LogOut, Settings } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { Brand } from '../components/Brand'
import { SearchBar } from '../components/SearchBar'
import { FilterTabs } from '../components/FilterTabs'
import { NoteCard } from '../components/NoteCard'
import { EmptyState } from '../components/EmptyState'
import { ComposerModal } from '../components/ComposerModal'
import * as api from '../lib/api'
import type { ItemFilter, ItemType, NoteItem } from '../types/note'
import type { User } from '../types/user'

interface HomeProps {
  user: User
  onLogout: () => void
}

const TEMP_ID_PREFIX = 'temp-'

/** Client-only id for an item that has not been created on the server yet. */
function createTempItemId(): string {
  return `${TEMP_ID_PREFIX}${crypto.randomUUID()}`
}

/** True when the id belongs to an optimistically created, still-pending item. */
function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX)
}

export function Home({ user, onLogout }: HomeProps) {
  const [items, setItems] = useState<NoteItem[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ItemFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<NoteItem | null>(null)

  // In-flight tracking for optimistic mutations. Refs (not state) are used so
  // the guards are read/written synchronously across re-renders, without
  // triggering renders themselves.
  const pendingDeleteIds = useRef<Set<string>>(new Set())
  const toggleTargets = useRef<Map<string, boolean>>(new Map())
  const pendingCreates = useRef<Map<string, NoteItem>>(new Map())
  const cancelledCreates = useRef<Set<string>>(new Set())

  // Latest-items mirror for the memoized NoteCards. The card callbacks are
  // stable only if their identity survives unrelated Home re-renders, so they
  // read item state from this ref (synced right after every items commit)
  // instead of capturing the `items` array directly.
  const itemsRef = useRef<NoteItem[]>(items)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const refreshItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getItems()
      setItems(data)
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load items.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshItems()
  }, [refreshItems])

  const visibleItems = useMemo(() => {
    const search = query.trim().toLowerCase()

    return items.filter((item) => {
      const matchesQuery =
        item.title.toLowerCase().includes(search) ||
        item.content.toLowerCase().includes(search)

      const matchesFilter =
        filter === 'all' ||
        (filter === 'tasks' && item.type === 'task') ||
        (filter === 'notes' && item.type === 'note') ||
        (filter === 'completed' && item.completed)

      return matchesQuery && matchesFilter
    })
  }, [items, query, filter])

  async function handleCreate(
    title: string,
    content: string,
    type: ItemType,
  ) {
    const tempId = createTempItemId()
    const optimisticItem: NoteItem = {
      id: tempId,
      title,
      content,
      type,
      completed: false,
    }

    // Add the item to the UI immediately and close the composer; the POST runs
    // in the background and replaces the temporary item with the server item.
    pendingCreates.current.set(tempId, optimisticItem)
    setItems((current) => [optimisticItem, ...current])
    setComposerOpen(false)

    try {
      const newItem = await api.createItem({ title, content, type })

      if (cancelledCreates.current.has(tempId)) {
        // The user deleted the pending item before the server confirmed the
        // create — drop the optimistic copy and clean up the server-side orphan.
        pendingCreates.current.delete(tempId)
        cancelledCreates.current.delete(tempId)
        void api.deleteItem(newItem.id).catch(() => {
          // Best-effort cleanup; the item is already gone from the UI.
        })
        return
      }

      const local = pendingCreates.current.get(tempId)
      pendingCreates.current.delete(tempId)

      // Replace the temporary item with the canonical server item. If the user
      // toggled completion while the POST was in flight, keep their newer local
      // intent and sync it to the server so the toggle is not lost.
      const reconciled =
        local && local.completed !== newItem.completed
          ? { ...newItem, completed: local.completed }
          : newItem

      setItems((current) => {
        const index = current.findIndex((item) => item.id === tempId)
        if (index === -1) {
          // Temp item is gone (e.g. a refresh raced the POST) — prepend the
          // confirmed item, matching the pre-optimistic behavior.
          return [reconciled, ...current]
        }
        const next = [...current]
        next[index] = reconciled
        return next
      })

      if (reconciled !== newItem) {
        void api
          .updateItem(newItem.id, { completed: reconciled.completed })
          .catch((error) => {
            setError(
              error instanceof Error ? error.message : 'Failed to update item.',
            )
          })
      }
      setError(null)
    } catch (error) {
      pendingCreates.current.delete(tempId)
      setItems((current) => current.filter((item) => item.id !== tempId))
      // If the user already removed the pending item there is nothing to roll
      // back, so surface the error only for uncancelled creates.
      if (!cancelledCreates.current.has(tempId)) {
        setError(
          error instanceof Error ? error.message : 'Failed to create item.',
        )
      }
      cancelledCreates.current.delete(tempId)
    }
  }

  async function handleUpdate(
    title: string,
    content: string,
    type: ItemType,
  ) {
    if (!editingItem) return

    try {
      const updatedItem = await api.updateItem(editingItem.id, {
        title,
        content,
        type,
      })
      setItems((current) =>
        current.map((item) =>
          item.id === updatedItem.id ? updatedItem : item,
        ),
      )
      setError(null)
      setComposerOpen(false)
      setEditingItem(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update item.')
    }
  }

  // Stable mutation callbacks for the memoized NoteCards: each handler only
  // depends on refs and setters (never on a captured `items` value), so its
  // identity stays constant and an unrelated Home re-render (search typing,
  // filter change, another item's mutation) never invalidates the cards.
  const handleDelete = useCallback(async (id: string) => {
    if (isTempId(id)) {
      // Cancel a pending create: the item has no server id yet, so removing it
      // locally is the whole operation. The create handler reconciles the server
      // once the POST settles (cleanup delete on success, no error on failure).
      pendingCreates.current.delete(id)
      cancelledCreates.current.add(id)
      setItems((current) => current.filter((item) => item.id !== id))
      setError(null)
      return
    }

    // Guard against duplicate DELETE calls for the same item while one is in flight.
    if (pendingDeleteIds.current.has(id)) return
    pendingDeleteIds.current.add(id)

    // Capture the item and its position before removing it, for rollback.
    const currentItems = itemsRef.current
    const index = currentItems.findIndex((item) => item.id === id)
    if (index === -1) {
      pendingDeleteIds.current.delete(id)
      return
    }
    const previous = currentItems[index]

    // Remove it from the UI immediately; the DELETE runs in the background.
    setItems((current) => current.filter((item) => item.id !== id))

    try {
      await api.deleteItem(id)
      setError(null)
    } catch (deleteError) {
      // Restore the item to its previous position/state.
      setItems((current) => {
        if (current.some((item) => item.id === id)) return current
        const next = [...current]
        next.splice(Math.min(index, next.length), 0, previous)
        return next
      })
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Failed to delete item.',
      )
    } finally {
      pendingDeleteIds.current.delete(id)
    }
  }, [])

  const handleToggle = useCallback(async (id: string) => {
    if (isTempId(id)) {
      // Pending create: flip the card instantly and record the local intent so
      // it survives the server response, but never PATCH a client-only id.
      const pending = pendingCreates.current.get(id)
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === id ? { ...item, completed: !item.completed } : item,
        ),
      )
      if (pending) {
        pendingCreates.current.set(id, {
          ...pending,
          completed: !pending.completed,
        })
      }
      setError(null)
      return
    }

    const current = itemsRef.current.find((item) => item.id === id)
    if (!current) return
    const target = !current.completed

    // Ignore a redundant click while a request for the same target is pending;
    // a "toggle back" supersedes the in-flight request instead (latest wins).
    if (toggleTargets.current.get(id) === target) return
    toggleTargets.current.set(id, target)

    // Apply the new completed state immediately; the PATCH runs in the background.
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id && item.completed !== target
          ? { ...item, completed: target }
          : item,
      ),
    )

    try {
      const updatedItem = await api.updateItem(id, { completed: target })
      const isLatest = toggleTargets.current.get(id) === target
      if (isLatest) toggleTargets.current.delete(id)

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === id && isLatest ? { ...item, ...updatedItem } : item,
        ),
      )
      if (isLatest) setError(null)
    } catch (error) {
      const isLatest = toggleTargets.current.get(id) === target
      if (isLatest) toggleTargets.current.delete(id)

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === id && isLatest ? { ...item, completed: !target } : item,
        ),
      )
      if (isLatest) {
        setError(
          error instanceof Error ? error.message : 'Failed to update item.',
        )
      }
    }
  }, [])

  function openComposer() {
    setEditingItem(null)
    setComposerOpen(true)
  }

  const openEditor = useCallback((item: NoteItem) => {
    setEditingItem(item)
    setComposerOpen(true)
  }, [])

  function closeComposer() {
    setComposerOpen(false)
    setEditingItem(null)
  }

  function handleSave(title: string, content: string, type: ItemType) {
    if (editingItem) {
      void handleUpdate(title, content, type)
    } else {
      void handleCreate(title, content, type)
    }
  }

  async function handleLogout() {
    try {
      await api.logout()
      onLogout()
    } catch {
      // Force logout even if API fails
      onLogout()
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <SearchBar value={query} onChange={setQuery} />
          <span className="user-greeting">{user.name.split(' ')[0]}</span>
          <button className="icon-button" aria-label="Settings">
            <Settings size={18} />
          </button>
          <button className="icon-button" onClick={handleLogout} aria-label="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="hero-copy">
        <p className="eyebrow">your little second brain</p>
        <h1>What’s on your mind?</h1>
        <p>Drop it here. You can deal with it later.</p>
      </section>

      <button className="composer-trigger" onClick={openComposer}>
        <span>＋</span>
        <span>Write something...</span>
      </button>

      <FilterTabs value={filter} onChange={setFilter} />

      {error && (
        <div className="status-bar error" role="alert">
          <span>{error}</span>
          <button className="retry-button" onClick={() => void refreshItems()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <h2>Loading...</h2>
        </div>
      ) : (
        <>
          <section className="notes-grid">
            <AnimatePresence mode="popLayout">
              {visibleItems.map((item) => (
                <NoteCard
                  key={item.id}
                  item={item}
                  onDelete={handleDelete}
                  onToggleTask={handleToggle}
                  onEdit={openEditor}
                />
              ))}
            </AnimatePresence>
          </section>

          {visibleItems.length === 0 && <EmptyState />}
        </>
      )}

      <AnimatePresence>
        {composerOpen && (
          <ComposerModal
            key={editingItem ? editingItem.id : 'new'}
            onClose={closeComposer}
            onSave={handleSave}
            editMode={editingItem !== null}
            initialTitle={editingItem?.title}
            initialContent={editingItem?.content}
            initialType={editingItem?.type}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
