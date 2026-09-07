export type ItemType = 'task' | 'note'

export interface NoteItem {
  id: string
  title: string
  content: string
  type: ItemType
  completed: boolean
  notificationState?: 'pending' | 'delivered'
  createdAt?: string
  updatedAt?: string
}

export type ItemFilter = 'all' | 'tasks' | 'notes' | 'completed'
