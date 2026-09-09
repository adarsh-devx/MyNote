import * as api from './api'
import {
  deleteSyncOperation,
  getItem,
  getNextSyncOperation,
  putSyncOperation,
  withTransaction,
  STORE_ITEMS,
  STORE_SYNC_QUEUE,
} from './db'
import { localItemToNoteItem } from './authCache'
import type { LocalItem, SyncQueueItem, SyncStatus } from './syncTypes'
import type { NoteItem } from '../types/note'

/**
 * Phase 4+5 sync engine — a robust, single-flight queue drain with automatic
 * retry, online/offline transitions, focus-triggered resumption, and
 * conflict-safe merge behavior.
 *
 * Lifecycle:
 *   1. Phase 0 establishes IndexedDB (db.ts).
 *   2. Phase 1 hydrates the UI from the cache (authCache.ts).
 *   3. Phase 3 adds local-first mutations to the sync queue (store.ts).
 *   4. Phase 4 (this module) ensures the queue drains reliably:
 *      - online/offline events trigger sync attempts.
 *      - window focus triggers sync if the queue has pending work.
 *      - cold start drains the queue in the background.
 *      - exponential backoff with jitter prevents tight loops.
 *      - a single retry timer replaces fixed-interval retries.
 *      - HTTP 429 / Retry-After is respected.
 *      - 401 pauses the drain; subsequent triggers resume it.
 *
 * Single-flight guarantee: only one drain runs at a time. Multiple triggers
 * (mutation, online event, focus, retry timer, cold start) converge on one
 * actual drain. After the active drain finishes, if new queue work appeared
 * during it, the next trigger picks it up — the engine never strands ops.
 */

// ── Retry scheduling ───────────────────────────────────────────────────
// Exponential backoff with jitter: 5 s → 10 s → 20 s → 40 s → 80 s → …
// capped at 5 minutes. Jitter (±30 %) avoids thundering-herd retries when
// multiple clients reconnect simultaneously.
const BASE_RETRY_MS = 5_000
const MAX_RETRY_MS = 5 * 60_000
const JITTER_FACTOR = 0.3

function backoffDelay(failures: number): number {
  const exp = BASE_RETRY_MS * 2 ** Math.min(failures, 7)
  const capped = Math.min(exp, MAX_RETRY_MS)
  const jitter = capped * JITTER_FACTOR * (Math.random() * 2 - 1) // ±30 %
  return Math.max(0, Math.floor(capped + jitter))
}

/**
 * Parse the Retry-After header (seconds or HTTP-date) into milliseconds.
 * Returns null when the header is absent or unparseable.
 */
function parseRetryAfter(header: string | undefined): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }
  // HTTP-date format: "Wed, 21 Oct 2015 07:28:00 GMT"
  const date = Date.parse(header)
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now())
  }
  return null
}

// ── State ──────────────────────────────────────────────────────────────

/** Prevents concurrent drains. Set to true before the loop, false after. */
let drainInFlight = false

/** Earliest timestamp when the next retry is allowed. */
let backoffUntil = 0

/** Active retry timer handle — at most one exists at any time. */
let retryTimer: ReturnType<typeof setTimeout> | null = null

/** True when the browser is offline. Network requests are skipped when set. */
let isOffline = false

/** Timestamp of the last focus/visibility trigger to prevent rapid re-triggers. */
let lastFocusTriggerAt = 0
const FOCUS_THROTTLE_MS = 2_000

// ── Event listeners (Phase 4) ──────────────────────────────────────────
// Registered once on module load and cleaned up on beforeunload. These are
// the ONLY places that schedule sync attempts outside of store.ts mutations.

function onFocus() {
  const now = Date.now()
  if (now - lastFocusTriggerAt < FOCUS_THROTTLE_MS) return
  lastFocusTriggerAt = now
  if (!isOffline) void syncNow()
}

function onOnline() {
  isOffline = false
  // The retry timer might have been skipped while offline. Clear the
  // backoff gate so the next drain starts immediately.
  backoffUntil = 0
  void syncNow()
}

function onOffline() {
  isOffline = true
}

function onBeforeUnload() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

// Register once — module-level. Works identically in browser, PWA, and Tauri.
if (typeof window !== 'undefined') {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onFocus)
  window.addEventListener('focus', onFocus)
  window.addEventListener('beforeunload', onBeforeUnload)
}

// ── Sync status (Phase 5) ────────────────────────────────────────────
// Exposes the engine's internal state for a minimal status hook. The status
// is derived from existing module-level state — no new state is added.

/**
 * Current sync-engine status. Read-only snapshot; the actual state is derived
 * from drainInFlight, backoffUntil, isOffline, and the last paused outcome.
 * For internal use and future Phase 6 sync-status UI.
 */
export function getSyncStatus(): SyncStatus {
  if (isOffline) return 'offline'
  if (drainInFlight) return 'syncing'
  if (Date.now() < backoffUntil) return 'waiting'
  // 401-paused state is tracked implicitly: after a paused drain, the next
  // trigger (mutation/focus/online) resumes. We approximate 'paused' by
  // checking if the last drain paused without scheduling a retry.
  if (lastDrainPaused) return 'paused'
  return 'idle'
}

/**
 * True when the last drain paused due to 401 and has not yet been resumed.
 * Reset when a new drain starts; set when a drain pauses.
 */
let lastDrainPaused = false

// ── Canonicalization listener ──────────────────────────────────────────
// The engine emits ONE reconciliation event worth surfacing: when a create
// op is acknowledged, the local item's identity flips to the canonical server
// id. Home subscribes so its React item keys stay in sync with the durable
// records. Never a full reactive IndexedDB subscription — just this event.

type CanonicalizationListener = (item: NoteItem, previousLocalId: string) => void

let canonicalizationListener: CanonicalizationListener | null = null

export function setCanonicalizationListener(
  listener: CanonicalizationListener | null,
): void {
  canonicalizationListener = listener
}

// ── Error classification ───────────────────────────────────────────────

type DrainOutcome = 'ok' | 'retry' | 'paused' | 'drop'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Network failure (fetch throw) or a transient server status → retry later. */
function isRetryable(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof api.ApiError) {
    return error.status === 429 || error.status >= 500
  }
  return false
}

/**
 * When to schedule a retry after a failure.
 *
 *   - 429 with Retry-After → respect the server-provided delay.
 *   - 429 without Retry-After, 5xx, network → exponential backoff.
 *   - 401 → paused (no schedule; the next trigger resumes).
 */
function computeRetryDelay(error: unknown, failures: number): number | null {
  if (error instanceof api.ApiError && error.status === 429) {
    const fromHeader = parseRetryAfter(error.headers['retry-after'])
    if (fromHeader !== null) {
      return Math.min(fromHeader, MAX_RETRY_MS)
    }
  }
  if (isRetryable(error)) {
    return backoffDelay(failures)
  }
  return null
}

// ── Retry timer ────────────────────────────────────────────────────────
// A single queue-level timer replaces per-operation timers. The timer is
// scheduled by the drain when it encounters a retryable failure and is
// cleared when the queue becomes empty.

function scheduleRetry(delayMs: number): void {
  if (retryTimer !== null) return // at most one active timer
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (!isOffline) void syncNow()
  }, delayMs)
}

function clearRetryTimer(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * The server target for a queue operation. Locally-created items have a
 * stable local-<uuid> record id plus a serverId that is filled in when
 * the create is acknowledged; server-created items ARE their own canonical
 * id.
 */
async function resolveServerId(op: SyncQueueItem): Promise<string | null> {
  const record = await getItem(op.itemId)
  if (!record) return null
  return record.serverId ?? record.id
}

/** Update an op's retry bookkeeping, keeping it at the head of the queue. */
async function recordFailure(op: SyncQueueItem, error: unknown): Promise<void> {
  await putSyncOperation({
    ...op,
    attempts: op.attempts + 1,
    lastError: errorMessage(error),
    lastAttemptAt: new Date().toISOString(),
  })
}

/**
 * Drop every queued operation for an item and remove its local record.
 * Used when the server proves the item no longer exists (404 on update/toggle
 * = permanently deleted elsewhere) — replaying further ops is pointless and
 * re-creating the record would resurrect a deleted item.
 */
async function dropAllOperationsForItem(itemId: string): Promise<void> {
  await withTransaction([STORE_ITEMS, STORE_SYNC_QUEUE], 'readwrite', async (tx) => {
    const itemsStore = tx.store(STORE_ITEMS)
    const queueStore = tx.store(STORE_SYNC_QUEUE)
    const ops = (await tx.request(
      queueStore.index('by_itemId').getAll(itemId),
    )) as SyncQueueItem[]
    for (const queued of ops) {
      await tx.request(queueStore.delete(queued.seq))
    }
    await tx.request(itemsStore.delete(itemId))
  })
}

/**
 * Acknowledge an op: remove it from the queue and — atomically — clear the
 * item's dirty flag once no further op targets the item. deleteRecord
 * additionally removes the local record (used by permanent-delete, whose
 * record is already gone from the moment the user hit "delete forever").
 */
async function finalizeOpSuccess(
  op: SyncQueueItem,
  options: { deleteRecord?: boolean } = {},
): Promise<void> {
  const { deleteRecord } = options
  await withTransaction([STORE_ITEMS, STORE_SYNC_QUEUE], 'readwrite', async (tx) => {
    const itemsStore = tx.store(STORE_ITEMS)
    const queueStore = tx.store(STORE_SYNC_QUEUE)
    const remaining = (
      (await tx.request(
        queueStore.index('by_itemId').getAll(op.itemId),
      )) as SyncQueueItem[]
    ).filter((queued) => queued.seq !== op.seq)

    await tx.request(queueStore.delete(op.seq))

    if (deleteRecord) {
      await tx.request(itemsStore.delete(op.itemId))
      return
    }
    if (remaining.length === 0) {
      const record = (await tx.request(itemsStore.get(op.itemId))) as
        | LocalItem
        | undefined
      if (record && record.dirty) {
        await tx.request(itemsStore.put({ ...record, dirty: false }))
      }
    }
  })
}

/**
 * Acknowledge a create op AND reconcile the local item + dependent queue ops
 * to the canonical server id, atomically:
 *   - the local record is re-keyed from local-<uuid> to the server id
 *     (clientId and any locally-applied field state are preserved);
 *   - every queued op that targeted the local id (edit/toggle/delete/… made
 *     before the create synced) is re-pointed at the server id;
 *   - the create op itself is removed.
 * A restart between the POST and this transaction can't lose the mapping:
 * both the re-key and the remap commit together, and from then on every op
 * and the record reference the canonical server id.
 */
async function reconcileCreatedItem(
  op: Extract<SyncQueueItem, { type: 'create' }>,
  server: NoteItem,
): Promise<void> {
  const oldId = op.itemId
  let reconciled: LocalItem | undefined

  await withTransaction([STORE_ITEMS, STORE_SYNC_QUEUE], 'readwrite', async (tx) => {
    const itemsStore = tx.store(STORE_ITEMS)
    const queueStore = tx.store(STORE_SYNC_QUEUE)

    const local = (await tx.request(itemsStore.get(oldId))) as
      | LocalItem
      | undefined
    const dependents = (
      (await tx.request(
        queueStore.index('by_itemId').getAll(oldId),
      )) as SyncQueueItem[]
    ).filter((queued) => queued.seq !== op.seq)

    if (local) {
      const updated: LocalItem = {
        ...local,
        id: server.id,
        serverId: server.id,
        // Server timestamps arrive with the create response. Fields with
        // still-pending dependent ops (title, completed, deletedAt, …) keep
        // their CURRENT local values — the server snapshot predates them and
        // must not clobber newer local intent (and the still-queued
        // soft-delete must not be undone).
        //
        // Phase 5 field-level conflict note: the server snapshot for a create
        // response reflects the state AT THE TIME OF CREATION. Any subsequent
        // local edits (update/toggle/soft-delete) are queued as separate ops.
        // When those ops replay, the server applies them sequentially (PATCH
        // replaces fields, DELETE sets deletedAt). The FIFO queue order
        // guarantees that the user's latest intent wins.
        ...(server.createdAt != null ? { createdAt: server.createdAt } : {}),
        ...(server.updatedAt != null ? { updatedAt: server.updatedAt } : {}),
        ...(server.notificationState !== undefined
          ? { notificationState: server.notificationState }
          : {}),
        dirty: dependents.length > 0,
      }
      await tx.request(itemsStore.put(updated))
      if (oldId !== server.id) {
        await tx.request(itemsStore.delete(oldId))
      }
      reconciled = updated
    }

    for (const dependent of dependents) {
      await tx.request(queueStore.put({ ...dependent, itemId: server.id }))
    }
    await tx.request(queueStore.delete(op.seq))
  })

  if (reconciled && canonicalizationListener) {
    console.log('[DEBUG] reconcileCreatedItem: firing listener, oldId=', oldId, '-> newId=', reconciled.id, 'ct=', reconciled.createdAt)
    canonicalizationListener(localItemToNoteItem(reconciled), oldId)
  }
}

// ── Operation processors ───────────────────────────────────────────────

async function processCreate(
  op: Extract<SyncQueueItem, { type: 'create' }>,
): Promise<OperationResult> {
  console.log('[DEBUG] processCreate: op.itemId=', op.itemId, 'title=', op.payload.item.title)
  const snapshot = op.payload.item
  let server: NoteItem
  try {
    server = await api.createItem({
      title: snapshot.title,
      content: snapshot.content,
      type: snapshot.type,
      clientRequestId: op.opId,
    })
    console.log('[DEBUG] processCreate: SUCCESS, server.id=', server.id, 'ct=', server.createdAt)
  } catch (error) {
    console.log('[DEBUG] processCreate: FAILED', error)
    return onOperationFailure(op, error)
  }
  await reconcileCreatedItem(op, server)
  return { outcome: 'ok' }
}

/** Result of processing one queue operation. */
type OperationResult = { outcome: DrainOutcome; error?: unknown }

/** Replay one op against the server. Never throws — outcomes are explicit. */
async function processOperation(op: SyncQueueItem): Promise<OperationResult> {
  if (op.type === 'create') {
    return processCreate(op)
  }

  let serverId: string
  try {
    const resolved = await resolveServerId(op)
    if (resolved) {
      serverId = resolved
    } else if (op.type === 'permanent-delete') {
      // permanent-delete is the one op whose local record is GONE BY
      // DESIGN: store.ts deletes the record in the same transaction that
      // enqueues the op, so "record not found" does NOT make this op moot.
      // By construction (see permanentDeleteItemLocalFirst) such an op is
      // only ever enqueued for an item that reached the server, and
      // reconcileCreatedItem re-keys the record AND its queued ops to the
      // canonical id atomically — so op.itemId IS the server id to delete.
      serverId = op.itemId
    } else {
      // The local record vanished (e.g. its create was cancelled by a
      // permanent delete) — no server target exists, so the op is moot.
      await dropAllOperationsForItem(op.itemId)
      return { outcome: 'drop' }
    }

    switch (op.type) {
      case 'update':
        await api.updateItem(serverId, op.payload)
        break
      case 'toggle':
        await api.updateItem(serverId, { completed: op.payload.completed })
        break
      case 'soft-delete':
        // 404 (already deleted) is treated as success by the API client.
        await api.deleteItem(serverId)
        break
      case 'restore':
        try {
          await api.restoreItem(serverId)
        } catch (error) {
          // 404 = the item is not currently deleted on the server — the
          // desired end state for a restore. Treat as success.
          if (!(error instanceof api.ApiError && error.status === 404)) {
            throw error
          }
        }
        break
      case 'permanent-delete':
        // 404 (already gone) is treated as success by the API client.
        await api.permanentDeleteItem(serverId)
        break
    }
  } catch (error) {
    return onOperationFailure(op, error)
  }

  await finalizeOpSuccess(
    op,
    op.type === 'permanent-delete' ? { deleteRecord: true } : undefined,
  )
  return { outcome: 'ok' }
}

async function onOperationFailure(
  op: SyncQueueItem,
  error: unknown,
): Promise<OperationResult> {
  if (isRetryable(error)) {
    await recordFailure(op, error)
    return { outcome: 'retry', error }
  }

  if (error instanceof api.ApiError) {
    if (error.status === 401) {
      // Session revoked/expired: pause draining but NEVER touch the queue or
      // the local data — the existing auth flow re-establishes the session
      // and Phase 4 resumes the drain after re-login.
      await recordFailure(op, error)
      return { outcome: 'paused', error }
    }

    if (error.status === 404 && (op.type === 'update' || op.type === 'toggle')) {
      // Remote permanent deletion: drop the op and every sibling whose
      // target no longer exists, and remove the local record so the item
      // cannot be resurrected by a later pull.
      await dropAllOperationsForItem(op.itemId)
      return { outcome: 'drop' }
    }

    if (op.type === 'create' && error.status === 409) {
      // Should be unreachable (Phase 2 idempotent create returns the current
      // item instead), but a 409 means "already exists" for our key — retry
      // is safe and cheap.
      await recordFailure(op, error)
      return { outcome: 'retry', error }
    }

    // Any other 4xx (e.g. 400 validation) can never succeed as written. Drop
    // it so a single poisoned op cannot block the whole queue; the local
    // state is preserved (Phase 4/5 owns surfacing this as a sync status).
    await deleteSyncOperation(op.seq)
    return { outcome: 'drop' }
  }

  // Non-HTTP infrastructure failure — retry later.
  await recordFailure(op, error)
  return { outcome: 'retry', error }
}

// ── Main drain ─────────────────────────────────────────────────────────

/**
 * Attempt to drain the whole queue. Best-effort and single-flight: concurrent
 * callers (multiple rapid mutations, startup, online event, focus event,
 * retry timer) are coalesced into one actual drain.
 *
 * After the active drain finishes:
 *   - If retryable ops remain, schedule one queue-level retry timer.
 *   - If the queue is empty, clear all retry state.
 *   - If new ops appeared during the drain (user mutated while draining),
 *     they are NOT stranded — the next trigger (mutation, focus, online)
 *     picks them up.
 */
export async function syncNow(): Promise<void> {
  console.log('[DEBUG] syncNow called, isOffline=', isOffline, 'drainInFlight=', drainInFlight)
  if (drainInFlight) return
  if (Date.now() < backoffUntil) return
  drainInFlight = true
  lastDrainPaused = false

  let delayForRetry: number | null = null
  try {
    while (true) {
      // Skip network work while offline — local mutations keep adding to the
      // queue, and the drain picks them up when connectivity returns.
      if (isOffline) break

      const op = await getNextSyncOperation()
      if (!op) break

      const { outcome, error } = await processOperation(op)
      if (outcome === 'retry' || outcome === 'paused') {
        if (outcome === 'paused') {
          // 401 — no automatic retry; the next trigger (mutation, focus,
          // online event) resumes the drain.
          lastDrainPaused = true
        }
        // Compute the retry delay. For 429 with Retry-After, use the
        // server-provided value; otherwise exponential backoff.
        const delay = computeRetryDelay(error, op.attempts)
        if (delay !== null) {
          delayForRetry = delay
        }
        break
      }
      // 'ok' proceeds to the next op; 'drop' also proceeds (the poisoned op
      // was removed, or the 404 item was reconciled as already-gone).
    }
  } catch (error) {
    // Absolute last resort: a drain-level failure (e.g. IndexedDB itself)
    // must neither lose the queue nor leave the single-flight flag stuck.
    console.warn('[sync] Drain failed:', error)
  } finally {
    drainInFlight = false
  }

  // After the drain: schedule a retry if needed, or clear retry state when
  // the queue is empty.
  if (delayForRetry !== null) {
    backoffUntil = Date.now() + delayForRetry
    scheduleRetry(delayForRetry)
  } else {
    // The drain completed without a retryable failure. Check if the queue
    // still has pending work (new ops appeared during the drain).
    const hasMore = await hasPendingOps()
    if (hasMore) {
      // New ops arrived while we were draining — schedule a short retry so
      // they are picked up without waiting for the next user interaction.
      // Use a minimal delay (not exponential backoff) because these ops are
      // fresh, not failed — they just appeared during the active drain.
      scheduleRetry(1_000)
    } else {
      // Queue is empty — clear all retry state for a clean slate.
      clearRetryTimer()
      backoffUntil = 0
    }
  }
}

/** Quick check: does the sync queue have any pending operations? */
async function hasPendingOps(): Promise<boolean> {
  const { hasPendingSyncOperations } = await import('./db')
  return hasPendingSyncOperations()
}
