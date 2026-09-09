import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { OfflineIndicator } from './components/OfflineIndicator'
import { ApiError, getCurrentUser } from './lib/api'
import {
  cachedUserToUser,
  getCachedAuthUser,
  putCachedAuthUser,
} from './lib/authCache'
import type { CachedAuthUser } from './lib/syncTypes'
import { clearAllLocalData, clearCachedUser, hasPendingSyncOperations } from './lib/db'
import {
  isTauri,
  startNotificationPolling,
  stopNotificationPolling,
} from './lib/notifications'
import type { User } from './types/user'

/**
 * True only when the server itself answered "not authenticated" (401/403).
 * A fetch TypeError (offline / DNS / server down) is NOT proof of a logged-out
 * session, so it must never clear the cached authenticated state — that is
 * the core Phase 1 rule.
 */
function isAuthRejection(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrap(): Promise<void> {
      // 1. Offline-first hydration: if a previously verified profile exists,
      //    enter the app immediately — usable before any network response.
      //    Cache failures (private mode, quota) degrade to online-only flow.
      try {
        const cached = await getCachedAuthUser()
        if (cached && !cancelled) {
          setUser(cachedUserToUser(cached))
          setLoading(false)
        }
      } catch (error) {
        console.warn('[auth] Reading cached profile failed:', error)
      }

      // 2. Background re-validation against the server when reachable.
      try {
        const authenticatedUser = await getCurrentUser()

        if (cancelled) return

        // 1F — account isolation: a different account on this origin must
        // never see the previous account's cached notes. The previous
        // snapshot is read and compared before any cache write; on a switch
        // ALL local data is cleared, then the new profile is cached fresh.
        let previous: CachedAuthUser | null = null
        try {
          previous = await getCachedAuthUser()
        } catch (error) {
          console.warn('[auth] Reading cached profile failed:', error)
        }
        if (previous && previous.id !== authenticatedUser.id) {
          try {
            await clearAllLocalData()
          } catch (error) {
            console.warn('[auth] Clearing cache for account switch failed:', error)
          }
          previous = null
        }
        await putCachedAuthUser(authenticatedUser, previous)

        setUser(authenticatedUser)
        // Session confirmed — start the background notification poller
        // (immediate first check, then every ~20s). Tauri desktop only:
        // the web PWA must never show or consume desktop notifications.
        // Polling stops on logout; it restarts after the next login
        // because the OAuth flow reloads the app.
        if (isTauri()) {
          startNotificationPolling()
        }
      } catch (error) {
        if (cancelled) return

        if (isAuthRejection(error)) {
          // Server says the session is genuinely gone: drop the snapshot
          // AND evict the stale IndexedDB cache so the next page load does
          // not re-hydrate a dead session. Sync queue is deliberately left
          // intact — unsynced offline changes must survive session expiry.
          try {
            await clearCachedUser()
          } catch (cacheError) {
            console.warn('[auth] Clearing cached user on 401 failed:', cacheError)
          }
          setUser(null)
          return
        }

        // Network unreachable (fetch TypeError / timeout): NOT a logout.
        // If the cached profile already put us into the app, stay there in
        // offline mode (Home remains visible, OfflineIndicator shows). With
        // no cached profile (first-ever visit offline) `user` is still null
        // and the Login screen renders — no action needed here either.
        console.warn(
          '[auth] Session check unreachable; continuing with cached state:',
          error instanceof Error ? error.message : error,
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <main className="app-shell">
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <h2>Loading...</h2>
        </div>
        <OfflineIndicator />
      </main>
    )
  }

  if (!user) {
    return (
      <>
        <Login />
        <OfflineIndicator />
      </>
    )
  }

  return (
    <>
      <Home
        user={user}
        onLogout={() => {
          stopNotificationPolling()
          void (async () => {
            try {
              if (await hasPendingSyncOperations()) {
                // Phase 3: never silently wipe unsynced mutations. The local
                // items + queue are kept (and the cached profile with them,
                // so the account-isolation guard in bootstrap either wipes
                // them for a different account or resumes them for the same
                // account). The server session above is still destroyed.
                return
              }
              await clearAllLocalData()
            } catch (error) {
              console.warn('[auth] Clearing local cache on logout failed:', error)
            }
          })()
          setUser(null)
        }}
        onUserUpdated={(updated) => {
          setUser(updated)
          // Keep the snapshot fresh after profile edits (name change).
          void putCachedAuthUser(updated)
        }}
      />
      <OfflineIndicator />
    </>
  )
}
