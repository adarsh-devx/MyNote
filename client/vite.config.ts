import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Tauri desktop builds embed the frontend into the executable, so a service
// worker is not only unnecessary there, it is harmful: the shared WebView2
// profile throttles SW update checks (once per 24h) and kept serving a stale
// precache (pre-fix JS) after an app update. The Tauri build sets
// VITE_SKIP_PWA=1 (see scripts/tauri-frontend-build.mjs); a plain
// `npm run build` leaves the PWA/service worker fully enabled.
const isTauriBuild = process.env.VITE_SKIP_PWA === '1'

export default defineConfig({
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  plugins: [
    react(),
    // Service worker is web/PWA-only. In Tauri the app runs from embedded
    // assets and must never register or use a service worker.
    ...(isTauriBuild
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'icons/*.png'],
            manifest: {
              name: 'MyNotes',
              short_name: 'MyNotes',
              description: 'Keep your thoughts. Keep your tasks.',
              theme_color: '#f7f6f2',
              background_color: '#f7f6f2',
              display: 'standalone',
              scope: '/',
              start_url: '/',
              icons: [
                {
                  src: 'icons/icon-192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
                {
                  src: 'icons/icon-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                },
                {
                  src: 'icons/icon-maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
              // Do NOT add runtimeCaching for /api/* here.
              // All API routes contain authenticated user data and must not be cached.
            },
          }),
        ]),
  ],
})
