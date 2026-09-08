import { ItemModel, type Item, type ItemDocument } from '../models/Item.js'
import type { CreateItemInput, UpdateItemInput } from '../types/item.js'

/**
 * Item business logic. Every function receives the authenticated userId from
 * the server (never from the client) and scopes all queries by it.
 */

export async function getItems(userId: string): Promise<Item[]> {
  return ItemModel.find({ userId }).sort({ createdAt: -1 }).lean()
}

export async function createItem(
  userId: string,
  data: CreateItemInput,
): Promise<ItemDocument> {
  return ItemModel.create({
    userId,
    title: data.title,
    content: data.content,
    type: data.type,
    completed: false,
    notificationState: 'pending',
  })
}

export async function updateItem(
  userId: string,
  itemId: string,
  data: UpdateItemInput,
): Promise<Item | null> {
  return ItemModel.findOneAndUpdate(
    { _id: itemId, userId },
    data,
    { new: true, runValidators: true },
  ).lean()
}

export async function deleteItem(userId: string, itemId: string): Promise<boolean> {
  const result = await ItemModel.deleteOne({ _id: itemId, userId })
  return result.deletedCount > 0
}

/** Count of pending task notifications for the user (privacy-safe: count only). */
export async function getPendingNotifications(userId: string): Promise<number> {
  return ItemModel.countDocuments({
    userId,
    type: 'task',
    notificationState: 'pending',
  })
}

/** Mark all pending task notifications as delivered. Returns the modified count. */
export async function markNotificationsDelivered(userId: string): Promise<number> {
  const result = await ItemModel.updateMany(
    {
      userId,
      type: 'task',
      notificationState: 'pending',
    },
    {
      notificationState: 'delivered',
    },
  )
  return result.modifiedCount
}
