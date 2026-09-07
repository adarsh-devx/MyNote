import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { OfflineIndicator } from './components/OfflineIndicator'
import { getCurrentUser } from './lib/api'
import {
  isTauri,
  startNotificationPolling,
  stopNotificationPolling,
} from './lib/notifications'
import type { User } from './types/user'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentUser()
      .then((authenticatedUser) => {
        setUser(authenticatedUser)
        // Session confirmed — start the background notification poller
        // (immediate first check, then every ~20s). Tauri desktop only:
        // the web PWA must never show or consume desktop notifications.
        // Polling stops on logout; it restarts after the next login
        // because the OAuth flow reloads the app.
        if (isTauri()) {
          startNotificationPolling()
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
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
          setUser(null)
        }}
      />
      <OfflineIndicator />
    </>
  )
}
