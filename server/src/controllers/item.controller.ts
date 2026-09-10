import type { NextFunction, Request, Response } from 'express'
import type { Item } from '../models/Item.js'
import * as itemService from '../services/item.service.js'
import { addSSEClient, broadcastSSE, removeSSEClient } from '../services/sse.service.js'
import type { CreateItemInput, ItemDTO, UpdateItemInput } from '../types/item.js'
import { getCurrentUserId } from '../utils/current-user.js'

/** Map a lean item document to the exact API response shape used since Phase 2. */
function toItemDTO(item: Item): ItemDTO {
  return {
    id: item._id.toString(),
    title: item.title,
    content: item.content,
    type: item.type,
    completed: item.completed,
    pinned: item.pinned ?? false,
    color: (item.color as any) ?? 'default',
    tags: item.tags ?? [],
    order: item.order ?? 0,
    notificationState: item.notificationState,
    deletedAt: item.deletedAt?.toISOString() ?? null,
    createdAt: item.createdAt?.toISOString() ?? null,
    updatedAt: item.updatedAt?.toISOString() ?? null,
    // Echoed only when present (offline-first Phase 2 idempotent create);
    // legacy documents lack the field, so legacy responses are unchanged.
    ...(item.clientRequestId !== undefined
      ? { clientRequestId: item.clientRequestId }
      : {}),
  }
}

export function streamItemEvents(req: Request, res: Response): void {
  const userId = getCurrentUserId(req)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  addSSEClient(userId, res)
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`)

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n')
  }, 20000)

  req.on('close', () => {
    clearInterval(heartbeat)
    removeSSEClient(userId, res)
  })
}

export async function getItems(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = await itemService.getItems(getCurrentUserId(req))
    res.json(items.map(toItemDTO))
  } catch (error) {
    next(error)
  }
}

export async function createItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getCurrentUserId(req)
    const data = res.locals.validatedBody as CreateItemInput
    const item = await itemService.createItem(userId, data)
    broadcastSSE(userId, { type: 'ITEMS_UPDATED' })
    res.status(201).json(toItemDTO(item))
  } catch (error) {
    next(error)
  }
}

export async function updateItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getCurrentUserId(req)
    const data = res.locals.validatedBody as UpdateItemInput
    const itemId = req.params.id as string
    const item = await itemService.updateItem(
      userId,
      itemId,
      data,
    )
    if (!item) {
      res.status(404).json({ error: 'Item not found.' })
      return
    }
    broadcastSSE(userId, { type: 'ITEMS_UPDATED' })
    res.json(toItemDTO(item))
  } catch (error) {
    next(error)
  }
}

/** Soft-delete: mark item as deleted instead of removing it. */
export async function deleteItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getCurrentUserId(req)
    const itemId = req.params.id as string
    const deleted = await itemService.deleteItem(userId, itemId)
    if (!deleted) {
      res.status(404).json({ error: 'Item not found.' })
      return
    }
    broadcastSSE(userId, { type: 'ITEMS_UPDATED' })
    res.json({ message: 'Item deleted successfully.' })
  } catch (error) {
    next(error)
  }
}

/** Get all soft-deleted items for the current user. */
export async function getDeletedItems(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = await itemService.getDeletedItems(getCurrentUserId(req))
    res.json(items.map(toItemDTO))
  } catch (error) {
    next(error)
  }
}

/** Restore a soft-deleted item. */
export async function restoreItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getCurrentUserId(req)
    const itemId = req.params.id as string
    const item = await itemService.restoreItem(userId, itemId)
    if (!item) {
      res.status(404).json({ error: 'Item not found.' })
      return
    }
    broadcastSSE(userId, { type: 'ITEMS_UPDATED' })
    res.json(toItemDTO(item))
  } catch (error) {
    next(error)
  }
}

/** Permanently delete an item from the database. */
export async function permanentDeleteItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getCurrentUserId(req)
    const itemId = req.params.id as string
    const deleted = await itemService.permanentDeleteItem(
      userId,
      itemId,
    )
    if (!deleted) {
      res.status(404).json({ error: 'Item not found.' })
      return
    }
    broadcastSSE(userId, { type: 'ITEMS_UPDATED' })
    res.json({ message: 'Item permanently deleted.' })
  } catch (error) {
    next(error)
  }
}

/** Permanently delete all soft-deleted items (empty trash). */
export async function emptyTrash(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getCurrentUserId(req)
    const count = await itemService.emptyTrash(userId)
    broadcastSSE(userId, { type: 'ITEMS_UPDATED' })
    res.json({ message: 'Trash emptied successfully.', count })
  } catch (error) {
    next(error)
  }
}

// GET /notifications/pending - Get count of pending task notifications
export async function getPendingNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const count = await itemService.getPendingNotifications(getCurrentUserId(req))
    res.json({ count })
  } catch (error) {
    next(error)
  }
}

// POST /notifications/delivered - Mark all pending notifications as delivered
export async function markNotificationsDelivered(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const modifiedCount = await itemService.markNotificationsDelivered(
      getCurrentUserId(req),
    )
    res.json({
      message: 'Notifications marked as delivered.',
      modifiedCount,
    })
  } catch (error) {
    next(error)
  }
}
