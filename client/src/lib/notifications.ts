const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const NOTIFICATION_PREF_KEY = 'mynotes:desktop-notifications'

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

// Show the Windows notification via the show_toast Tauri command (see
// src-tauri/src/lib.rs), which creates the toast with a click-to-focus
// handler attached. PRIVACY: the notification must only contain a generic
// count message — never task titles, content, or any other item details.
async function showNotification(count: number): Promise<void> {
  if (!isTauri()) {
    return
  }

  // Dynamic import to avoid issues in web builds
  const { isPermissionGranted, requestPermission } = await import(
    '@tauri-apps/plugin-notification'
  )

  let permissionGranted = await isPermissionGranted()
  if (!permissionGranted) {
    permissionGranted = (await requestPermission()) === 'granted'
  }

  if (!permissionGranted) {
    throw new Error('Notification permission was not granted')
  }

  const title = 'MyNotes'
  const body = count === 1 ? 'You have a new task.' : 'You have new tasks.'

  // Shown through the show_toast Rust command instead of the notification
  // plugin's sendNotification: the plugin's desktop API has no click/activation
  // support (its onAction listener only works on mobile), so the toast must be
  // created with its Windows Activated handler attached — that handler shows
  // and focuses the existing MyNotes window when the toast is clicked.
  // Title/body content is unchanged.
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('show_toast', { title, body })
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

// ── Notification preference ──────────────────────────────────────────────
// Persisted in localStorage per device. Defaults to true (enabled).
// The settings toggle reads/writes this; the poller checks it on every tick.
export function isNotificationEnabled(): boolean {
  try {
    const stored = localStorage.getItem(NOTIFICATION_PREF_KEY)
    return stored !== 'false' // default: enabled
  } catch {
    return true
  }
}

export function setNotificationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFICATION_PREF_KEY, String(enabled))
  } catch {
    // Storage unavailable — ignore silently.
  }
  // Disabling resets backoff: the disabled poller does no work anyway, and a
  // later re-enable starts from a clean, immediately-eligible state.
  if (!enabled) {
    clearNotificationRetry()
  }
}

// Only one pending-notification check may run at a time, so overlapping
// polls can never double-fire (which would show duplicate Windows toasts).
let checkInFlight = false

// ── Remote-change listener ───────────────────────────────────────────────
// Called when the poller detects that the server has pending items for this
// user (count > 0). Home registers refreshItems() here so the task list is
// updated in the same tick that triggers the desktop notification, without
// any additional polling.
let remoteChangeListener: (() => void) | null = null

export function setRemoteChangeListener(cb: (() => void) | null): void {
  remoteChangeListener = cb
}

// ── Retry / backoff for failed notification attempts ─────────────────────
// The server contract is count-based (one generic toast for the whole
// pending set, marked delivered in a single batch), so the retry unit is the
// pending batch rather than an individual item — no per-item ids exist
// client-side. A failure to *show* (permission denied, toast error) backs
// off before the next attempt; the poller keeps ticking on its normal
// schedule and simply skips attempts that are not yet eligible. Kept in
// memory only — nothing is persisted or sent to the server.
const MAX_RETRY_DELAY_MS = 5 * 60_000

type NotificationRetryState = {
  failures: number
  nextAttemptAt: number
}

let notificationRetry: NotificationRetryState | null = null

// 20s → 40s → 80s → 160s → capped at 5 minutes: a persistently unavailable
// notification environment is retried at most every five minutes instead of
// every poll cycle, while always becoming eligible again eventually.
function retryDelayFor(failures: number): number {
  return Math.min(POLL_INTERVAL_MS * 2 ** (failures - 1), MAX_RETRY_DELAY_MS)
}

function clearNotificationRetry(): void {
  notificationRetry = null
}

function recordNotificationFailure(): void {
  const failures = (notificationRetry?.failures ?? 0) + 1
  notificationRetry = {
    failures,
    nextAttemptAt: Date.now() + retryDelayFor(failures),
  }
}

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

    // Bounded backoff after display failures: skip this tick's attempt until
    // the retry delay has elapsed. The poll keeps running on its normal
    // schedule — only the attempt is deferred, so recovery needs no extra
    // timer.
    if (notificationRetry && Date.now() < notificationRetry.nextAttemptAt) {
      return
    }

    // Get pending count
    const count = await getPendingCount()
    if (count === null || count === 0) {
      // Nothing pending (or signed out) — nothing to retry.
      clearNotificationRetry()
      return
    }

    // Remote task(s) detected: notify Home so it pulls the latest server
    // items. This runs before the toast so the UI updates even if the
    // notification permission was not granted.
    remoteChangeListener?.()

    // Show notification, then mark as delivered. Delivery is intentionally
    // after a successful display, so pending notifications are never
    // silently lost when showing fails.
    try {
      await showNotification(count)
    } catch (error) {
      // The notification was NOT shown: leave it pending (never mark it
      // delivered) and back off before attempting it again.
      recordNotificationFailure()
      throw error
    }
    // Display succeeded — no backoff is needed for this batch anymore.
    clearNotificationRetry()
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

  // Respect the user's notification preference. If disabled, schedule a
  // re-check at the next interval instead of polling — this way toggling
  // the setting on takes effect within one poll cycle without a restart.
  const tick = (): void => {
    if (!isNotificationEnabled()) {
      pollTimer = setTimeout(tick, POLL_INTERVAL_MS)
      return
    }
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
  // Polling stopped (e.g. logout): drop retry bookkeeping with it so a later
  // session starts clean and the state can never accumulate.
  clearNotificationRetry()
}