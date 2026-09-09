import {
  deleteItem,
  getAllItems,
  getAllSyncOperations,
  getCachedUser,
  getDeletedItems,
  getItem,
  putCachedUser,
  putItem,
  putItems,
} from './db'
import type { CachedAuthUser, LocalItem } from './syncTypes'
import type { NoteItem } from '../types/note'
import type { User } from '../types/user'

/**
 * Phase 1 read-through cache — the application-level policy layer on top of
 * db.ts (db.ts itself stays fail-loud, per the Phase 0 contract).
 *
 * Phase 1 scope:
 *   - IndexedDB is ONLY a read-through cache of server data; the server
 *     remains authoritative whenever reachable.
 *   - No offline mutations are queued here (that is Phase 3); the syncQueue
 *     store is untouched by this module.
 *   - Every cache operation is best-effort: if IndexedDB is unavailable
 *     (private mode, quota, corruption) the failure is logged and the app
 *     degrades to the pre-Phase-1 online-only behavior. Nothing here may
 *     break an online session.
 *
 * PRIVACY: only item data and the profile display snapshot are cached.
 * Passwords, OAuth access/refresh tokens, session cookies and session ids
 * are never stored — see CachedAuthUser in syncTypes.ts.
 */

/**
 * Run a cache operation, degrading to `fallback` on any IndexedDB failure.
 * Cache problems are diagnostics, never app errors, so they are logged and
 * swallowed at this layer (db.ts still throws cleanly underneath).
 */
async function safely<T>(
  label: string,
  operation: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    console.warn(`[authCache] ${label} failed:`, error)
    return fallback
  }
}

/**
 * Deterministic client identity for a server-cached item. Derived from the
 * server id, so it is stable across refreshes by construction (Phase 1H) and
 * ready to become the join key for Phase 3 sync-queue operations.
 */
export function stableClientIdFor(serverId: string): string {
  return `local-${serverId}`
}

/** NoteItem → LocalItem. Server data is always cached with dirty=false. */
export function noteItemToLocalItem(
  item: NoteItem,
  clientId?: string,
): LocalItem {
  return {
    id: item.id,
    clientId: clientId ?? stableClientIdFor(item.id),
    title: item.title,
    content: item.content,
    type: item.type,
    completed: item.completed,
    ...(item.notificationState !== undefined
      ? { notificationState: item.notificationState }
      : {}),
    deletedAt: item.deletedAt ?? null,
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
    dirty: false,
  }
}

/** LocalItem → NoteItem (the shape the existing UI components consume). */
export function localItemToNoteItem(local: LocalItem): NoteItem {
  const item: NoteItem = {
    id: local.id,
    title: local.title,
    content: local.content,
    type: local.type,
    completed: local.completed,
    // Stable render-key identity: survives the local-id → server-id flip at
    // canonicalization, so the React card is never remounted by a sync event.
    clientId: local.clientId,
  }
  if (local.notificationState !== undefined) {
    item.notificationState = local.notificationState
  }
  if (local.deletedAt !== null) item.deletedAt = local.deletedAt
  if (local.createdAt !== null) item.createdAt = local.createdAt
  if (local.updatedAt !== null) item.updatedAt = local.updatedAt
  return item
}

/** Strip cache bookkeeping fields — the UI consumes the plain User shape. */
export function cachedUserToUser(cached: CachedAuthUser): User {
  const user: User = { id: cached.id, name: cached.name, email: cached.email }
  if (cached.avatarUrl !== undefined) user.avatarUrl = cached.avatarUrl
  return user
}

// ---------------------------------------------------------------------------
// auth cache
// ---------------------------------------------------------------------------

/** The cached profile snapshot, or null when there is none. Never throws. */
export async function getCachedAuthUser(): Promise<CachedAuthUser | null> {
  return safely(
    'getCachedAuthUser',
    async () => (await getCachedUser()) ?? null,
    null,
  )
}

/**
 * Cache the profile snapshot after a successful GET /auth/me (or profile
 * update). `previous` preserves the original `cachedAt` on re-verification.
 * Display fields only — no credentials, ever.
 */
export async function putCachedAuthUser(
  user: User,
  previous?: CachedAuthUser | null,
): Promise<void> {
  const nowIso = new Date().toISOString()
  const record: Omit<CachedAuthUser, 'key'> = {
    id: user.id,
    name: user.name,
    email: user.email,
    cachedAt: previous?.cachedAt ?? nowIso,
    lastVerifiedAt: nowIso,
  }
  if (user.avatarUrl !== undefined) record.avatarUrl = user.avatarUrl
  await safely('putCachedAuthUser', () => putCachedUser(record), undefined)
}

// ---------------------------------------------------------------------------
// item snapshots
// ---------------------------------------------------------------------------

/** Upsert a server item, preserving an already-stored stable clientId. */
function mergeServerItem(
  existing: LocalItem | undefined,
  item: NoteItem,
): LocalItem {
  return noteItemToLocalItem(item, existing?.clientId)
}

// ── Merge utilities (Phase 5) ────────────────────────────────────────

/**
 * Merge a server snapshot into the local item store.
 *
 * Conflict strategy (Phase 5): last-write-wins at the item level, with
 * dirty-item protection. When a local item has pending queued operations
 * (dirty === true), the local version is ALWAYS preserved — the server
 * snapshot predates the local mutations and must not overwrite them.
 *
 * After successful sync, dirty becomes false and the next server pull
 * correctly adopts the server's (now-authoritative) state.
 *
 * Field-level conflicts (e.g. edit vs. toggle) are intentionally NOT
 * resolved at this layer — the PATCH API replaces whole items, and the
 * existing optimistic architecture already handles edit/delete/toggle
 * races correctly via the sync queue's FIFO ordering.
 *
 * @param serverItems  — items from GET /items or GET /items/deleted
 * @param existingMap  — Map of local item id → LocalItem
 * @param dirtyIds     — Set of local item ids with pending queued operations
 * @param filterFn     — which local items this snapshot governs (active vs. deleted)
 */
function mergeServerSnapshot(
  serverItems: readonly NoteItem[],
  existingMap: Map<string, LocalItem>,
  dirtyIds: Set<string>,
  filterFn: (record: LocalItem) => boolean,
): { upserts: LocalItem[]; staleIds: string[] } {
  const serverIds = new Set(serverItems.map((item) => item.id))

  // Upsert server items that are NOT dirty locally.
  const upserts = serverItems
    .filter((item) => !dirtyIds.has(item.id))
    .map((item) => mergeServerItem(existingMap.get(item.id), item))

  // Evict local items that this snapshot governs but the server no longer
  // reports — UNLESS they are dirty (pending local operations).
  const staleIds = [...existingMap.values()]
    .filter(
      (record) =>
        filterFn(record) && !serverIds.has(record.id) && !dirtyIds.has(record.id),
    )
    .map((record) => record.id)

  return { upserts, staleIds }
}

/**
 * Replace the cached ACTIVE set with the server's response (the authoritative
 * snapshot from GET /items): upsert every returned item with dirty=false and
 * evict cached active items the server no longer reports (deleted elsewhere →
 * they reappear via the trash snapshot; permanently deleted elsewhere → gone).
 *
 * Phase 5 merge strategy:
 *   - Dirty items (pending queued operations) are NEVER overwritten — the
 *     local version represents newer user intent that has not yet synced.
 *   - Non-dirty items use the server's values (last-write-wins).
 *   - Stale local items (not in server response, not dirty) are evicted.
 *   - Dirty stale items are preserved — they have pending operations that
 *     will reconcile when the sync drain completes.
 */
export async function cacheActiveItems(
  items: readonly NoteItem[],
): Promise<void> {
  await safely(
    'cacheActiveItems',
    async () => {
      const all = await getAllItems()
      const byId = new Map(all.map((record) => [record.id, record]))
      const dirtyIds = new Set(
        all.filter((record) => record.dirty).map((record) => record.id),
      )
      const { upserts, staleIds } = mergeServerSnapshot(
        items,
        byId,
        dirtyIds,
        // Active items: deletedAt is null (or undefined for items without it).
        (record) => record.deletedAt === null,
      )
      await putItems(upserts)
      for (const id of staleIds) {
        await deleteItem(id)
      }
    },
    undefined,
  )
}

/**
 * Replace the cached TRASH set with the server's response (the authoritative
 * snapshot from GET /items/deleted, already newest-deleted-first): upsert
 * every returned item and evict cached deleted items that are no longer in
 * the server's trash (restored or permanently deleted elsewhere).
 *
 * Phase 5 merge strategy (same as cacheActiveItems):
 *   - Dirty items (pending offline soft-delete/restore) are NEVER overwritten.
 *   - Non-dirty items use the server's values.
 *   - Stale dirty deleted items are preserved — they have pending operations
 *     (e.g. a locally-deleted item whose SOFT_DELETE op has not yet synced).
 */
export async function cacheDeletedItems(
  items: readonly NoteItem[],
): Promise<void> {
  await safely(
    'cacheDeletedItems',
    async () => {
      const all = await getAllItems()
      const byId = new Map(all.map((record) => [record.id, record]))
      const dirtyIds = new Set(
        all.filter((record) => record.dirty).map((record) => record.id),
      )
      const { upserts, staleIds } = mergeServerSnapshot(
        items,
        byId,
        dirtyIds,
        // Deleted items: deletedAt is not null.
        (record) => record.deletedAt !== null,
      )
      await putItems(upserts)
      for (const id of staleIds) {
        await deleteItem(id)
      }
    },
    undefined,
  )
}

/** Mirror a single confirmed server item (create/edit/toggle/restore). */
export async function cacheItemSnapshot(item: NoteItem): Promise<void> {
  await safely(
    'cacheItemSnapshot',
    async () => {
      const existing = await getItem(item.id)
      await putItem(mergeServerItem(existing, item))
    },
    undefined,
  )
}

/**
 * Mirror a successful online soft-delete. The exact server `deletedAt` is not
 * returned by DELETE, so an approximate timestamp is cached (it only affects
 * the trash "deleted x ago" label) and is replaced with the server's real
 * value on the next online trash open.
 */
export async function cacheSoftDeletedItem(
  item: NoteItem,
  deletedAt: string,
): Promise<void> {
  await safely(
    'cacheSoftDeletedItem',
    async () => {
      const existing = await getItem(item.id)
      await putItem(mergeServerItem(existing, { ...item, deletedAt }))
    },
    undefined,
  )
}

/** Remove a single cached item (permanent-delete mirror). */
export async function evictCachedItem(id: string): Promise<void> {
  await safely('evictCachedItem', () => deleteItem(id), undefined)
}

// ---------------------------------------------------------------------------
// hydration reads (offline startup)
// ---------------------------------------------------------------------------

/**
 * Map each unsynced item with a pending CREATE operation to its auto-increment
 * queue sequence number (`seq`). Higher seq = created later = newer.
 */
export async function getCreateOpSeqMap(): Promise<Map<string, number>> {
  return safely(
    'getCreateOpSeqMap',
    async () => {
      const queue = await getAllSyncOperations()
      const map = new Map<string, number>()
      for (const op of queue) {
        if (op.type === 'create') {
          map.set(op.itemId, op.seq)
        }
      }
      return map
    },
    new Map<string, number>(),
  )
}

/**
 * Unified comparator for NoteItems:
 * 1. Offline items (!createdAt) always sort above server items (createdAt).
 * 2. Multiple offline items sort by their syncQueue create op sequence (seq desc, newest first).
 * 3. Multiple server items sort by createdAt desc.
 */
export function compareNoteItems(
  a: NoteItem,
  b: NoteItem,
  createSeqByItemId?: Map<string, number>,
): number {
  const aIsLocal = !a.createdAt
  const bIsLocal = !b.createdAt

  // Both are offline/local unsynced items: order by create op seq DESC (newer first)
  if (aIsLocal && bIsLocal) {
    if (createSeqByItemId) {
      const seqA = createSeqByItemId.get(a.id) ?? 0
      const seqB = createSeqByItemId.get(b.id) ?? 0
      if (seqA !== seqB) return seqB - seqA
    }
    return 0
  }

  // Offline local items appear above existing server items
  if (aIsLocal) return -1
  if (bIsLocal) return 1

  // Both are server items: order by createdAt DESC
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
}

/**
 * Cached active items in the server's display order (createdAt desc, the
 * order GET /items returns) so hydration preserves the existing UI ordering.
 * Offline-created items (createdAt === null) are sorted by their write-ahead
 * queue sequence (seq desc, newest first) above all server items.
 */
export async function loadCachedActiveItems(): Promise<NoteItem[]> {
  return safely(
    'loadCachedActiveItems',
    async () => {
      const [all, createSeqByItemId] = await Promise.all([
        getAllItems(),
        getCreateOpSeqMap(),
      ])

      const active = all.filter((record) => record.deletedAt === null)
      const mapped = active.map(localItemToNoteItem)

      return mapped.sort((a, b) => compareNoteItems(a, b, createSeqByItemId))
    },
    [],
  )
}

/** Cached trash, newest deletion first (matches GET /items/deleted order). */
export async function loadCachedDeletedItems(): Promise<NoteItem[]> {
  return safely(
    'loadCachedDeletedItems',
    async () => {
      const deleted = await getDeletedItems()
      return deleted.map(localItemToNoteItem)
    },
    [],
  )
}