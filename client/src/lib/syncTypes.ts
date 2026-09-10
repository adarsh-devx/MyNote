import type { ItemType, NoteColor } from '../types/note'

/**
 * Offline-first foundation types (Phase 0).
 *
 * These types define the contract between the local IndexedDB store (see
 * db.ts) and the future local-first/sync phases. They are intentionally not
 * imported by the application yet — Phase 0 only establishes the storage
 * layer, with zero behavior change.
 *
 * Design reference: the offline-first architecture audit — write-ahead
 * mutation queue, sequential replay, full server pull + updatedAt merge,
 * last-write-wins conflicts.
 */

/**
 * Local mirror of a server item.
 *
 * Mirrors `NoteItem` (types/note.ts) plus the two offline bookkeeping fields.
 * Timestamps are nullable because an item created offline has no
 * server-side timestamps until its `create` operation is replayed.
 */
export interface LocalItem {
  /**
   * Primary key. The server Mongo id once known; for items created offline a
   * client-generated `local-<uuid>` until the create operation is replayed.
   */
  id: string
  /**
   * Canonical server Mongo id once the item has been created on the server.
   * `null` for locally-created items whose `create` op has not replayed yet;
   * undefined for items that were already server-created (their `id` IS the
   * canonical id). Because the record key (`id`) stays stable, the engine
   * resolves the server target for queue replays from this field.
   */
  serverId?: string | null
  /**
   * Stable client-generated identity. Never changes when the server id
   * arrives; the join key for queue operations and pull-merge deduplication.
   */
  clientId: string
  title: string
  content: string
  type: ItemType
  completed: boolean
  pinned?: boolean
  color?: NoteColor
  tags?: string[]
  order?: number
  /**
   * Server-side notification lifecycle ('pending' | 'delivered'); preserved
   * on pull so the existing Tauri notification flow keeps working unchanged.
   */
  notificationState?: 'pending' | 'delivered'
  /** Non-null while the item is in the trash (soft-deleted). */
  deletedAt: string | null
  /** Server timestamps; null until the server has confirmed the item. */
  createdAt: string | null
  updatedAt: string | null
  /** True while a queued sync operation targets this item and is unacknowledged. */
  dirty: boolean
}

/** The exact mutation set the local queue can represent. */
export type SyncOperationType =
  | 'create'
  | 'update'
  | 'toggle'
  | 'pin'
  | 'soft-delete'
  | 'restore'
  | 'permanent-delete'

/** Full snapshot of a locally created item, replayed via POST /items. */
export interface CreateOperationPayload {
  item: LocalItem
}

/**
 * Field patch for an edit. Never send an empty patch — the API rejects
 * PATCH bodies without at least one updatable field.
 */
export interface UpdateOperationPayload {
  title?: string
  content?: string
  type?: ItemType
  pinned?: boolean
  color?: NoteColor
  tags?: string[]
  order?: number
}

/** Absolute completed value (not a delta), so replay is idempotent. */
export interface ToggleOperationPayload {
  completed: boolean
}

/** Absolute pinned value (not a delta), so replay is idempotent. */
export interface PinOperationPayload {
  pinned: boolean
}

/** Payload for queue operations that carry no extra data. */
export type EmptyOperationPayload = Record<string, never>

/** Union of all queue operation payloads. */
export type SyncOperationPayload =
  | CreateOperationPayload
  | UpdateOperationPayload
  | ToggleOperationPayload
  | PinOperationPayload
  | EmptyOperationPayload

export interface SyncQueueItemBase {
  /** Auto-incremented insertion order (FIFO replay order); assigned by IndexedDB. */
  seq: number
  /** Client-generated UUID; the idempotency key sent with the replayed request. */
  opId: string
  /** Local item id the operation applies to (clientId-backed for offline creates). */
  itemId: string
  /** ISO timestamp when the operation was enqueued. */
  createdAt: string
  /** Number of replay attempts made so far. */
  attempts: number
  /** Last replay failure, for diagnostics / sync status UI. */
  lastError?: string
  /** ISO timestamp of the last replay attempt. */
  lastAttemptAt?: string
}

/**
 * One entry in the write-ahead sync queue. Discriminated on `type`, so each
 * operation carries exactly the payload it needs.
 */
export type SyncQueueItem = SyncQueueItemBase &
  (
    | { type: 'create'; payload: CreateOperationPayload }
    | { type: 'update'; payload: UpdateOperationPayload }
    | { type: 'toggle'; payload: ToggleOperationPayload }
    | { type: 'pin'; payload: PinOperationPayload }
    | { type: 'soft-delete'; payload: EmptyOperationPayload }
    | { type: 'restore'; payload: EmptyOperationPayload }
    | { type: 'permanent-delete'; payload: EmptyOperationPayload }
  )

/** A queue operation before IndexedDB assigns its auto-increment `seq`. */
export type NewSyncQueueItem = DistributiveOmit<SyncQueueItem, 'seq'>

/** Single syncMeta record (see db.ts) — sync bookkeeping, not item data. */
export interface SyncMeta {
  key: string
  /** ISO timestamp of the last successful server pull. */
  lastPulledAt?: string
  /** Human-readable summary of the last sync failure, for sync status UI. */
  lastSyncError?: string
  /** Local schema version; lets future releases migrate stores without data loss. */
  schemaVersion: number
  // ── Phase 4 retry tracking ───────────────────────────────────────────
  /** ISO timestamp of the last queue-drain attempt (success or failure). */
  lastAttemptAt?: string
  /** ISO timestamp of the next scheduled retry attempt. */
  nextRetryAt?: string
  /** Consecutive failure count — resets to 0 on the next successful drain. */
  failureCount?: number
  /** The most recent error message, for diagnostics / sync status UI. */
  lastError?: string
}

/**
 * Offline profile snapshot for previously signed-in users.
 *
 * PRIVACY: display fields only. Never store passwords, Google access or
 * refresh tokens, session cookies, or session ids in IndexedDB — the httpOnly
 * session cookie remains the only credential and the backend stays
 * authoritative whenever online.
 */
export interface CachedAuthUser {
  key: 'currentUser'
  id: string
  name: string
  email: string
  avatarUrl?: string
  /** ISO timestamp when the profile was written to the cache. */
  cachedAt: string
  /** ISO timestamp of the last successful GET /auth/me verification. */
  lastVerifiedAt: string
}

/**
 * Minimal sync-engine status (Phase 5). Exposed for internal use and future
 * Phase 6 sync-status UI. Not a React state — read via getSyncStatus().
 */
export type SyncStatus =
  | 'idle'       // queue empty, no work pending
  | 'syncing'    // drain actively processing operations
  | 'waiting'    // backoff timer active, next retry scheduled
  | 'paused'     // 401 — waiting for re-authentication
  | 'offline'    // navigator.onLine is false

/** Omit that distributes over unions (plain Omit collapses union keys). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never
