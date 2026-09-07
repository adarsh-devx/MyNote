import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { OfflineIndicator } from './components/OfflineIndicator'
import { getCurrentUser } from './lib/api'
import { initTauriNotifications } from './lib/notifications'
import type { User } from './types/user'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initialize Tauri notifications if running in desktop app
    initTauriNotifications()

    getCurrentUser()
      .then(setUser)
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
      <Home user={user} onLogout={() => setUser(null)} />
      <OfflineIndicator />
    </>
  )
}
