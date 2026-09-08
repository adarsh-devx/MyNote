import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ItemType } from '../types/note'

interface ComposerModalProps {
  onClose: () => void
  onSave: (title: string, content: string, type: ItemType) => void
  editMode?: boolean
  initialTitle?: string
  initialContent?: string
  initialType?: ItemType
}

export function ComposerModal({
  onClose,
  onSave,
  editMode = false,
  initialTitle = '',
  initialContent = '',
  initialType = 'task',
}: ComposerModalProps) {
  const [type, setType] = useState<ItemType>(initialType)
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)

  // Guards the optimistic create submit against a fast double-click: after the
  // first submit the optimistic item is already on screen, so a second submit
  // would create a duplicate. Edit keeps its existing (non-optimistic) behavior.
  const submitted = useRef(false)

  const isDirty =
    title.trim().length > 0 ||
    content.trim().length > 0 ||
    type !== initialType

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitted.current) return
    if (!title.trim()) return
    if (!editMode) submitted.current = true
    onSave(title, content, type)
  }

  function handleBackdropMouseDown() {
    if (!isDirty) onClose()
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={handleBackdropMouseDown}
      role="presentation"
    >
      <motion.form
        className="composer-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{editMode ? 'edit' : 'new'}</span>
            <h2>{editMode ? 'Update your entry.' : 'Put it somewhere.'}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close composer"
          >
            <X size={19} />
          </button>
        </div>

        <div className="type-switch">
          <button
            type="button"
            className={type === 'task' ? 'active' : ''}
            onClick={() => setType('task')}
          >
            ✓ Task
          </button>
          <button
            type="button"
            className={type === 'note' ? 'active' : ''}
            onClick={() => setType('note')}
          >
            ✎ Note
          </button>
        </div>

        <input
          className="title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          autoFocus
          maxLength={200}
        />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write whatever you don't want to forget..."
          rows={6}
          maxLength={5000}
        />

        <button className="save-button" type="submit">
          {editMode ? 'Update' : `Save ${type}`}
        </button>
      </motion.form>
    </motion.div>
  )
}
