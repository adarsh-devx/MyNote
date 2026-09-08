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
  build: {
    rollupOptions: {
      output: {
        // Split the stable, rarely-changing vendor libraries out of the app
        // chunk so that:
        //  1. The per-deploy app chunk is smaller.
        //  2. Vendor code gets a stable content hash across app-only releases,
        //     so repeat visits re-use the cached vendor JS instead of
        //     re-downloading it.
        // framer-motion is required on the initial render (Home/NoteCard/
        // ComposerModal/Brand all statically import it), so lazy loading is not
        // an option — this split is the safe alternative and does not change
        // the loading graph (all chunks are still statically imported by the
        // entry, they are just emitted as separate files).
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
            return 'vendor-react'
          }
          if (id.includes('/node_modules/framer-motion/') || id.includes('/node_modules/motion-dom/')) {
            return 'vendor-motion'
          }
          if (id.includes('/node_modules/@tauri-apps/')) {
            return 'vendor-tauri'
          }
          return undefined
        },
      },
    },
  },
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
            // The three PWA icons live in public/icons/ and are copied into dist
            // by Vite, where workbox.globPatterns already precaches them. Also
            // adding them here makes the plugin register them a SECOND time with
            // revisions in the service-worker precache (a ~561 KB duplicate, 6
            // of the 14 precache entries). There is no favicon.ico in public/,
            // so no asset needs to be included explicitly.
            includeAssets: [],
            // The manifest's three icons are emitted into the SW precache a
            // second time under the "manifest icons" path while workbox's
            // globPatterns already precaches the same dist/icons/*.png files.
            // Disabling the manifest-icon pass keeps a single copy of each icon
            // in the precache (~561 KB of duplicated entries removed).
            includeManifestIcons: false,
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
