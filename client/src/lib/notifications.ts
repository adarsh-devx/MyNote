import { getCurrentUser } from './api'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// Check if running in Tauri
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

// Get pending notification count from the server
async function getPendingCount(): Promise<number> {
  const response = await fetch(`${BASE_URL}/items/notifications/pending`, {
    credentials: 'include',
  })

  if (!response.ok) {
    return 0
  }

  const data = await response.json()
  return data.count ?? 0
}

// Mark all pending notifications as delivered
async function markDelivered(): Promise<void> {
  await fetch(`${BASE_URL}/items/notifications/delivered`, {
    method: 'POST',
    credentials: 'include',
  })
}

// Show Windows notification using Tauri
async function showNotification(count: number): Promise<void> {
  if (!isTauri()) {
    return
  }

  try {
    // Dynamic import to avoid issues in web builds
    const { invoke } = await import('@tauri-apps/api/core')

    const title = 'MyNotes'
    const body = count === 1
      ? 'You have a new task.'
      : 'You have new tasks.'

    // Use Tauri notification plugin
    await invoke('plugin:notification|show_notification', {
      title,
      body,
    })
  } catch (error) {
    console.error('Failed to show notification:', error)
  }
}

// Main function to check and show pending notifications
export async function checkPendingNotifications(): Promise<void> {
  try {
    // Check if user is authenticated
    await getCurrentUser()

    // Get pending count
    const count = await getPendingCount()

    if (count > 0) {
      // Show notification
      await showNotification(count)

      // Mark as delivered
      await markDelivered()
    }
  } catch {
    // User not authenticated or API unavailable - do nothing
  }
}

// Initialize Tauri event listener
export function initTauriNotifications(): void {
  if (!isTauri()) {
    return
  }

  // Listen for the startup event from Rust
  window.addEventListener('check-pending-notifications', () => {
    void checkPendingNotifications()
  })
}
