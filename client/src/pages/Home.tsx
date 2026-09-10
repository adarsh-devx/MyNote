import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Brand } from '../components/Brand'
import { SearchBar } from '../components/SearchBar'
import { ProfileMenu } from '../components/ProfileMenu'
import { FilterTabs } from '../components/FilterTabs'
import { NoteCard } from '../components/NoteCard'
import { NoteCardSkeleton } from '../components/NoteCardSkeleton'
import { EmptyState } from '../components/EmptyState'
import { ComposerModal } from '../components/ComposerModal'
import * as api from '../lib/api'
import {
  cacheActiveItems,
  compareNoteItems,
  getCreateOpSeqMap,
  loadCachedActiveItems,
} from '../lib/authCache'
import { getDirtyItems, hasPendingSyncOperations } from '../lib/db'
import {
  createItemLocalFirst,
  softDeleteItemLocalFirst,
  toggleItemLocalFirst,
  togglePinItemLocalFirst,
  updateItemLocalFirst,
} from '../lib/store'
import { setCanonicalizationListener, syncNow } from '../lib/syncEngine'
import { setRemoteChangeListener, isTauri } from '../lib/notifications'
import { checkForAppUpdates, type AppUpdateInfo } from '../lib/updater'
import type { ItemFilter, ItemType, NoteColor, NoteItem } from '../types/note'
import type { User } from '../types/user'

interface HomeProps {
  user: User
  onLogout: () => void
  onUserUpdated: (user: User) => void
}





export function Home({ user, onLogout, onUserUpdated }: HomeProps) {
  const [items, setItems] = useState<NoteItem[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ItemFilter>('all')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<NoteItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null)
  const [installingUpdate, setInstallingUpdate] = useState(false)

  // In-flight tracking for optimistic mutations. Refs (not state) are used so
  // the guards are read/written synchronously across re-renders, without
  // triggering renders themselves.
  const pendingDeleteIds = useRef<Set<string>>(new Set())

  // Phase 1: true once the initial list was served from the IndexedDB cache.
  // While set, a failed server refresh must not clobber the hydrated UI with
  // an error banner — connectivity is already communicated globally by the
  // OfflineIndicator, and mutation errors keep their own banners.
  const hydratedFromCacheRef = useRef(false)

  // Latest-items mirror for the memoized NoteCards. The card callbacks are
  // stable only if their identity survives unrelated Home re-renders, so they
  // read item state from this ref (synced right after every items commit)
  // instead of capturing the `items` array directly.
  const itemsRef = useRef<NoteItem[]>(items)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const refreshItems = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.getItems()
      const dirtyRecords = await getDirtyItems()
      const dirtyIds = new Set(dirtyRecords.map((record) => record.id))

      setItems((current) => {
        if (current.length === 0) {
          return [...data].sort((a, b) => compareNoteItems(a, b))
        }
        const byId = new Map(current.map((item) => [item.id, item]))
        const merged: NoteItem[] = data.map((serverItem) => {
          let local = byId.get(serverItem.id)
          if (!local) {
            // Check if any local item was created with this clientRequestId / matching title & content
            for (const [id, item] of byId.entries()) {
              if (id.startsWith('local-')) {
                local = item
                byId.delete(id)
                break
              }
            }
          } else {
            byId.delete(serverItem.id)
          }

          if (local) {
            return {
              ...serverItem,
              clientId: local.clientId ?? serverItem.clientId,
              ...(dirtyIds.has(local.id)
                ? {
                    title: local.title,
                    content: local.content,
                    type: local.type,
                    completed: local.completed,
                    pinned: local.pinned,
                    color: local.color,
                    tags: local.tags,
                  }
                : {}),
            }
          }
          return serverItem
        })
        const localOnly = [...byId.values()].filter((item) =>
          dirtyIds.has(item.id),
        )
        const result = [...localOnly, ...merged].sort((a, b) =>
          compareNoteItems(a, b),
        )
        return result
      })
      setError(null)
      void cacheActiveItems(data)
    } catch (error) {
      if (!hydratedFromCacheRef.current && !silent) {
        setError(error instanceof Error ? error.message : 'Failed to load items.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Phase 3: when a queued CREATE is acknowledged, the engine reconciles
  // the durable record to the canonical server id and notifies this listener
  // so the React item keys/ids follow the durable records. This is the ONLY
  // engine-to-UI event; the local store is not a reactive rendering system.
  useEffect(() => {
    setCanonicalizationListener((canonical, previousLocalId) => {
      setItems((current) => {
        const idx = current.findIndex(
          (item) =>
            item.id === previousLocalId ||
            (canonical.clientId && item.clientId === canonical.clientId),
        )
        if (idx !== -1) {
          const next = [...current]
          // Replace in place — same grid slot, same stable clientId key, so
          // AnimatePresence never unmounts/remounts this card (no jump).
          next[idx] = {
            ...canonical,
            clientId: current[idx].clientId ?? canonical.clientId,
          }
          return next
        }
        if (current.some((item) => item.id === canonical.id)) return current
        return current
      })
    })
    return () => setCanonicalizationListener(null)
  }, [])

  // Tauri path: when the notification poller detects remote tasks (count > 0),
  // pull the latest server items immediately — the list updates in the same
  // tick as the desktop toast.
  useEffect(() => {
    if (!isTauri()) return
    setRemoteChangeListener(() => void refreshItems(true))
    return () => setRemoteChangeListener(null)
  }, [refreshItems])

  // Instant real-time push synchronization via Server-Sent Events (SSE):
  // When any device creates/edits/deletes a note, server immediately broadcasts
  // an event to all user connections -> UI updates across all devices in <100ms.
  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource(`${api.BASE_URL}/items/stream`, {
        withCredentials: true,
      })

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type: string }
          if (payload.type === 'ITEMS_UPDATED') {
            void refreshItems(true)
          }
        } catch {}
      }

      eventSource.onerror = () => {
        // EventSource will automatically retry connecting
      }
    } catch (err) {
      console.warn('[SSE] EventSource setup failed:', err)
    }

    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [refreshItems])

  // Live fallback background sync poller: polls every 10 seconds as a safety net
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshItems(true)
        void syncNow()
      }
    }, 10000)
    return () => clearInterval(timer)
  }, [refreshItems])

  // Focus, visibility & reconnection refresh: when the tab/window regains
  // focus, becomes visible, or reconnects online, pull server items so changes
  // made on another device appear automatically.
  useEffect(() => {
    let lastRefreshAt = 0
    const REFRESH_THROTTLE_MS = 3_000

    function onFocusOrVisible() {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastRefreshAt < REFRESH_THROTTLE_MS) return
      lastRefreshAt = now
      void refreshItems(true)
    }

    function onOnline() {
      // Reconnected: pull authoritative server items immediately without throttle
      lastRefreshAt = Date.now()
      void refreshItems(true)
      void syncNow()
    }

    document.addEventListener('visibilitychange', onFocusOrVisible)
    window.addEventListener('focus', onFocusOrVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onFocusOrVisible)
      window.removeEventListener('focus', onFocusOrVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [refreshItems])

  // Quick Note shortcut & Tauri global shortcut listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when user is typing inside an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      const isAltN = e.altKey && e.key.toLowerCase() === 'n'
      const isCtrlShiftN = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n'
      const isAltShiftN = e.altKey && e.shiftKey && e.key.toLowerCase() === 'n'

      if (isAltN || isCtrlShiftN || isAltShiftN) {
        e.preventDefault()
        setEditingItem(null)
        setComposerOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    let unlistenTauri: (() => void) | undefined
    if (isTauri()) {
      void import('@tauri-apps/api/event').then(({ listen }) => {
        void listen('open-quick-note', () => {
          setEditingItem(null)
          setComposerOpen(true)
        }).then((unlisten) => {
          unlistenTauri = unlisten
        })
      })
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (unlistenTauri) unlistenTauri()
    }
  }, [])

  // Auto-updater check on startup (desktop only)
  useEffect(() => {
    if (!isTauri()) return
    void checkForAppUpdates()
      .then((info) => {
        if (info.available) {
          setAvailableUpdate(info)
        }
      })
      .catch(() => {})
  }, [])


  // Phase 1C — offline-first hydration: cached items (the previously synced
  // server snapshot) populate the list BEFORE the network round-trip, so a
  // previously-logged-in user sees their notes immediately, even with the
  // network down. The server refresh then runs exactly as before and stays
  // authoritative whenever reachable (Phase 1D).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cached = await loadCachedActiveItems()
        console.log('[DEBUG] hydration: cached', cached.length, 'items:', cached.map(i => ({id: i.id, ct: i.createdAt, title: i.title})))
        if (cancelled) return
        if (cached.length > 0) {
          hydratedFromCacheRef.current = true
          setItems(cached)
          setLoading(false)
        }
      } catch (error) {
        console.warn('[home] Hydrating cached items failed:', error)
      }
      if (!cancelled) {
        void refreshItems()
        void syncNow()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshItems])

  // Extract all unique tags across items for quick filtering chips
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    items.forEach((item) => {
      if (item.tags) {
        item.tags.forEach((t) => tagSet.add(t))
      }
    })
    return Array.from(tagSet).sort()
  }, [items])

  const visibleItems = useMemo(() => {
    const search = query.trim().toLowerCase()

    return items.filter((item) => {
      const matchesQuery =
        item.title.toLowerCase().includes(search) ||
        item.content.toLowerCase().includes(search) ||
        (item.tags && item.tags.some((t) => t.toLowerCase().includes(search.replace(/^#/, ''))))

      const matchesFilter =
        filter === 'all' ||
        (filter === 'tasks' && item.type === 'task') ||
        (filter === 'notes' && item.type === 'note') ||
        (filter === 'completed' && item.completed) ||
        (filter === 'pinned' && item.pinned)

      const matchesTag = !selectedTag || (item.tags && item.tags.includes(selectedTag))

      return matchesQuery && matchesFilter && matchesTag
    })
  }, [items, query, filter, selectedTag])

  async function handleCreate(
    title: string,
    content: string,
    type: ItemType,
    color?: NoteColor,
    tags?: string[],
    pinned?: boolean,
  ) {
    setComposerOpen(false)

    try {
      const created = await createItemLocalFirst({
        title,
        content,
        type,
        color,
        tags,
        pinned,
      })
      setItems((current) =>
        [...current, created].sort((a, b) => compareNoteItems(a, b)),
      )
      setError(null)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to create item.',
      )
    }
  }

  async function handleUpdate(
    title: string,
    content: string,
    type: ItemType,
    color?: NoteColor,
    tags?: string[],
    pinned?: boolean,
  ) {
    if (!editingItem) return

    const editId = editingItem.id
    setComposerOpen(false)
    setEditingItem(null)

    try {
      const updated = await updateItemLocalFirst(editId, {
        title,
        content,
        type,
        color,
        tags,
        pinned,
      })
      if (updated) {
        setItems((current) =>
          current.map((item) => (item.id === editId ? updated : item)),
        )
        setError(null)
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to update item.',
      )
    }
  }

  // Stable mutation callbacks for the memoized NoteCards: each handler only
  // depends on refs and setters (never on a captured `items` value), so its
  // identity stays constant and an unrelated Home re-render (search typing,
  // filter change, another item's mutation) never invalidates the cards.
  const handleDelete = useCallback(async (id: string) => {
    // Dedupe double-clicks while a delete is being committed.
    if (pendingDeleteIds.current.has(id)) return
    pendingDeleteIds.current.add(id)

    const currentItems = itemsRef.current
    const index = currentItems.findIndex((item) => item.id === id)
    if (index === -1) {
      pendingDeleteIds.current.delete(id)
      return
    }
    const previous = currentItems[index]

    try {
      // Local-first soft delete: record + SOFT-DELETE op commit atomically,
      // the card leaves the grid, and the drain reaches the server later.
      await softDeleteItemLocalFirst(id)
      setItems((current) => current.filter((item) => item.id !== id))
      setError(null)
    } catch (error) {
      // Only an IndexedDB failure reaches here (network failures never roll
      // back a local-first action) — restore as a best effort.
      setItems((current) => {
        if (current.some((item) => item.id === id)) return current
        const next = [...current]
        next.splice(Math.min(index, next.length), 0, previous)
        return next
      })
      setError(
        error instanceof Error ? error.message : 'Failed to delete item.',
      )
    } finally {
      pendingDeleteIds.current.delete(id)
    }
  }, [])

  // Stable mutation callback for the memoized NoteCards (see handleDelete).
  const handleToggle = useCallback(async (id: string) => {
    const current = itemsRef.current.find((item) => item.id === id)
    if (!current) return
    const target = !current.completed

    // Absolute-state toggle persisted local-first; the TOGGLE op reaches the
    // server in the background and is idempotent by construction (no deltas).
    try {
      const updated = await toggleItemLocalFirst(id, target)
      if (updated) {
        setItems((currentItems) =>
          currentItems.map((item) => (item.id === id ? updated : item)),
        )
        setError(null)
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to update item.',
      )
    }
  }, [])

  // Stable mutation callback for pinning
  const handleTogglePin = useCallback(async (id: string) => {
    const current = itemsRef.current.find((item) => item.id === id)
    if (!current) return
    const target = !current.pinned

    // Immediate optimistic update in UI
    const optimistic: NoteItem = { ...current, pinned: target }
    setItems((currentItems) => {
      const next = currentItems.map((item) => (item.id === id ? optimistic : item))
      return [...next].sort((a, b) => compareNoteItems(a, b))
    })

    try {
      const updated = await togglePinItemLocalFirst(id, target, current)
      if (updated) {
        setItems((currentItems) => {
          const next = currentItems.map((item) => (item.id === id ? updated : item))
          return [...next].sort((a, b) => compareNoteItems(a, b))
        })
      }
      setError(null)
    } catch (error) {
      // Rollback on failure
      setItems((currentItems) => {
        const next = currentItems.map((item) => (item.id === id ? current : item))
        return [...next].sort((a, b) => compareNoteItems(a, b))
      })
      setError(
        error instanceof Error ? error.message : 'Failed to update pin.',
      )
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

  function handleSave(
    title: string,
    content: string,
    type: ItemType,
    color?: NoteColor,
    tags?: string[],
    pinned?: boolean,
  ) {
    if (editingItem) {
      void handleUpdate(title, content, type, color, tags, pinned)
    } else {
      void handleCreate(title, content, type, color, tags, pinned)
    }
  }

  const handleRestoreItem = useCallback(async (restored: NoteItem) => {
    const createSeqMap = await getCreateOpSeqMap()
    setItems((current) => {
      const idx = current.findIndex((item) => item.id === restored.id)
      if (idx !== -1) {
        // Item already present (unlikely but safe) — update it.
        const next = [...current]
        next[idx] = restored
        return next
      }
      // Insert using the exact same ordering semantics as cache hydration (compareNoteItems with syncQueue seq).
      const insertAt = current.findIndex(
        (item) => compareNoteItems(restored, item, createSeqMap) < 0,
      )
      const next = [...current]
      next.splice(insertAt === -1 ? next.length : insertAt, 0, restored)
      return next
    })
  }, [])

  async function handleLogout() {
    // Phase 3: never silently discard unsynced local mutations. With a
    // non-empty queue the user is asked to reconnect first (an explicit
    // discard flow is a later-phase concern).
    if (await hasPendingSyncOperations()) {
      setError(
        'You have unsynced changes. Reconnect to sync before logging out.',
      )
      return
    }
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
          <ProfileMenu user={user} onLogout={handleLogout} onUserUpdated={onUserUpdated} onRestore={handleRestoreItem} />
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

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="tag-filter-bar" aria-label="Filter by tag">
          <span className="tag-filter-label">Tags:</span>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`tag-filter-chip ${selectedTag === tag ? 'active' : ''}`}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
          {selectedTag && (
            <button
              type="button"
              className="tag-filter-clear"
              onClick={() => setSelectedTag(null)}
            >
              Clear tag
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="status-bar error" role="alert">
          <span>{error}</span>
          <button className="retry-button" onClick={() => void refreshItems()}>
            Retry
          </button>
        </div>
      )}

      {/* The skeleton shows only when there is nothing to render yet. Once
          items exist (cached or server), a background refresh updates the
          grid in place instead of flashing skeletons over live content. */}
      {loading && items.length === 0 ? (
        <section className="notes-grid" aria-busy="true" aria-label="Loading items">
          <NoteCardSkeleton />
          <NoteCardSkeleton />
          <NoteCardSkeleton />
        </section>
      ) : (
        <>
          <section className="notes-grid">
            <AnimatePresence mode="popLayout">
              {visibleItems.map((item) => (
                <NoteCard
                  key={item.clientId ?? `server-${item.id}`}
                  item={item}
                  onDelete={handleDelete}
                  onToggleTask={handleToggle}
                  onTogglePin={handleTogglePin}
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
            initialColor={editingItem?.color}
            initialTags={editingItem?.tags}
            initialPinned={editingItem?.pinned}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {availableUpdate && (
          <div className="update-banner" role="status">
            <div className="update-banner-info">
              <strong>Update v{availableUpdate.version} Available!</strong>
              <p>{availableUpdate.body}</p>
            </div>
            <button
              type="button"
              className="update-banner-btn"
              disabled={installingUpdate}
              onClick={async () => {
                if (!availableUpdate.installAndRelaunch) return
                setInstallingUpdate(true)
                try {
                  await availableUpdate.installAndRelaunch()
                } catch {
                  setInstallingUpdate(false)
                  setError('Failed to install update. Please try again.')
                }
              }}
            >
              {installingUpdate ? 'Installing...' : 'Update & Restart'}
            </button>
          </div>
        )}
      </AnimatePresence>
    </main>
  )
}
