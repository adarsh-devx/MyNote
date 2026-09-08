import { memo } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { NoteItem } from '../types/note'

interface NoteCardProps {
  item: NoteItem
  onDelete: (id: string) => void
  onToggleTask: (id: string) => void
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
  onEdit,
}: NoteCardProps) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={item.completed ? 'note-card completed' : 'note-card'}
    >
      <div className="card-top">
        <span className={item.type === 'task' ? 'pill task' : 'pill note'}>
          {item.type === 'task' ? 'TASK' : 'NOTE'}
        </span>

        <div className="card-actions">
          <button
            className="icon-button"
            onClick={() => onEdit(item)}
            aria-label={`Edit ${item.title}`}
          >
            <Pencil size={14} />
          </button>
          <button
            className="delete-button"
            onClick={() => onDelete(item.id)}
            aria-label={`Delete ${item.title}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <h2>{item.title}</h2>
      <p>{item.content}</p>

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
