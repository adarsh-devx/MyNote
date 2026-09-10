import {
  withTransaction,
  STORE_ITEMS,
  STORE_SYNC_QUEUE,
} from './db'
import { localItemToNoteItem, noteItemToLocalItem } from './authCache'
import { syncNow } from './syncEngine'
import type { LocalItem, NewSyncQueueItem, SyncQueueItem } from './syncTypes'
import type { ItemType, NoteColor, NoteItem } from '../types/note'

/**
 * Phase 3 local-first mutation layer.
 *
 * Every mutation follows the same write-ahead path:
 *   1. apply (or delete) the local item record,
 *   2. append the corresponding sync-operation to the durable queue,
 *     3. in ONE IndexedDB readwrite transaction,
 *   4. return the resulting item state for the React UI,
 *   5. fire a best-effort background sync drain (offline: it simply fails
 *      and the op waits; online: it drains immediately).
 *
 * There is no separate "online mutation" and "offline mutation": the local
 * commit always happens first and the network is always the background step,
 * exactly the same way for a connected and a disconnected user.
 *
 * Identity: locally-created items get a stable `local-<uuid>` id and a stable
 * `clientId` (crypto.randomUUID()). The `create` op is replayed to the server
 * with `clientRequestId = <opId>` (see syncEngine) and, once acknowledged,
 * the record is re-keyed to the canonical server id while `clientId` never
 * changes. `serverId` carries the canonical id for queue replays in between.
 */

function nowIso(): string {
  return new Date().toISOString()
}

/** Create a note/task immediately and persist the CREATE operation. */
export async function createItemLocalFirst(input: {
  title: string
  content: string
  type: ItemType
  pinned?: boolean
  color?: NoteColor
  tags?: string[]
}): Promise<NoteItem> {
  const local: LocalItem = {
    id: `local-${crypto.randomUUID()}`,
    clientId: crypto.randomUUID(),
    title: input.title,
    content: input.content,
    type: input.type,
    completed: false,
    pinned: input.pinned ?? false,
    color: input.color ?? 'default',
    tags: input.tags ?? [],
    deletedAt: null,
    createdAt: null,
    updatedAt: null,
    serverId: null,
    dirty: true,
  }
  const createdAt = nowIso()
  const op: NewSyncQueueItem = {
    opId: crypto.randomUUID(),
    type: 'create',
    itemId: local.id,
    payload: { item: local },
    createdAt,
    attempts: 0,
  }

  await withTransaction([STORE_ITEMS, STORE_SYNC_QUEUE], 'readwrite', async (tx) => {
    await tx.request(tx.store(STORE_ITEMS).put(local))
    await tx.request(tx.store(STORE_SYNC_QUEUE).add(op))
  })

  void syncNow()
  return localItemToNoteItem(local)
}

/**
 * Apply an edit (title/content/type/color/tags/pinned) and persist the UPDATE operation.
 * Absolute field values, matching the API's PATCH semantics. Returns the
 * updated item, or undefined when the item is no longer in the local store
 * (e.g. it was permanently deleted meanwhile) — the caller should drop it.
 */
export async function updateItemLocalFirst(
  id: string,
  patch: {
    title: string
    content: string
    type: ItemType
    pinned?: boolean
    color?: NoteColor
    tags?: string[]
  },
): Promise<NoteItem | undefined> {
  const updated = await withTransaction(
    [STORE_ITEMS, STORE_SYNC_QUEUE],
    'readwrite',
    async (tx) => {
      const itemsStore = tx.store(STORE_ITEMS)
      const local = (await tx.request(itemsStore.get(id))) as
        | LocalItem
        | undefined
      if (!local) return undefined

      const next: LocalItem = {
        ...local,
        title: patch.title,
        content: patch.content,
        type: patch.type,
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        dirty: true,
      }
      const op: NewSyncQueueItem = {
        opId: crypto.randomUUID(),
        type: 'update',
        itemId: id,
        payload: {
          title: patch.title,
          content: patch.content,
          type: patch.type,
          pinned: next.pinned,
          color: next.color,
          tags: next.tags,
        },
        createdAt: nowIso(),
        attempts: 0,
      }
      await tx.request(itemsStore.put(next))
      await tx.request(tx.store(STORE_SYNC_QUEUE).add(op))
      return next
    },
  )

  if (updated) void syncNow()
  return updated ? localItemToNoteItem(updated) : undefined
}

/**
 * Toggle task completion and persist the TOGGLE operation. The payload is the
 * ABSOLUTE target (never a delta), so retries are naturally idempotent.
 * A no-op (already at the target) writes nothing and enqueues nothing.
 */
export async function toggleItemLocalFirst(
  id: string,
  completed: boolean,
): Promise<NoteItem | undefined> {
  const updated = await withTransaction(
    [STORE_ITEMS, STORE_SYNC_QUEUE],
    'readwrite',
    async (tx) => {
      const itemsStore = tx.store(STORE_ITEMS)
      const local = (await tx.request(itemsStore.get(id))) as
        | LocalItem
        | undefined
      if (!local) return undefined
      if (local.completed === completed) return local

      const next: LocalItem = { ...local, completed, dirty: true }
      const op: NewSyncQueueItem = {
        opId: crypto.randomUUID(),
        type: 'toggle',
        itemId: id,
        payload: { completed },
        createdAt: nowIso(),
        attempts: 0,
      }
      await tx.request(itemsStore.put(next))
      await tx.request(tx.store(STORE_SYNC_QUEUE).add(op))
      return next
    },
  )

  if (updated) void syncNow()
  return updated ? localItemToNoteItem(updated) : undefined
}

/**
 * Toggle pin status and persist the UPDATE/PIN operation.
 */
export async function togglePinItemLocalFirst(
  id: string,
  pinned: boolean,
  fallbackItem?: NoteItem,
): Promise<NoteItem | undefined> {
  const updated = await withTransaction(
    [STORE_ITEMS, STORE_SYNC_QUEUE],
    'readwrite',
    async (tx) => {
      const itemsStore = tx.store(STORE_ITEMS)
      let local = (await tx.request(itemsStore.get(id))) as
        | LocalItem
        | undefined

      if (!local && fallbackItem) {
        local = noteItemToLocalItem(fallbackItem)
      } else if (!local) {
        return undefined
      }

      if (Boolean(local.pinned) === pinned) return local

      const next: LocalItem = { ...local, pinned, dirty: true }
      const op: NewSyncQueueItem = {
        opId: crypto.randomUUID(),
        type: 'update',
        itemId: id,
        payload: { pinned },
        createdAt: nowIso(),
        attempts: 0,
      }
      await tx.request(itemsStore.put(next))
      await tx.request(tx.store(STORE_SYNC_QUEUE).add(op))
      return next
    },
  )

  if (updated) void syncNow()
  return updated ? localItemToNoteItem(updated) : undefined
}

/**
 * Soft-delete an item: set `deletedAt` locally (it leaves the active list and
 * becomes available in the trash) and persist the SOFT-DELETE operation. The
 * record itself is kept for the trash — never permanently removed here.
 * A no-op (already deleted) writes nothing.
 *
 * Phase 5 ordering guarantees:
 *   - DELETE → RESTORE: RESTORE clears deletedAt, both ops queued. Final
 *     state: active (RESTORE wins because it is the newer operation).
 *   - RESTORE → DELETE: DELETE sets deletedAt, both ops queued. Final
 *     state: deleted (DELETE wins because it is the newer operation).
 *   - DELETE → UPDATE: UPDATE modifies fields, both ops queued. Final
 *     state: deleted (soft-delete is an atomic server operation; the UPDATE
 *     may fail with 404 if the server processes DELETE first, which is safe
 *     — the item is already deleted).
 *   - CREATE → DELETE: If CREATE is still pending, DELETE cancels the CREATE
 *     and all dependent ops (see permanentDeleteItemLocalFirst). If CREATE
 *     has synced, DELETE queues a SOFT_DELETE that the server processes.
 */
export async function softDeleteItemLocalFirst(
  id: string,
): Promise<NoteItem | undefined> {
  const updated = await withTransaction(
    [STORE_ITEMS, STORE_SYNC_QUEUE],
    'readwrite',
    async (tx) => {
      const itemsStore = tx.store(STORE_ITEMS)
      const local = (await tx.request(itemsStore.get(id))) as
        | LocalItem
        | undefined
      if (!local) return undefined
      if (local.deletedAt !== null) return local

      const next: LocalItem = { ...local, deletedAt: nowIso(), dirty: true }
      const op: NewSyncQueueItem = {
        opId: crypto.randomUUID(),
        type: 'soft-delete',
        itemId: id,
        payload: {},
        createdAt: nowIso(),
        attempts: 0,
      }
      await tx.request(itemsStore.put(next))
      await tx.request(tx.store(STORE_SYNC_QUEUE).add(op))
      return next
    },
  )

  if (updated) void syncNow()
  return updated ? localItemToNoteItem(updated) : undefined
}

/**
 * Restore a soft-deleted item: clear `deletedAt` locally so it returns to the
 * active list, and persist the RESTORE operation. A no-op (already active)
 * writes nothing.
 *
 * Phase 5 notification safety: restoring a deleted task does NOT resurrect
 * an old pending notification. The server's soft-delete marks notificationState
 * as 'delivered' atomically, so the old notification is permanently cancelled.
 * The restored item starts fresh with whatever notificationState the server
 * returns — typically 'delivered' (since the delete set it), which means no
 * notification will fire for the restored item.
 */
export async function restoreItemLocalFirst(
  id: string,
): Promise<NoteItem | undefined> {
  const updated = await withTransaction(
    [STORE_ITEMS, STORE_SYNC_QUEUE],
    'readwrite',
    async (tx) => {
      const itemsStore = tx.store(STORE_ITEMS)
      const local = (await tx.request(itemsStore.get(id))) as
        | LocalItem
        | undefined
      if (!local) return undefined
      if (local.deletedAt === null) return local

      const next: LocalItem = { ...local, deletedAt: null, dirty: true }
      const op: NewSyncQueueItem = {
        opId: crypto.randomUUID(),
        type: 'restore',
        itemId: id,
        payload: {},
        createdAt: nowIso(),
        attempts: 0,
      }
      await tx.request(itemsStore.put(next))
      await tx.request(tx.store(STORE_SYNC_QUEUE).add(op))
      return next
    },
  )

  if (updated) void syncNow()
  return updated ? localItemToNoteItem(updated) : undefined
}

/**
 * Permanently delete an item: remove the local record and persist (or cancel)
 * queue operations — all in one transaction.
 *
 *   - If the item still has a pending CREATE (never reached the server), the
 *     create is CANCELLED: no server request is ever generated for it, and
 *     every dependent op (update/toggle/delete/restore) is removed with it.
 *     This prevents creating an item on the server merely to immediately
 *     delete it — the item never existed server-side, so deletion is a no-op.
 *
 *   - Otherwise a PERMANENT-DELETE op is enqueued (or kept, if one already
 *     exists), superseding all pending ops for the item. The local record is
 *     removed immediately; the op carries the canonical server id so it can
 *     still reach the server after the record is gone.
 *
 * Phase 5 ordering guarantees:
 *   - CREATE → PERMANENT DELETE: CREATE is cancelled, no server request.
 *   - UPDATE → PERMANENT DELETE: UPDATE is removed, PERMANENT-DELETE queued.
 *   - SOFT DELETE → PERMANENT DELETE: SOFT-DELETE is removed, PERMANENT-DELETE
 *     queued. If the server already processed the soft-delete, the permanent
 *     delete still removes the item from the database.
 *   - RESTORE → PERMANENT DELETE: RESTORE is removed, PERMANENT-DELETE queued.
 *     The item is permanently removed regardless of its current server state.
 */
export async function permanentDeleteItemLocalFirst(id: string): Promise<void> {
  await withTransaction([STORE_ITEMS, STORE_SYNC_QUEUE], 'readwrite', async (tx) => {
    const itemsStore = tx.store(STORE_ITEMS)
    const queueStore = tx.store(STORE_SYNC_QUEUE)
    const queued = (await tx.request(
      queueStore.index('by_itemId').getAll(id),
    )) as SyncQueueItem[]

    const hasPendingCreate = queued.some((op) => op.type === 'create')

    if (hasPendingCreate) {
      // The item never reached the server: removing it locally (and its
      // whole queue tail) is the complete operation. No server request.
      await tx.request(itemsStore.delete(id))
      for (const op of queued) {
        await tx.request(queueStore.delete(op.seq))
      }
      return
    }

    await tx.request(itemsStore.delete(id))
    let hasPermanentDelete = false
    for (const op of queued) {
      if (op.type === 'permanent-delete') {
        hasPermanentDelete = true
      } else {
        // Dependent ops can no longer have meaning once the item is gone.
        await tx.request(queueStore.delete(op.seq))
      }
    }
    if (!hasPermanentDelete) {
      const op: NewSyncQueueItem = {
        opId: crypto.randomUUID(),
        type: 'permanent-delete',
        itemId: id,
        payload: {},
        createdAt: nowIso(),
        attempts: 0,
      }
      await tx.request(queueStore.add(op))
    }
  })

  void syncNow()
}