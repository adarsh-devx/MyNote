/**
 * Domain + API types for items.
 * Single source of truth shared by models, services, and controllers.
 */

export type ItemType = 'note' | 'task'
export type NotificationState = 'pending' | 'delivered'
export type NoteColor = 'default' | 'yellow' | 'coral' | 'mint' | 'sky' | 'lavender'

/**
 * Validated payload for POST /api/items.
 *
 * `clientRequestId` is optional and client-generated (offline-first Phase 2):
 * an idempotency key for CREATE so a retried/lost-response request returns
 * the original item instead of duplicating it. Absent for all legacy clients.
 */
export interface CreateItemInput {
  title: string
  content: string
  type: ItemType
  pinned?: boolean
  color?: NoteColor
  tags?: string[]
  clientRequestId?: string
}

/** Validated payload for PATCH /api/items/:id (all fields optional). */
export interface UpdateItemInput {
  title?: string
  content?: string
  type?: ItemType
  completed?: boolean
  pinned?: boolean
  color?: NoteColor
  tags?: string[]
}

/** Shape returned by all item endpoints (identical to the Phase 2 response). */
export interface ItemDTO {
  id: string
  title: string
  content: string
  type: ItemType
  completed: boolean
  pinned?: boolean
  color?: NoteColor
  tags?: string[]
  notificationState: NotificationState
  deletedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  /**
   * Echoed only when the create supplied one (offline-first Phase 2). It is a
   * client-generated UUID — not sensitive — and lets the future sync layer
   * confirm which local operation a stored item corresponds to. Legacy
   * responses omit the field entirely (undefined is dropped by JSON.stringify).
   */
  clientRequestId?: string
}
