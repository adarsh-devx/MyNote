import { memo } from 'react'
import { Pencil, Pin, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { MarkdownContent } from './MarkdownContent'
import type { NoteItem } from '../types/note'

interface NoteCardProps {
  item: NoteItem
  onDelete: (id: string) => void
  onToggleTask: (id: string) => void
  onTogglePin?: (id: string) => void
  onEdit: (item: NoteItem) => void
}

// Memoized NoteCard: Home keeps every prop reference stable (the same `item`
// object for unaffected cards plus stable callback identities), so React.memo's
// default shallow comparison skips re-rendering the unaffected cards whenever a
// single item changes. No custom comparison function is needed.
export const NoteCard = memo(function NoteCard({
  item,
  onDelete,
  onToggleTask,
  onTogglePin,
  onEdit,
}: NoteCardProps) {
  const colorClass = item.color && item.color !== 'default' ? `note-color-${item.color}` : ''

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`note-card ${item.completed ? 'completed' : ''} ${item.pinned ? 'pinned' : ''} ${colorClass}`.trim()}
    >
      <div className="card-top">
        <div className="card-top-left">
          <span className={item.type === 'task' ? 'pill task' : 'pill note'}>
            {item.type === 'task' ? 'TASK' : 'NOTE'}
          </span>
          {item.pinned && (
            <span className="pinned-badge" title="Pinned Note">
              <Pin size={11} className="pin-icon-badge" />
            </span>
          )}
        </div>

        <div className="card-actions">
          {onTogglePin && (
            <button
              type="button"
              className={`card-action-btn pin-btn ${item.pinned ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin(item.id)
              }}
              aria-label={item.pinned ? 'Unpin note' : 'Pin note'}
              title={item.pinned ? 'Unpin note' : 'Pin note'}
            >
              <Pin size={13} style={item.pinned ? { transform: 'rotate(45deg)' } : undefined} />
            </button>
          )}
          <button
            type="button"
            className="card-action-btn edit-btn"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(item)
            }}
            aria-label={`Edit ${item.title}`}
            title="Edit note"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="card-action-btn delete-btn"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(item.id)
            }}
            aria-label={`Delete ${item.title}`}
            title="Delete note"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <h2>{item.title}</h2>
      <MarkdownContent content={item.content} />

      {item.tags && item.tags.length > 0 && (
        <div className="card-tags">
          {item.tags.map((tag) => (
            <span key={tag} className="tag-pill">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {item.type === 'task' && (
        <button
          className="complete-button"
          onClick={() => onToggleTask(item.id)}
        >
          <span className={item.completed ? 'check checked' : 'check'}>
            {item.completed && (
              <motion.svg
                xmlns="http://www.w3.org/2000/svg"
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial="initial"
                animate="animate"
              >
                <motion.path
                  d="m4 12 5 5L20 6"
                  variants={{
                    initial: { pathLength: 1, opacity: 1, scale: 1 },
                    animate: {
                      pathLength: [0, 1],
                      opacity: [0, 1],
                      scale: [1, 1.1, 1],
                      transition: { duration: 0.6, ease: 'easeInOut' },
                    },
                  }}
                />
              </motion.svg>
            )}
          </span>
          {item.completed ? 'Completed' : 'Mark complete'}
        </button>
      )}
    </motion.article>
  )
})
