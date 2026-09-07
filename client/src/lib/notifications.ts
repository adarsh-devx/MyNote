import { getCurrentUser } from './api'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// Check if running in Tauri.
// Tauri v2 always injects __TAURI_INTERNALS__ into app webviews; the __TAURI__
// global API namespace only exists when withGlobalTauri is enabled in
// tauri.conf.json (it is not in this project), so it is only a fallback.
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

// Get pending notification count from the server.
// Returns null when not signed in (a normal state before login) — not an error.
async function getPendingCount(): Promise<number | null> {
  const response = await fetch(`${BASE_URL}/items/notifications/pending`, {
    credentials: 'include',
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Pending notification check failed (HTTP ${response.status})`)
  }

  const data = await response.json()
  return data.count ?? 0
}

// Mark all pending notifications as delivered
async function markDelivered(): Promise<void> {
  const response = await fetch(`${BASE_URL}/items/notifications/delivered`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`Marking notifications delivered failed (HTTP ${response.status})`)
  }
}

// Show the Windows notification through the Tauri notification plugin.
// PRIVACY: the notification must only contain a generic count message —
// never task titles, content, or any other item details.
async function showNotification(count: number): Promise<void> {
  if (!isTauri()) {
    return
  }

  // Dynamic import to avoid issues in web builds
  const { isPermissionGranted, requestPermission, sendNotification } =
    await import('@tauri-apps/plugin-notification')

  let permissionGranted = await isPermissionGranted()
  if (!permissionGranted) {
    permissionGranted = (await requestPermission()) === 'granted'
  }

  if (!permissionGranted) {
    throw new Error('Notification permission was not granted')
  }

  const title = 'MyNotes'
  const body = count === 1 ? 'You have a new task.' : 'You have new tasks.'

  await sendNotification({ title, body })
}

// Only one pending-notification check may run at a time, so the startup
// session-confirmed check and the Tauri startup event can never double-fire
// (which would show duplicate Windows notifications).
let checkInFlight = false

// Main function to check and show pending notifications
export async function checkPendingNotifications(): Promise<void> {
  if (checkInFlight) {
    return
  }
  checkInFlight = true

  try {
    // Not signed in yet is a normal state (e.g. before login) — skip quietly
    try {
      await getCurrentUser()
    } catch {
      return
    }

    // Get pending count
    const count = await getPendingCount()
    if (count === null || count === 0) {
      return
    }

    // Show notification, then mark as delivered. Delivery is intentionally
    // after a successful display, so pending notifications are never
    // silently lost when showing fails.
    await showNotification(count)
    await markDelivered()
  } catch (error) {
    console.warn(
      '[notifications] Pending notification check failed:',
      error instanceof Error ? error.message : error,
    )
  } finally {
    checkInFlight = false
  }
}

// Initialize Tauri event listener.
// Returns a cleanup function that unregisters the listener. Safe against
// React StrictMode double-mounts: each mount registers its own listener and
// every unmount disposes it, so exactly one listener stays active.
export function initTauriNotifications(): () => void {
  if (!isTauri()) {
    return () => {}
  }

  let disposed = false
  let unlisten: (() => void) | null = null

  void (async () => {
    try {
      // Dynamic import to avoid issues in web builds
      const { listen } = await import('@tauri-apps/api/event')

      const stopListening = await listen('check-pending-notifications', () => {
        void checkPendingNotifications()
      })

      if (disposed) {
        // Unmounted before the async listener finished registering
        stopListening()
        return
      }

      unlisten = stopListening
    } catch (error) {
      console.warn(
        '[notifications] Failed to register Tauri startup listener:',
        error instanceof Error ? error.message : error,
      )
    }
  })()

  return () => {
    disposed = true
    unlisten?.()
    unlisten = null
  }
}
