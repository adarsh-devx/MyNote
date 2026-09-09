import { useEffect, useState } from 'react'
import { getSyncStatus } from '../lib/syncEngine'
import type { SyncStatus } from '../lib/syncTypes'

/**
 * Minimal hook exposing the sync engine's current status (Phase 5).
 *
 * Polls `getSyncStatus()` on a short interval and on visibility change.
 * The status is derived from existing module-level state — no new state
 * management is introduced. Intended for internal diagnostics and future
 * Phase 6 sync-status UI, NOT for a visible dashboard.
 *
 * Status values:
 *   - 'idle'     — queue empty, no work pending
 *   - 'syncing'  — drain actively processing operations
 *   - 'waiting'  — backoff timer active, next retry scheduled
 *   - 'paused'   — 401, waiting for re-authentication
 *   - 'offline'  — navigator.onLine is false
 */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)

  useEffect(() => {
    // Poll every 2 seconds — lightweight, no IndexedDB reads, just module-state.
    const interval = setInterval(() => {
      setStatus(getSyncStatus())
    }, 2_000)

    // Also update immediately on visibility change (tab refocus).
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        setStatus(getSyncStatus())
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return status
}
