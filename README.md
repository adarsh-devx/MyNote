# MyNotes

*"Keep your thoughts. Keep your tasks."*

MyNotes is a personal notes and tasks app designed for quick capture on your phone and seamless access on your desktop. The core idea is simple: **phone capture → cloud sync → PC access**. Jot down a thought or task on the go, and it's waiting on your PC when you sit down — with desktop notifications for new tasks created while you were away.

## Features

- **Notes** — capture thoughts, links, anything you don't want to forget
- **Tasks** — with completion toggle and animated checkmark
- **Search** — instant filtering across titles and content
- **Filters** — All / Tasks / Notes / Completed
- **Google login** — one-click sign-in, no passwords
- **Cloud persistence** — everything stored in MongoDB, scoped to your account
- **Deleted / Trash** — deleted items are recoverable; restore or delete forever
- **Profile management** — editable display name with avatar
- **Settings** — desktop notification preference, app info
- **Responsive mobile UI** — touch-friendly layout down to small phones
- **PWA support** — installable from the browser on Android/desktop
- **Windows desktop app** — native installer, system tray, close-to-tray
- **Windows notifications** — generic "You have a new task" alerts for tasks created from another device
- **Notification click-to-focus** — clicking a toast opens/focuses MyNotes
- **Autostart** — optionally runs hidden in the tray at Windows login
- **Single-instance** — launching it twice focuses the existing window
- **Optimistic UI** — create, edit, toggle, delete, and restore feel instant
- **Offline-first** — works without internet; local-first mutations via IndexedDB, background sync queue, automatic reconciliation when online

## Screenshots

<!-- Screenshots can be added here later, e.g. mobile capture view, desktop grid, tray notification. -->

## Tech Stack

**Frontend**
- React 19 + TypeScript + Vite
- Plain CSS (soft neo-brutalist design system)
- Framer Motion
- Lucide React icons
- vite-plugin-pwa
- Fontsource (self-hosted fonts: Caveat, Inter)

**Backend**
- Node.js + Express + TypeScript
- MongoDB + Mongoose
- Passport (Google OAuth 2.0)
- Express Session + connect-mongo (server-side sessions)

**Desktop**
- Tauri 2 + Rust
- Windows toast notifications (WinRT)
- System tray, autostart, single-instance plugins

## Architecture

```
Web / PWA:    React (browser)  →  Express API  →  MongoDB
Desktop:      Tauri (WebView2) →  React        →  Express API  →  MongoDB
Auth:         Google OAuth     →  server-side session  →  MongoDB session store
```

The Express API is the source of truth: every item query is scoped server-side to the authenticated user, and the client never supplies user identity. The frontend applies optimistic updates for instant feedback, persists mutations to a local IndexedDB sync queue, and reconciles with the server in the background. **Offline-first**: the app works without internet — local mutations are durable and automatically synced when connectivity returns. Previously synced notes/tasks are visible offline, and all mutations (create/edit/toggle/delete/restore) work offline.

## Getting Started

### Prerequisites
- Node.js 20+
- A MongoDB instance (local or Atlas)
- Google OAuth credentials (see [Environment Variables](#environment-variables))

### Install

```bash
git clone https://github.com/adarsh-devx/MyNote.git
cd MyNote

# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### Development

```bash
# Terminal 1 — API server (http://localhost:5000)
cd server
npm run dev

# Terminal 2 — Vite dev server (http://localhost:5173)
cd client
npm run dev
```

### Production

```bash
# Backend
cd server
npm run build
npm start

# Frontend (web/PWA)
cd client
npm run build

# Windows desktop app (NSIS + MSI installers)
cd client
npm run tauri build
```

The Tauri build script sets the production API URL and skips the PWA service worker automatically for desktop bundles.

## Environment Variables

Copy the provided examples and fill in real values — never commit them.

**`server/.env`**

| Variable | Purpose |
|---|---|
| `PORT` | Port the API server listens on (default `5000`) |
| `MONGODB_URI` | MongoDB connection string (required) |
| `CLIENT_URL` | Frontend origin, used for CORS and post-login redirect |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins for CORS and OAuth redirect (optional, defaults to CLIENT_URL + Tauri origins) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (required) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (required) |
| `GOOGLE_CALLBACK_URL` | Full OAuth callback URL (required) |
| `SESSION_SECRET` | Secret for signing session cookies (required) |

**`client/.env`**

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API base URL (default `http://localhost:5000/api`) |

## API Overview

All item and profile endpoints require an authenticated session.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/auth/google` | Start Google OAuth flow |
| `GET` | `/api/auth/google/callback` | OAuth callback |
| `GET` | `/api/auth/me` | Current authenticated user |
| `PATCH` | `/api/auth/me` | Update display name |
| `POST` | `/api/auth/logout` | Destroy session |
| `GET` | `/api/items` | List active items |
| `POST` | `/api/items` | Create a note/task |
| `PATCH` | `/api/items/:id` | Update title/content/type/completion |
| `DELETE` | `/api/items/:id` | Soft-delete (moves to trash) |
| `GET` | `/api/items/deleted` | List deleted items |
| `PATCH` | `/api/items/:id/restore` | Restore a deleted item |
| `DELETE` | `/api/items/:id/permanent` | Permanently delete |
| `GET` | `/api/items/notifications/pending` | Count of pending task notifications |
| `POST` | `/api/items/notifications/delivered` | Mark pending notifications delivered |

Rate limiting is applied to authentication and API routes to guard against abuse.

## PWA

The web build is a full PWA: it can be installed from the browser and runs in a standalone window with its own icons and app shell. Static assets are precached for fast loads, but **API responses are never cached** — authenticated data always goes to the network.

## Windows Desktop App

The desktop build is a native Windows app powered by Tauri:

- **Installer** — NSIS (`.exe`) and MSI installers
- **System tray** — MyNotes lives in the tray; left-click opens it
- **Close-to-tray** — closing the window keeps the app running in the background
- **Autostart** — launches hidden in the tray when Windows starts
- **Single-instance** — a second launch focuses the running app
- **Notifications** — when a task is created from another device (e.g. your phone), a generic Windows toast appears — no task content is shown
- **Click-to-focus** — clicking the toast opens/focuses MyNotes

Quit fully via the tray menu's *Quit MyNotes*.

## Project Structure

```
MyNotes/
├── client/                  # React + TypeScript + Vite frontend
│   ├── src/
│   │   ├── components/      # UI components (cards, modals, search, profile…)
│   │   ├── pages/           # Home, Login
│   │   ├── hooks/           # useFocusTrap, useSyncStatus
│   │   ├── lib/             # API client, notification polling, utilities,
│   │   │                    # offline-first (db, store, syncEngine, authCache)
│   │   ├── types/           # Shared TypeScript types
│   │   └── styles.css       # Design system
│   ├── src-tauri/           # Tauri 2 desktop shell (Rust)
│   ├── scripts/             # Production Tauri frontend build script
│   └── vite.config.ts
├── server/                  # Express + TypeScript API
│   └── src/
│       ├── config/          # env, passport (Google OAuth)
│       ├── controllers/     # Request handlers
│       ├── middleware/      # auth, session, validation, rate limiting, errors
│       ├── models/          # Mongoose schemas (Item, User)
│       ├── routes/          # /api/auth, /api/items
│       ├── services/        # Business logic
│       └── server.ts
└── README.md
```

## Future Improvements

Honest ideas, not promises:

- Better long-note presentation
- More granular notification controls
- Additional themes (dark mode)
- Browser notification support (currently Tauri-only)
- Real-time cross-device sync (currently polling-based, ~20s latency)
- Auto-purge of old trash items

## License

No license has been added yet — licensing can be chosen and added separately.
