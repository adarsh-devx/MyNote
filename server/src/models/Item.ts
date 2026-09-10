import { Schema, model, type HydratedDocument } from 'mongoose'
import type { ItemType, NotificationState } from '../types/item.js'

export interface Item {
  _id: { toString(): string }
  userId: string
  title: string
  content: string
  type: ItemType
  completed: boolean
  pinned: boolean
  color: string
  tags: string[]
  order: number
  notificationState: NotificationState
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  /**
   * Optional client-generated idempotency key for CREATE (offline-first
   * Phase 2). Existing documents never have this field; it must stay absent
   * (NOT null) so the sparse unique index ignores them.
   */
  clientRequestId?: string
}

const itemSchema = new Schema<Item>(
  {
    userId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      validate: {
        validator: (value: string) => value.trim().length > 0,
        message: 'Title must not be empty',
      },
    },
    content: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      required: true,
      enum: ['note', 'task'],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      default: 'default',
    },
    tags: {
      type: [String],
      default: [],
    },
    order: {
      type: Number,
      default: 0,
    },
    notificationState: {
      type: String,
      default: 'pending',
      enum: ['pending', 'delivered'],
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    clientRequestId: {
      // Idempotency key for offline create replay. No default on purpose:
      // documents without one must LACK the field entirely — a null value
      // would be indexed by the sparse index below and two legacy creates
      // for the same user would collide on (userId, null).
      type: String,
      maxlength: 100,
    },
  },
  {
    timestamps: true,
  },
)

itemSchema.index({ userId: 1, createdAt: -1 })
itemSchema.index({ userId: 1, deletedAt: 1 })
// Idempotent-create protection (offline-first Phase 2): unique per user, and
// sparse so the many existing documents without clientRequestId are excluded
// from the index and keep working unchanged.
itemSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true, sparse: true })

export type ItemDocument = HydratedDocument<Item>
export const ItemModel = model<Item>('Item', itemSchema)
