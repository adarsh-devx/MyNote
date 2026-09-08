import { ItemModel, type Item, type ItemDocument } from '../models/Item.js'
import type { CreateItemInput, UpdateItemInput } from '../types/item.js'

/**
 * Item business logic. Every function receives the authenticated userId from
 * the server (never from the client) and scopes all queries by it.
 */

/** Active items only (deletedAt is null). */
export async function getItems(userId: string): Promise<Item[]> {
  return ItemModel.find({ userId, deletedAt: null }).sort({ createdAt: -1 }).lean()
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
    deletedAt: null,
  })
}

export async function updateItem(
  userId: string,
  itemId: string,
  data: UpdateItemInput,
): Promise<Item | null> {
  return ItemModel.findOneAndUpdate(
    { _id: itemId, userId, deletedAt: null },
    data,
    { new: true, runValidators: true },
  ).lean()
}

/** Soft-delete: set deletedAt to now instead of removing the document.
 *  Also marks notificationState as 'delivered' so a pending notification is
 *  permanently cancelled — if the item is later restored, the old notification
 *  must not fire again. */
export async function deleteItem(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const result = await ItemModel.updateOne(
    { _id: itemId, userId, deletedAt: null },
    { deletedAt: new Date(), notificationState: 'delivered' },
  )
  return result.modifiedCount > 0
}

/** Deleted items only (deletedAt is not null). */
export async function getDeletedItems(userId: string): Promise<Item[]> {
  return ItemModel.find({ userId, deletedAt: { $ne: null } })
    .sort({ deletedAt: -1 })
    .lean()
}

/** Restore a soft-deleted item. */
export async function restoreItem(
  userId: string,
  itemId: string,
): Promise<Item | null> {
  return ItemModel.findOneAndUpdate(
    { _id: itemId, userId, deletedAt: { $ne: null } },
    { deletedAt: null },
    { new: true },
  ).lean()
}

/** Permanently delete an item from the database. */
export async function permanentDeleteItem(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const result = await ItemModel.deleteOne({ _id: itemId, userId })
  return result.deletedCount > 0
}

/** Count of pending task notifications for the user (privacy-safe: count only).
 *  Excludes soft-deleted items so they never generate notifications. */
export async function getPendingNotifications(userId: string): Promise<number> {
  return ItemModel.countDocuments({
    userId,
    type: 'task',
    notificationState: 'pending',
    deletedAt: null,
  })
}

/** Mark all pending task notifications as delivered. Returns the modified count.
 *  Excludes soft-deleted items. */
export async function markNotificationsDelivered(userId: string): Promise<number> {
  const result = await ItemModel.updateMany(
    {
      userId,
      type: 'task',
      notificationState: 'pending',
      deletedAt: null,
    },
    {
      notificationState: 'delivered',
    },
  )
  return result.modifiedCount
}
