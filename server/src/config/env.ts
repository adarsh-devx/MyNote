/**
 * Centralized access to server environment variables.
 *
 * Values are read lazily so configuration errors surface at the same point of
 * the startup sequence as before this refactor, with the same messages.
 * Secrets are never logged and never sent to the client.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set.`)
  }
  return value
}

export const env = {
  get port(): number {
    return Number(process.env.PORT) || 5000
  },

  get clientUrl(): string {
    return process.env.CLIENT_URL || 'http://localhost:5173'
  },

  /**
   * CORS allowlist for credentialed requests.
   *
   * Must include BOTH the hosted web client and the Tauri desktop webview
   * origins. The bundled desktop frontend is served from http://tauri.localhost
   * (Tauri v2 on Windows); if it is missing, every credentialed API call from
   * the desktop app — including GET /api/auth/me on startup — fails CORS and
   * the app falls back to the login page on every restart, even though the
   * WebView2 session cookie itself is persisted correctly.
   */
  get allowedOrigins(): string[] {
    const origins = new Set<string>()
    if (this.clientUrl) {
      origins.add(this.clientUrl.replace(/\/+$/, ''))
    }
    // Tauri v2 webview origins across platforms (Windows serves the bundled
    // frontend from http://tauri.localhost).
    origins.add('http://tauri.localhost')
    origins.add('https://tauri.localhost')
    origins.add('tauri://localhost')
    return [...origins]
  },

  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production'
  },

  get mongoUri(): string {
    return required('MONGODB_URI')
  },

  get sessionSecret(): string {
    return required('SESSION_SECRET')
  },

  get googleOAuth(): { clientId: string; clientSecret: string; callbackUrl: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new Error(
        'Google OAuth environment variables are not set. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL.',
      )
    }

    return { clientId, clientSecret, callbackUrl }
  },
}
