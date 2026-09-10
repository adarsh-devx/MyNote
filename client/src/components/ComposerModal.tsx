import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bold, CheckSquare, Code, Italic, List, Pin, Plus, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { ItemType, NoteColor } from '../types/note'

interface ComposerModalProps {
  onClose: () => void
  onSave: (
    title: string,
    content: string,
    type: ItemType,
    color?: NoteColor,
    tags?: string[],
    pinned?: boolean,
  ) => void
  editMode?: boolean
  initialTitle?: string
  initialContent?: string
  initialType?: ItemType
  initialColor?: NoteColor
  initialTags?: string[]
  initialPinned?: boolean
}

const COLOR_OPTIONS: { key: NoteColor; label: string; bg: string }[] = [
  { key: 'default', label: 'Paper (Default)', bg: '#fdfcf7' },
  { key: 'yellow', label: 'Warm Sun', bg: '#fef9c3' },
  { key: 'coral', label: 'Soft Peach', bg: '#fee2e2' },
  { key: 'mint', label: 'Fresh Sage', bg: '#dcfce7' },
  { key: 'sky', label: 'Gentle Sky', bg: '#e0f2fe' },
  { key: 'lavender', label: 'Lavender Dusk', bg: '#f3e8ff' },
]

export function ComposerModal({
  onClose,
  onSave,
  editMode = false,
  initialTitle = '',
  initialContent = '',
  initialType = 'task',
  initialColor = 'default',
  initialTags = [],
  initialPinned = false,
}: ComposerModalProps) {
  const [type, setType] = useState<ItemType>(initialType)
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [color, setColor] = useState<NoteColor>(initialColor)
  const [tags, setTags] = useState<string[]>(initialTags)
  const [tagInput, setTagInput] = useState('')
  const [pinned, setPinned] = useState(initialPinned)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const dialogRef = useFocusTrap<HTMLFormElement>()
  const submitted = useRef(false)

  const isDirty =
    title.trim().length > 0 ||
    content.trim().length > 0 ||
    type !== initialType ||
    color !== initialColor ||
    pinned !== initialPinned ||
    tags.length !== initialTags.length

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleAddTag() {
    const cleanTag = tagInput.trim().toLowerCase().replace(/^#+/, '')
    if (cleanTag && !tags.includes(cleanTag) && tags.length < 10) {
      setTags([...tags, cleanTag])
      setTagInput('')
    }
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddTag()
    }
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  function insertFormatting(prefix: string, suffix: string = '') {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentVal = content
    const selected = currentVal.substring(start, end)
    const replacement = `${prefix}${selected || 'text'}${suffix}`

    const nextVal = currentVal.substring(0, start) + replacement + currentVal.substring(end)
    setContent(nextVal)

    // Re-focus and set selection
    setTimeout(() => {
      textarea.focus()
      const newPos = start + prefix.length + (selected ? selected.length : 4)
      textarea.setSelectionRange(newPos, newPos)
    }, 10)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitted.current) return
    if (!title.trim()) return
    if (!editMode) submitted.current = true
    onSave(title, content, type, color, tags, pinned)
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
        ref={dialogRef}
        className={`composer-modal composer-color-${color}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-modal-title"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{editMode ? 'edit' : 'new'}</span>
            <h2 id="composer-modal-title">
              {editMode ? 'Update your entry.' : 'Put it somewhere.'}
            </h2>
          </div>
          <div className="modal-header-actions">
            <button
              type="button"
              className={`icon-button pin-toggle ${pinned ? 'active' : ''}`}
              onClick={() => setPinned(!pinned)}
              title={pinned ? 'Unpin note' : 'Pin to top'}
              aria-label="Toggle pin"
            >
              <Pin size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close composer"
            >
              <X size={19} />
            </button>
          </div>
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

        <label htmlFor="composer-title" className="visually-hidden">
          Title
        </label>
        <input
          id="composer-title"
          className="title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          autoFocus
          maxLength={200}
        />

        <label htmlFor="composer-content" className="visually-hidden">
          Content
        </label>
        <textarea
          ref={textareaRef}
          id="composer-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write whatever you don't want to forget... (Supports markdown: **bold**, *italic*, - bullet, - [ ] todo)"
          rows={6}
          maxLength={5000}
        />

        {/* Tag chips and input */}
        <div className="composer-tags-section">
          <div className="tags-container">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
                #{tag}
                <button
                  type="button"
                  className="tag-remove"
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          {tags.length < 10 && (
            <div className="tag-input-row">
              <input
                className="tag-text-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add tag (e.g. work, ideas)..."
                maxLength={30}
              />
              {tagInput.trim() && (
                <button
                  type="button"
                  className="tag-add-btn"
                  onClick={handleAddTag}
                  title="Add tag"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Markdown Toolbar below tags */}
        <div className="markdown-toolbar">
          <button
            type="button"
            className="format-btn"
            onClick={() => insertFormatting('**', '**')}
            title="Bold (**text**)"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            className="format-btn"
            onClick={() => insertFormatting('*', '*')}
            title="Italic (*text*)"
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            className="format-btn"
            onClick={() => insertFormatting('- ')}
            title="Bullet list (- item)"
          >
            <List size={13} />
          </button>
          <button
            type="button"
            className="format-btn"
            onClick={() => insertFormatting('- [ ] ')}
            title="Checklist (- [ ] task)"
          >
            <CheckSquare size={13} />
          </button>
          <button
            type="button"
            className="format-btn"
            onClick={() => insertFormatting('`', '`')}
            title="Inline code (`code`)"
          >
            <Code size={13} />
          </button>
        </div>

        {/* Color Palette Selector */}
        <div className="composer-color-picker">
          <span className="color-label">Color:</span>
          <div className="color-swatches">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`color-swatch ${color === opt.key ? 'selected' : ''}`}
                style={{ backgroundColor: opt.bg }}
                onClick={() => setColor(opt.key)}
                title={opt.label}
                aria-label={opt.label}
              />
            ))}
          </div>
        </div>

        <button className="save-button" type="submit">
          {editMode ? 'Update' : `Save ${type}`}
        </button>
      </motion.form>
    </motion.div>
  )
}
