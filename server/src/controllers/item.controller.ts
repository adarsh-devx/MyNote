import type { NextFunction, Request, Response } from 'express'
import type { ItemDocument } from '../models/Item.js'
import * as itemService from '../services/item.service.js'
import type { CreateItemInput, ItemDTO, UpdateItemInput } from '../types/item.js'
import { getCurrentUserId } from '../utils/current-user.js'

/** Map a Mongoose item document to the exact API response shape used since Phase 2. */
function toItemDTO(item: ItemDocument): ItemDTO {
  return {
    id: item._id.toString(),
    title: item.title,
    content: item.content,
    type: item.type,
    completed: item.completed,
    notificationState: item.notificationState,
    createdAt: item.createdAt?.toISOString() ?? null,
    updatedAt: item.updatedAt?.toISOString() ?? null,
  }
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
    const data = res.locals.validatedBody as CreateItemInput
    const item = await itemService.createItem(getCurrentUserId(req), data)
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
    const data = res.locals.validatedBody as UpdateItemInput
    const itemId = req.params.id as string
    const item = await itemService.updateItem(
      getCurrentUserId(req),
      itemId,
      data,
    )
    if (!item) {
      res.status(404).json({ error: 'Item not found.' })
      return
    }
    res.json(toItemDTO(item))
  } catch (error) {
    next(error)
  }
}

export async function deleteItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const itemId = req.params.id as string
    const deleted = await itemService.deleteItem(getCurrentUserId(req), itemId)
    if (!deleted) {
      res.status(404).json({ error: 'Item not found.' })
      return
    }
    res.json({ message: 'Item deleted successfully.' })
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
