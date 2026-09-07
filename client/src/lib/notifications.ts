import { getCurrentUser } from './api'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// How often the background poller asks the server for pending notifications.
// Chromium throttles plain setInterval chains in hidden windows, so the next
// tick is scheduled from the previous check's completion instead (timers
// scheduled from fetch continuations are not treated as chained timers).
const POLL_INTERVAL_MS = 20_000

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

// True while the main window is focused. While the user is actively looking
// at MyNotes, pending tasks are already visible in the UI, so toasts are
// suppressed (WhatsApp/Telegram-style: only notify when the app is in the
// background). A hidden or minimized window is never focused.
async function isMainWindowFocused(): Promise<boolean> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return await getCurrentWindow().isFocused()
  } catch {
    return true // If the check fails, err on the side of not notifying.
  }
}

// Only one pending-notification check may run at a time, so overlapping
// polls can never double-fire (which would show duplicate Windows toasts).
let checkInFlight = false

// Main function to check and show pending notifications.
// Suppressed while the user is actively using MyNotes.
export async function checkPendingNotifications(): Promise<void> {
  if (checkInFlight) {
    return
  }
  checkInFlight = true

  try {
    if (await isMainWindowFocused()) {
      return
    }

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

// Background notification polling. Runs indefinitely (including while the
// main window is hidden in the tray) until stopNotificationPolling is called.
// Each tick is scheduled from the previous tick's completion, so checks never
// overlap and network failures simply defer the next attempt.
let pollTimer: ReturnType<typeof setTimeout> | null = null

export function startNotificationPolling(): void {
  if (!isTauri() || pollTimer !== null) {
    return
  }

  const tick = (): void => {
    void checkPendingNotifications().finally(() => {
      pollTimer = setTimeout(tick, POLL_INTERVAL_MS)
    })
  }

  // Immediate first check (startup), then every POLL_INTERVAL_MS.
  tick()
}

export function stopNotificationPolling(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}