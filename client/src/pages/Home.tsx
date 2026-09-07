import { useCallback, useEffect, useMemo, useState } from 'react'
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

export function Home({ user, onLogout }: HomeProps) {
  const [items, setItems] = useState<NoteItem[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ItemFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<NoteItem | null>(null)

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
    try {
      const newItem = await api.createItem({ title, content, type })
      setItems((current) => [newItem, ...current])
      setError(null)
      setComposerOpen(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create item.')
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

  async function handleDelete(id: string) {
    try {
      await api.deleteItem(id)
      setItems((current) => current.filter((item) => item.id !== id))
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete item.')
    }
  }

  async function handleToggle(id: string) {
    const current = items.find((item) => item.id === id)
    if (!current) return

    try {
      const updatedItem = await api.updateItem(id, {
        completed: !current.completed,
      })
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === id ? updatedItem : item,
        ),
      )
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update item.')
    }
  }

  function openComposer() {
    setEditingItem(null)
    setComposerOpen(true)
  }

  function openEditor(item: NoteItem) {
    setEditingItem(item)
    setComposerOpen(true)
  }

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
