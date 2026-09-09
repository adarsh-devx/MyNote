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
  /**
   * Stable client-side identity used as the React render key (offline-first).
   * Assigned by the local store and preserved across the local-id → server-id
   * reconciliation; server-fetched items have none (the render key then falls
   * back to a deterministic derivation of the server id). Never sent to the API.
   */
  clientId?: string
}

export type ItemFilter = 'all' | 'tasks' | 'notes' | 'completed'
