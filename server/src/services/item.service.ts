import { ItemModel, type Item, type ItemDocument } from '../models/Item.js'
import type { CreateItemInput, UpdateItemInput } from '../types/item.js'

/**
 * Item business logic. Every function receives the authenticated userId from
 * the server (never from the client) and scopes all queries by it.
 */

/** Active items only (deletedAt is null). Auto-purges items trashed > 30 days ago. */
export async function getItems(userId: string): Promise<Item[]> {
  // Opportunistic auto-purge of items in trash older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  void ItemModel.deleteMany({ userId, deletedAt: { $ne: null, $lt: thirtyDaysAgo } }).catch(() => {})

  return ItemModel.find({ userId, deletedAt: null }).sort({ pinned: -1, order: 1, createdAt: -1 }).lean()
}

export async function createItem(
  userId: string,
  data: CreateItemInput,
): Promise<ItemDocument> {
  // Idempotent create (offline-first Phase 2): when the client supplies a
  // clientRequestId, a retried or lost-response create must return the
  // ORIGINAL item instead of duplicating it. The lookup is always scoped by
  // the server-derived userId — the uniqueness boundary is
  // (userId, clientRequestId), never clientRequestId alone, so two users
  // may use the same key for two different items.
  if (data.clientRequestId !== undefined) {
    const existing = await ItemModel.findOne({
      userId,
      clientRequestId: data.clientRequestId,
    })
    if (existing) {
      return existing
    }
  }

  try {
    return await ItemModel.create({
      userId,
      title: data.title,
      content: data.content,
      type: data.type,
      completed: false,
      pinned: data.pinned ?? false,
      color: data.color ?? 'default',
      tags: data.tags ?? [],
      order: data.order ?? 0,
      notificationState: 'pending',
      deletedAt: null,
      // Omitted entirely when absent — existing/legacy documents must keep
      // lacking the field so the sparse unique index never sees them.
      ...(data.clientRequestId !== undefined
        ? { clientRequestId: data.clientRequestId }
        : {}),
    })
  } catch (error) {
    // Race: two identical creates arriving concurrently — the sparse unique
    // index { userId, clientRequestId } lets exactly one insert win and
    // rejects the loser with a duplicate-key error (code 11000). The loser
    // re-queries and returns the winner; no error is surfaced to either
    // caller. Any other failure (or a 11000 whose re-query finds nothing —
    // i.e. not from this index) is rethrown unchanged.
    if (data.clientRequestId !== undefined && isDuplicateKeyError(error)) {
      const winner = await ItemModel.findOne({
        userId,
        clientRequestId: data.clientRequestId,
      })
      if (winner) {
        return winner
      }
    }
    throw error
  }
}

/** True when the error is a MongoDB duplicate-key violation (code 11000). */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  )
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

/** Permanently delete ALL soft-deleted items in trash for the current user. */
export async function emptyTrash(userId: string): Promise<number> {
  const result = await ItemModel.deleteMany({ userId, deletedAt: { $ne: null } })
  return result.deletedCount
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
