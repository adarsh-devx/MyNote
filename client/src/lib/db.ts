import type {
  CachedAuthUser,
  LocalItem,
  NewSyncQueueItem,
  SyncMeta,
  SyncQueueItem,
} from './syncTypes'

/**
 * Typed IndexedDB foundation for offline-first MyNotes (Phase 0).
 *
 * Database `mynotes` v1 with four stores:
 *   - items      — local mirror of server items (active + soft-deleted)
 *   - syncQueue  — write-ahead log of local mutations (FIFO replay)
 *   - syncMeta   — sync bookkeeping (last pull, last error, schema version)
 *   - authCache  — cached profile snapshot (display fields only; no tokens,
 *                  no session data)
 *
 * Phase 0 note: this module is intentionally NOT imported by the application
 * yet. It only establishes the storage layer and transaction support that
 * later phases build on. No app behavior changes in Phase 0.
 *
 * Environment: plain browser/PWA and Tauri WebView2 both expose the standard
 * IndexedDB API; no Tauri-specific storage code is used.
 */

export const DB_NAME = 'mynotes'
export const DB_VERSION = 1

export const STORE_ITEMS = 'items'
export const STORE_SYNC_QUEUE = 'syncQueue'
export const STORE_SYNC_META = 'syncMeta'
export const STORE_AUTH_CACHE = 'authCache'

export type StoreName =
  | typeof STORE_ITEMS
  | typeof STORE_SYNC_QUEUE
  | typeof STORE_SYNC_META
  | typeof STORE_AUTH_CACHE

/** Key of the single record inside the syncMeta store. */
export const SYNC_META_RECORD_KEY = 'meta'

/** Key of the single profile record inside the authCache store. */
export const CURRENT_USER_KEY = 'currentUser'

/**
 * Handle given to a withTransaction body. Requests issued through `request`
 * keep the transaction alive. Awaiting anything else inside the body
 * (fetch, setTimeout, non-IDB promises) can let IndexedDB auto-commit the
 * transaction early — never do that.
 */
export interface DbTransaction {
  /** Raw object store handle for the given store, inside this transaction. */
  store(name: StoreName): IDBObjectStore
  /** Await an IDBRequest issued on this transaction's stores. */
  request<T>(request: IDBRequest<T>): Promise<T>
  /** Explicitly abort the transaction (rolls back all its changes). */
  abort(): void
}

/** Error thrown for any IndexedDB failure. Database errors are never swallowed. */
export class DbError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DbError'
  }
}

function toDbError(context: string, err: unknown): DbError {
  const message =
    err instanceof Error ? err.message : err ? String(err) : 'unknown error'
  return new DbError(`[db] ${context}: ${message}`, { cause: err })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    // Not calling event.preventDefault() on purpose: a failed request should
    // abort the whole transaction (fail-loud), never continue half-applied.
    request.onerror = () => reject(toDbError('request failed', request.error))
  })
}

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * Open (and memoize) the `mynotes` database, running any pending migrations.
 * Open failures are not cached — a transient error (e.g. private mode quota)
 * must not poison every future call.
 */
export function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = doOpen().catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

function doOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = globalThis.indexedDB
    if (!factory) {
      reject(new DbError('IndexedDB is not available in this environment.'))
      return
    }

    let request: IDBOpenDBRequest
    try {
      request = factory.open(DB_NAME, DB_VERSION)
    } catch (err) {
      reject(toDbError('open', err))
      return
    }

    request.onupgradeneeded = (event) => {
      const upgradeTx = request.transaction
      if (!upgradeTx) {
        reject(new DbError('[db] upgrade ran without a version-change transaction'))
        return
      }
      try {
        runMigrations(request.result, event.oldVersion, upgradeTx)
      } catch (err) {
        // A failing migration fails the open — surface it clearly instead of
        // leaving the caller with a half-upgraded database.
        reject(toDbError(`upgrade to version ${DB_VERSION}`, err))
      }
    }

    request.onsuccess = () => {
      const db = request.result
      // Close when another tab/window requests a schema upgrade so future
      // migrations are never blocked by this connection; the next openDB()
      // call reopens with the new schema.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }

    request.onerror = () => reject(toDbError('open', request.error))
    request.onblocked = () => {
      // Another (older) tab still holds the database open; we wait rather
      // than fail. The open completes once that tab closes or upgrades.
      console.warn('[db] upgrade blocked by another open tab; waiting...')
    }
  })
}

/**
 * Sequential, additive migrations: `MIGRATIONS[v]` upgrades the schema from
 * v-1 to v. Future schema changes add a new entry and bump DB_VERSION —
 * existing stores and data are never recreated or destroyed.
 */
const MIGRATIONS: Readonly<
  Record<number, (db: IDBDatabase, tx: IDBTransaction) => void>
> = {
  1: (db, tx) => {
    const items = ensureStore(db, tx, STORE_ITEMS, { keyPath: 'id' })
    ensureIndex(items, 'by_updatedAt', 'updatedAt')
    // Items with deletedAt === null are not part of this index (null is not a
    // valid IndexedDB key), so index lookups return only trashed items.
    ensureIndex(items, 'by_deletedAt', 'deletedAt')
    ensureIndex(items, 'by_dirty', 'dirty')
    ensureIndex(items, 'by_clientId', 'clientId')

    const syncQueue = ensureStore(db, tx, STORE_SYNC_QUEUE, {
      keyPath: 'seq',
      autoIncrement: true,
    })
    ensureIndex(syncQueue, 'by_itemId', 'itemId')
    ensureIndex(syncQueue, 'by_createdAt', 'createdAt')

    ensureStore(db, tx, STORE_SYNC_META, { keyPath: 'key' })
    ensureStore(db, tx, STORE_AUTH_CACHE, { keyPath: 'key' })
  },
}

function runMigrations(
  db: IDBDatabase,
  oldVersion: number,
  tx: IDBTransaction,
): void {
  for (let version = oldVersion + 1; version <= DB_VERSION; version += 1) {
    const migration = MIGRATIONS[version]
    if (!migration) {
      throw new Error(`[db] no migration registered for version ${version}`)
    }
    migration(db, tx)
  }
}

function ensureStore(
  db: IDBDatabase,
  tx: IDBTransaction,
  name: StoreName,
  options: IDBObjectStoreParameters,
): IDBObjectStore {
  // Existing stores are reachable through the version-change transaction
  // (IDBDatabase has no objectStore accessor); new ones via createObjectStore.
  return db.objectStoreNames.contains(name)
    ? tx.objectStore(name)
    : db.createObjectStore(name, options)
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options?: IDBIndexParameters,
): void {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options)
  }
}

/**
 * Run `body` inside a single IndexedDB transaction across `storeNames`.
 *
 * This is what later phases use for the atomic local mutation
 * "apply the item change + enqueue its sync operation" in one transaction.
 *
 * The body must only await IDB requests via `tx.request`; awaiting anything
 * else may let the transaction auto-commit early (IndexedDB semantics).
 */
export async function withTransaction<T>(
  storeNames: readonly StoreName[],
  mode: IDBTransactionMode,
  body: (tx: DbTransaction) => T | Promise<T>,
): Promise<T> {
  const db = await openDB()
  const tx = db.transaction([...storeNames], mode)

  let settle!: () => void
  let fail!: (err: unknown) => void
  const complete = new Promise<void>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  tx.oncomplete = () => settle()
  tx.onabort = () =>
    fail(tx.error ?? new DbError('[db] transaction aborted without an error'))
  // Request failures bubble here before onabort fires. Each request already
  // rejects its own promise; this handler only keeps the error event from
  // being reported as unhandled — `complete` surfaces the failure via abort.
  tx.onerror = () => undefined

  const handle: DbTransaction = {
    store: (name) => tx.objectStore(name),
    request: requestToPromise,
    abort: () => tx.abort(),
  }

  try {
    const result = await body(handle)
    await complete
    return result
  } catch (err) {
    try {
      tx.abort()
    } catch {
      // Transaction already aborting/finished — abort() throws InvalidState
      // in that case, which is exactly the "nothing to do" situation.
    }
    // The transaction-level rejection mirrors `err`; swallow it so the
    // original error (or the real DB error from `complete`) is not masked.
    await complete.catch(() => undefined)
    throw err
  }
}

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

export async function getItem(id: string): Promise<LocalItem | undefined> {
  return withTransaction([STORE_ITEMS], 'readonly', (tx) =>
    tx.request(tx.store(STORE_ITEMS).get(id)) as Promise<LocalItem | undefined>,
  )
}

export async function putItem(item: LocalItem): Promise<void> {
  await withTransaction([STORE_ITEMS], 'readwrite', (tx) =>
    tx.request(tx.store(STORE_ITEMS).put(item)),
  )
}

/** Bulk put inside one transaction — used by the future hydration/pull merge. */
export async function putItems(items: readonly LocalItem[]): Promise<void> {
  await withTransaction([STORE_ITEMS], 'readwrite', async (tx) => {
    const store = tx.store(STORE_ITEMS)
    for (const item of items) {
      await tx.request(store.put(item))
    }
  })
}

export async function deleteItem(id: string): Promise<void> {
  await withTransaction([STORE_ITEMS], 'readwrite', (tx) =>
    tx.request(tx.store(STORE_ITEMS).delete(id)),
  )
}

export async function getAllItems(): Promise<LocalItem[]> {
  return withTransaction([STORE_ITEMS], 'readonly', (tx) =>
    tx.request(tx.store(STORE_ITEMS).getAll()) as Promise<LocalItem[]>,
  )
}

/**
 * All soft-deleted items (trash), newest deletion first — matches the
 * server's `sort({ deletedAt: -1 })` used by GET /api/items/deleted.
 */
export async function getDeletedItems(): Promise<LocalItem[]> {
  return withTransaction([STORE_ITEMS], 'readonly', async (tx) => {
    const items = (await tx.request(
      tx.store(STORE_ITEMS).index('by_deletedAt').getAll(),
    )) as LocalItem[]
    return items.sort((a, b) =>
      (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''),
    )
  })
}

/** Items with a queued, unacknowledged sync operation (`dirty === true`). */
export async function getDirtyItems(): Promise<LocalItem[]> {
  return withTransaction([STORE_ITEMS], 'readonly', async (tx) => {
    const all = (await tx.request(
      tx.store(STORE_ITEMS).getAll(),
    )) as LocalItem[]
    return all.filter((item) => Boolean(item.dirty))
  })
}

// ---------------------------------------------------------------------------
// syncQueue
// ---------------------------------------------------------------------------

/**
 * Append a mutation to the write-ahead queue. The auto-incremented `seq` is
 * assigned by IndexedDB and included in the returned record.
 */
export async function addSyncOperation(
  op: NewSyncQueueItem,
): Promise<SyncQueueItem> {
  return withTransaction([STORE_SYNC_QUEUE], 'readwrite', async (tx) => {
    const store = tx.store(STORE_SYNC_QUEUE)
    const seq = (await tx.request(store.add(op))) as number
    return { ...op, seq }
  })
}

/** All queued operations in FIFO (`seq`) order. */
export async function getAllSyncOperations(): Promise<SyncQueueItem[]> {
  return withTransaction([STORE_SYNC_QUEUE], 'readonly', (tx) =>
    tx.request(tx.store(STORE_SYNC_QUEUE).getAll()) as Promise<SyncQueueItem[]>,
  )
}

/** Oldest queued operation (head of the FIFO queue), if any. */
export async function getNextSyncOperation(): Promise<SyncQueueItem | undefined> {
  return withTransaction([STORE_SYNC_QUEUE], 'readonly', async (tx) => {
    const cursor = await tx.request(tx.store(STORE_SYNC_QUEUE).openCursor())
    return cursor ? (cursor.value as SyncQueueItem) : undefined
  })
}

/** True while at least one operation is waiting in the sync queue. */
export async function hasPendingSyncOperations(): Promise<boolean> {
  return withTransaction([STORE_SYNC_QUEUE], 'readonly', async (tx) => {
    const cursor = await tx.request(tx.store(STORE_SYNC_QUEUE).openCursor())
    return cursor !== null && cursor !== undefined
  })
}

/** Update an operation (e.g. attempts/lastError bookkeeping between retries). */
export async function putSyncOperation(op: SyncQueueItem): Promise<void> {
  await withTransaction([STORE_SYNC_QUEUE], 'readwrite', (tx) =>
    tx.request(tx.store(STORE_SYNC_QUEUE).put(op)),
  )
}

export async function deleteSyncOperation(seq: number): Promise<void> {
  await withTransaction([STORE_SYNC_QUEUE], 'readwrite', (tx) =>
    tx.request(tx.store(STORE_SYNC_QUEUE).delete(seq)),
  )
}

/** Queued operations for one item, in FIFO (`seq`) order. */
export async function getSyncOperationsForItem(
  itemId: string,
): Promise<SyncQueueItem[]> {
  return withTransaction([STORE_SYNC_QUEUE], 'readonly', (tx) =>
    tx.request(
      tx.store(STORE_SYNC_QUEUE).index('by_itemId').getAll(itemId),
    ) as Promise<SyncQueueItem[]>,
  )
}

// ---------------------------------------------------------------------------
// syncMeta
// ---------------------------------------------------------------------------

export async function getSyncMeta(): Promise<SyncMeta | undefined> {
  return withTransaction([STORE_SYNC_META], 'readonly', (tx) =>
    tx.request(
      tx.store(STORE_SYNC_META).get(SYNC_META_RECORD_KEY),
    ) as Promise<SyncMeta | undefined>,
  )
}

export async function putSyncMeta(meta: SyncMeta): Promise<void> {
  await withTransaction([STORE_SYNC_META], 'readwrite', (tx) =>
    tx.request(
      tx.store(STORE_SYNC_META).put({ ...meta, key: SYNC_META_RECORD_KEY }),
    ),
  )
}

// ---------------------------------------------------------------------------
// authCache
// ---------------------------------------------------------------------------

/**
 * Cached profile snapshot for offline startup. Display fields only — never
 * credentials (see CachedAuthUser in syncTypes.ts).
 */
export async function getCachedUser(): Promise<CachedAuthUser | undefined> {
  return withTransaction([STORE_AUTH_CACHE], 'readonly', (tx) =>
    tx.request(
      tx.store(STORE_AUTH_CACHE).get(CURRENT_USER_KEY),
    ) as Promise<CachedAuthUser | undefined>,
  )
}

/** Cache the profile snapshot; the record key is set internally. */
export async function putCachedUser(
  user: Omit<CachedAuthUser, 'key'>,
): Promise<void> {
  await withTransaction([STORE_AUTH_CACHE], 'readwrite', (tx) =>
    tx.request(
      tx.store(STORE_AUTH_CACHE).put({ ...user, key: CURRENT_USER_KEY }),
    ),
  )
}

export async function clearCachedUser(): Promise<void> {
  await withTransaction([STORE_AUTH_CACHE], 'readwrite', (tx) =>
    tx.request(tx.store(STORE_AUTH_CACHE).delete(CURRENT_USER_KEY)),
  )
}

// ---------------------------------------------------------------------------
// wipe
// ---------------------------------------------------------------------------

/**
 * Atomically wipe every local store (items, queue, meta, auth cache).
 * Intended for account switching / explicit "clear local data". A later phase
 * owns the guard that this must never run while a sync drain is in progress.
 */
export async function clearAllLocalData(): Promise<void> {
  await withTransaction(
    [STORE_ITEMS, STORE_SYNC_QUEUE, STORE_SYNC_META, STORE_AUTH_CACHE],
    'readwrite',
    async (tx) => {
      await tx.request(tx.store(STORE_ITEMS).clear())
      await tx.request(tx.store(STORE_SYNC_QUEUE).clear())
      await tx.request(tx.store(STORE_SYNC_META).clear())
      await tx.request(tx.store(STORE_AUTH_CACHE).clear())
    },
  )
}
