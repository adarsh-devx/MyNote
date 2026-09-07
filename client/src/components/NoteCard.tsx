import { Pencil, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Check } from '../components/animate-ui/icons/check'
import type { NoteItem } from '../types/note'

interface NoteCardProps {
  item: NoteItem
  onDelete: (id: string) => void
  onToggleTask: (id: string) => void
  onEdit: (item: NoteItem) => void
}

export function NoteCard({
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
            {item.completed && <Check size={14} />}
          </span>
          {item.completed ? 'Completed' : 'Mark complete'}
        </button>
      )}
    </motion.article>
  )
}
