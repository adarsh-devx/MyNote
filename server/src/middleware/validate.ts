import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import type { CreateItemInput, ItemType, UpdateItemInput } from '../types/item.js'

/**
 * Request validation for item endpoints.
 * The rules and error messages are identical to the Phase 2 implementation;
 * only the location changed (out of the route handlers, into reusable middleware).
 *
 * Only title / content / type / completed are accepted from the client.
 * userId, _id, createdAt, updatedAt, and notificationState are never client-controlled.
 */

type ParseResult<T> = { error: string } | { data: T }

/** Parse + validate a create-item body. Pure function, same messages as Phase 2. */
export function parseCreateItemBody(body: unknown): ParseResult<CreateItemInput> {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be an object.' }
  }

  const data = body as Record<string, unknown>
  const title = data.title
  const content = data.content ?? ''
  const type = data.type

  if (typeof title !== 'string' || title.trim().length === 0) {
    return { error: 'Title is required and must be non-empty.' }
  }
  if (title.trim().length > 200) {
    return { error: 'Title must be 200 characters or less.' }
  }
  if (typeof content !== 'string') {
    return { error: 'Content must be a string.' }
  }
  if (content.length > 5000) {
    return { error: 'Content must be 5000 characters or less.' }
  }
  if (type !== 'task' && type !== 'note') {
    return { error: 'Type must be either task or note.' }
  }

  // Optional idempotency key (offline-first Phase 2). Never required —
  // legacy clients that omit it keep the exact previous behavior.
  const rawClientRequestId = data.clientRequestId
  let clientRequestId: string | undefined
  if (rawClientRequestId !== undefined) {
    if (typeof rawClientRequestId !== 'string') {
      return { error: 'clientRequestId must be a string.' }
    }
    const trimmedId = rawClientRequestId.trim()
    if (trimmedId.length === 0) {
      return { error: 'clientRequestId must not be empty.' }
    }
    if (trimmedId.length > 100) {
      return { error: 'clientRequestId must be 100 characters or less.' }
    }
    // Standard UUID shape (any version, case-insensitive) — the client
    // generates crypto.randomUUID() values. Normalized to lowercase so the
    // unique index treats "A…"/"a…" as the same idempotency key.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedId)) {
      return { error: 'clientRequestId must be a valid UUID.' }
    }
    clientRequestId = trimmedId.toLowerCase()
  }

  return {
    data: {
      title: title.trim(),
      content: content.trim(),
      type: type as ItemType,
      ...(clientRequestId !== undefined ? { clientRequestId } : {}),
    },
  }
}

/** Parse + validate an update-item body. Pure function, same messages as Phase 2. */
export function parseUpdateItemBody(body: unknown): ParseResult<UpdateItemInput> {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be an object.' }
  }

  const data = body as Record<string, unknown>
  const update: UpdateItemInput = {}

  if (data.title !== undefined) {
    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      return { error: 'Title must be a non-empty string.' }
    }
    if (data.title.trim().length > 200) {
      return { error: 'Title must be 200 characters or less.' }
    }
    update.title = data.title.trim()
  }

  if (data.content !== undefined) {
    if (typeof data.content !== 'string') {
      return { error: 'Content must be a string.' }
    }
    if (data.content.length > 5000) {
      return { error: 'Content must be 5000 characters or less.' }
    }
    update.content = data.content.trim()
  }

  if (data.type !== undefined) {
    if (data.type !== 'task' && data.type !== 'note') {
      return { error: 'Type must be either task or note.' }
    }
    update.type = data.type as ItemType
  }

  if (data.completed !== undefined) {
    if (typeof data.completed !== 'boolean') {
      return { error: 'Completed must be a boolean.' }
    }
    update.completed = data.completed
  }

  if (Object.keys(update).length === 0) {
    return { error: 'No valid fields to update.' }
  }

  return { data: update }
}

function rejectWith(res: Response, error: string): void {
  res.status(400).json({ error })
}

/** Middleware: reject requests whose :id param is not a valid Mongo ObjectId. */
export const validateItemIdParam: RequestHandler = (req, res, next) => {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    rejectWith(res, 'Invalid item id.')
    return
  }
  next()
}

/** Middleware: validate the create-item body and pass it via res.locals.validatedBody. */
export function validateCreateItem(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const parsed = parseCreateItemBody(req.body)
  if ('error' in parsed) {
    rejectWith(res, parsed.error)
    return
  }
  res.locals.validatedBody = parsed.data
  next()
}

/** Middleware: validate the update-item body and pass it via res.locals.validatedBody. */
export function validateUpdateItem(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const parsed = parseUpdateItemBody(req.body)
  if ('error' in parsed) {
    rejectWith(res, parsed.error)
    return
  }
  res.locals.validatedBody = parsed.data
  next()
}
