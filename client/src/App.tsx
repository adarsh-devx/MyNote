import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { OfflineIndicator } from './components/OfflineIndicator'
import { getCurrentUser } from './lib/api'
import {
  checkPendingNotifications,
  initTauriNotifications,
  isTauri,
} from './lib/notifications'
import type { User } from './types/user'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initialize Tauri notifications if running in desktop app.
    // Returns a cleanup function that unregisters the Tauri event listener.
    const cleanupNotifications = initTauriNotifications()

    getCurrentUser()
      .then((authenticatedUser) => {
        setUser(authenticatedUser)
        // Session confirmed — run the pending notification check right away
        // so startup does not race the 2s Rust event. Tauri desktop only:
        // the web PWA must never show or consume desktop notifications.
        if (isTauri()) {
          void checkPendingNotifications()
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))

    return cleanupNotifications
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
      <Home user={user} onLogout={() => setUser(null)} />
      <OfflineIndicator />
    </>
  )
}
