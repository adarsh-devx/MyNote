import { Schema, model, type HydratedDocument } from 'mongoose'
import type { ItemType, NotificationState } from '../types/item.js'

export interface Item {
  userId: string
  title: string
  content: string
  type: ItemType
  completed: boolean
  notificationState: NotificationState
  createdAt: Date
  updatedAt: Date
}

const itemSchema = new Schema<Item>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
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
    notificationState: {
      type: String,
      default: 'pending',
      enum: ['pending', 'delivered'],
    },
  },
  {
    timestamps: true,
  },
)

itemSchema.index({ userId: 1, createdAt: -1 })

export type ItemDocument = HydratedDocument<Item>
export const ItemModel = model<Item>('Item', itemSchema)
