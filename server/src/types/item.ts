/**
 * Domain + API types for items.
 * Single source of truth shared by models, services, and controllers.
 */

export type ItemType = 'note' | 'task'
export type NotificationState = 'pending' | 'delivered'

/** Validated payload for POST /api/items. */
export interface CreateItemInput {
  title: string
  content: string
  type: ItemType
}

/** Validated payload for PATCH /api/items/:id (all fields optional). */
export interface UpdateItemInput {
  title?: string
  content?: string
  type?: ItemType
  completed?: boolean
}

/** Shape returned by all item endpoints (identical to the Phase 2 response). */
export interface ItemDTO {
  id: string
  title: string
  content: string
  type: ItemType
  completed: boolean
  notificationState: NotificationState
  deletedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}
