export type ItemType = 'task' | 'note'

export interface NoteItem {
  id: string
  title: string
  content: string
  type: ItemType
  completed: boolean
  notificationState?: 'pending' | 'delivered'
  deletedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export type ItemFilter = 'all' | 'tasks' | 'notes' | 'completed'
