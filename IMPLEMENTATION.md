# MyNotes — Implementation Plan

## 1. Product goal

MyNotes is a personal, low-friction notes/task app.

Core flow:

Phone → quickly save something → cloud sync → open Windows app later → see the same item.

A Windows startup notification should only say:

> You have a new task

It must NOT reveal the task title/content in the notification.

## 2. MVP scope

### Must have
- Create Note
- Create Task
- Edit item
- Delete item
- Mark Task complete
- Search
- Filter: All / Tasks / Notes / Completed
- Persistent cloud storage
- User authentication
- Responsive mobile UI
- Installable PWA
- Windows desktop app
- Windows startup notification for newly synced tasks

### Explicitly out of MVP
- Collaboration
- Sharing
- Comments
- Subtasks
- Kanban
- Calendar
- AI
- Attachments
- Complex analytics
- Multiple workspaces

## 3. UI direction

- Minimal soft neo-brutalism
- Warm off-white background
- Black typography/borders
- White cards
- Subtle offset shadows
- Handwritten font for brand/headings/note titles
- Clean sans-serif for body/UI
- Small purposeful animations
- No visual clutter

Suggested fonts:
- Caveat for handwritten personality
- Inter for readable UI/body

## UI/UX SPEC — Single Source of Truth

### 1. Design personality

MyNotes should feel like a personal digital notebook, not Jira, Trello, Notion, or a generic CRUD dashboard.

Core visual direction:
- Minimal
- Soft neo-brutalism
- Cute/playful personality
- Calm and uncluttered
- Handwritten visual identity
- Fast to scan and use
- Desktop and mobile should feel like the same product

Avoid:
- Excessive cards
- Giant shadows on every element
- Rainbow gradients
- Glassmorphism
- Overly rounded "SaaS" UI
- Dense dashboards
- Unnecessary decorative elements

### 2. Color system

Base:
- Background: warm off-white around `#F7F6F2`
- Surface/card: `#FFFFFF`
- Primary text/border: near-black around `#111111`
- Secondary text: muted gray around `#555555`

Accent colors should be used sparingly:
- Task: soft red/coral
- Note: soft blue
- Completed/success: soft lime/green
- Optional highlight: soft yellow

Do not use more than one strong accent in the same visual area.

### 3. Typography

Use two font roles:

**Handwritten font**
- Brand/logo
- Main page headings
- Note/task titles
- Small personality copy and empty states

Preferred direction:
- Caveat or a similar natural handwritten font
- It must look intentional and readable, not childish or Comic Sans-like

**Clean UI font**
- Body text
- Navigation
- Buttons
- Search
- Metadata
- Form controls

Preferred:
- Inter or equivalent clean sans-serif

Never use the handwritten font for long paragraphs.

### 4. Spacing and layout

Use a generous but compact layout.

Desktop:
- Main content max width: approximately 1100–1150px
- Horizontal page padding: approximately 20–32px
- Section spacing: approximately 24–80px depending on hierarchy
- Card gap: approximately 16–20px

Mobile:
- Page padding: approximately 12–16px
- Single-column note list
- Controls must remain thumb-friendly
- Avoid horizontal overflow

Use consistent spacing tokens rather than arbitrary one-off values.

### 5. Borders and shadows

Neo-brutalist treatment should be subtle.

Standard:
- 2px solid near-black border
- Small offset shadow, generally 3–6px
- Modal/popover may use a slightly larger 6–10px offset

Do not stack multiple shadows.

Interactive elements may move 1–2px on hover/press to reinforce the physical-paper feel.

### 6. Home screen

The home screen is the primary screen and should open directly to the user's items.

Structure:

1. Top navigation
2. Friendly heading/intro
3. Quick-create input/button
4. Filter row
5. Notes/tasks grid or list
6. Empty state when nothing matches

Top navigation:
- Left: `mynotes` handwritten brand + small mark
- Right: search + settings
- Keep navigation visually light

Hero copy:
- Small eyebrow such as `your little second brain`
- Large handwritten heading such as `What's on your mind?`
- Short clean supporting text

Quick-create:
- Large full-width or prominent input/button
- Dashed or lightly emphasized border
- Placeholder: `Write something...`
- Clicking opens the composer/editor

Filters:
- `All`
- `Tasks`
- `Notes`
- `✓ Completed`

Active filter should have a clear black filled state.

### 7. Note/task cards

Cards should be simple and readable.

Each card may contain:
- Type pill
- Delete/action control
- Handwritten title
- Short body preview
- Task completion action when type is task

Task card:
- Soft coral/red type pill
- Completion control near the bottom

Note card:
- Soft blue type pill

Completed task:
- Reduced visual emphasis
- Title/content can use muted styling
- Completion state must remain obvious

Do not display unnecessary metadata in the MVP.

### 8. Create/edit experience

Use a focused modal/editor rather than a complicated multi-field form.

Composer contains:
- Close button
- Small `new` eyebrow
- Handwritten heading
- Task/Note switch
- Title input
- Content textarea
- Primary save button

Behavior:
- Title gets focus automatically
- Save is obvious
- Clicking outside the modal may close it only if there is no unsaved content; otherwise ask/handle safely
- Escape should close the modal when appropriate
- Empty title should not create an item

Future full-screen editor can replace the modal if long-form writing becomes important.

### 9. Empty states

Empty states should feel human, not like an error page.

Examples:
- `Nothing here.`
- `Your brain is suspiciously quiet. 👀`

Use the handwritten font for the main empty-state line.

Avoid large illustrations in the MVP.

### 10. Search

Desktop:
- Search field visible in the top navigation.

Mobile:
- Search may collapse to an icon and expand when tapped.

Search should match:
- Title
- Content

Search must be fast and visually unobtrusive.

### 11. Settings

Keep settings intentionally small in MVP:

- Account
- Appearance
- Notifications
- About

Do not build a large settings dashboard.

### 12. Responsive behavior

Desktop:
- Two-column card layout is acceptable
- Spacious top navigation
- Search can stay visible

Tablet:
- Maintain two columns when space permits
- Reduce horizontal spacing

Mobile:
- One-column layout
- Compact navigation
- Search collapses
- Composer becomes nearly full width
- Cards remain easy to tap
- No tiny controls
- No horizontal scrolling

### 13. Motion and micro-interactions

Use Framer Motion sparingly.

Allowed:
- Card entrance: subtle fade + 6–10px upward movement
- Modal: fade + small upward/scale entrance
- Hover: 1–2px movement
- Button press: tiny scale/translation
- Filter transitions: subtle

Avoid:
- Constant floating animations
- Large page transitions
- Excessive bouncing
- Animation on every element

Animation should make the app feel alive, not slow.

### 14. Startup notification UI

The Windows startup notification is intentionally minimal.

Primary message:
`You have a new task`

Multiple pending tasks:
`You have new tasks`

The notification MUST NOT expose:
- Task title
- Task content
- Priority
- Project name
- Other private note information

The notification action opens/focuses the MyNotes desktop app.

Visual direction:
- Small
- Cute
- Clean
- Consistent with MyNotes branding
- Tiny brand mark/handwritten identity is allowed

Do not turn the notification into a task preview card.

### 15. Accessibility

- Maintain readable contrast
- Buttons need accessible labels
- Keyboard navigation must work on desktop
- Focus states must be visible
- Do not communicate state using color alone
- Touch targets should be comfortably tappable on mobile
- Respect reduced-motion preferences where practical

### 16. Component conventions

Suggested React component structure:

```text
src/
├── components/
│   ├── Brand.tsx
│   ├── SearchBar.tsx
│   ├── FilterTabs.tsx
│   ├── NoteCard.tsx
│   ├── EmptyState.tsx
│   ├── ComposerModal.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── IconButton.tsx
│       ├── Input.tsx
│       └── Textarea.tsx
├── pages/
│   ├── Home.tsx
│   ├── Login.tsx
│   └── Settings.tsx
├── hooks/
├── lib/
├── types/
└── App.tsx
```

Prefer small reusable components over one huge `App.tsx`.

### 17. UI implementation rule

Before adding a new visual element, ask:

> Does this make capturing, finding, or completing a note/task easier?

If not, do not add it to the MVP.

The product should feel intentionally simple.

## 4. Frontend

React + TypeScript + Vite.

TypeScript is mandatory for the frontend. Use `.ts` and `.tsx` files; do not revert the project to JavaScript.

Next.js is intentionally NOT used. The app is a client-heavy personal application, so React + Vite is the simpler and more appropriate choice.

Initial MVP currently contains:
- Home screen
- Search
- Filters
- Note/task cards
- Create modal
- Local in-memory CRUD
- Task completion
- Delete
- Empty state
- Responsive layout

Next frontend steps:
1. Add React Router only if multiple routes become necessary.
2. ~~Add API client.~~ (Done in Phase 2)
3. ~~Replace local state with server persistence.~~ (Done in Phase 2)
4. ~~Add edit flow.~~ (Done in Phase 2)
5. ~~Add loading/error states.~~ (Done in Phase 2)
6. ~~Add auth screens.~~ (Done in Phase 3)
7. ~~Add PWA manifest/service worker.~~ (Done in Phase 4)
8. Add offline cache + sync conflict handling.

## 5. Backend

Node.js + Express + TypeScript.

TypeScript is also mandatory for the backend. Use `.ts` files and a proper `tsconfig.json`.

Planned API:

### Auth
- POST /api/auth/google
- GET /api/auth/me
- POST /api/auth/logout

### Notes
- GET /api/notes
- POST /api/notes
- GET /api/notes/:id
- PATCH /api/notes/:id
- DELETE /api/notes/:id

### Tasks
Tasks can either use a dedicated route or share the notes resource with `type: task`.

Recommended shared resource for MVP:
- GET /api/items
- POST /api/items
- PATCH /api/items/:id
- DELETE /api/items/:id

## 6. MongoDB model

Recommended document:

{
  _id,
  userId,
  title,
  content,
  type: "note" | "task",
  completed,
  createdAt,
  updatedAt,
  notificationState
}

`notificationState` should track whether a task has already triggered the desktop "new task" notification.

Do NOT put notification state only in localStorage because the phone and PC need a shared source of truth.

## 7. Sync strategy

MVP:
- Server is the source of truth.
- Client fetches items after login.
- Mutations immediately update the server.
- UI uses optimistic updates where safe.
- On reconnect, refetch changed items.

Later:
- IndexedDB/local cache
- Offline mutation queue
- Last-write-wins or explicit conflict resolution

## 8. New-task notification logic

When a task is created:

1. Server stores the task.
2. Task has `notificationState: pending`.
3. Windows desktop app starts with Windows.
4. Desktop app authenticates/checks the user's account.
5. It asks the API for tasks with pending notification state.
6. If at least one exists, show only:
   `You have a new task`
7. Do not include title/content/priority in the OS notification.
8. Mark notification state as delivered after successful display.
9. Clicking notification opens the MyNotes desktop app.

For multiple pending tasks, display:
`You have new tasks`

Do not repeatedly notify for the same task on every startup.

## 9. Desktop implementation

Recommended: Tauri + React.

Responsibilities:
- Windows app shell
- Taskbar installation/pinning support
- Windows startup launch
- Native notification
- Notification click → focus/open app

The web/PWA and desktop app should share the same React UI where practical.

## 10. Authentication

Recommended MVP:
- Google OAuth

Reason:
- Same account on phone and PC
- No custom password-reset/security system to maintain
- Low friction for a personal app

The backend must still verify Google identity server-side.

## 11. Security

- Never trust `userId` from the client.
- Derive user identity from the authenticated session/token.
- Every item query must be scoped to the authenticated user.
- Validate title/content/type on the server.
- Never expose MongoDB credentials to the client.
- Use HTTPS in production.
- Keep secrets in environment variables.

## 12. Implementation order

### Phase 1 — UI
- [x] React + TypeScript + Vite foundation
- [x] Home UI
- [x] Create modal
- [x] Local CRUD
- [x] Responsive styling
- [x] Component-based architecture
- [x] TypeScript types for notes/items
- [x] Composer Escape handling and dirty backdrop protection

### Phase 2 — Backend
- [x] Express setup
- [x] MongoDB connection
- [x] Item model
- [x] CRUD endpoints
- [x] Validation/error middleware
- [x] Temporary dev-user identity
- [x] Frontend API layer
- [x] Frontend integration (Home, Composer, NoteCard)
- [x] Loading and error states
- [x] Edit flow
- [x] TypeScript types updated (id: string)

### Phase 3 — Auth + sync
- [x] Google auth (Passport.js + Google OAuth 2.0)
- [x] User model (Mongoose with googleId, email, name, avatarUrl)
- [x] Session management (express-session + connect-mongo)
- [x] Auth middleware (requireAuth)
- [x] Protected API routes (all item routes require authentication)
- [x] Replace dev-user with authenticated user identity
- [x] Login page (Neo-brutalist Google sign-in button)
- [x] Auth state management (check /api/auth/me on startup)
- [x] Logout functionality
- [x] Cross-device sync (items scoped to authenticated user)

### Phase 4 — PWA
- [x] Web App Manifest (vite-plugin-pwa)
- [x] Service Worker (Workbox + autoUpdate)
- [x] App Shell Caching (static assets)
- [x] Offline App Shell (loads UI without network)
- [x] PWA Icons (192x192, 512x512, maskable)
- [x] Install Prompt (browser native + manual)
- [x] Offline Indicator component
- [x] Apple Touch Icon support
- [x] Theme color meta tags
- [x] Production build verification

### Phase 5 — Windows app
- [x] Tauri v2 wrapper (single main window)
- [x] Windows autostart (official tauri-plugin-autostart, Run key, `--autostart` flag)
- [x] Background-first lifecycle: close window → hidden in tray (polling keeps running)
- [x] System tray (Open MyNotes / Quit MyNotes; left-click opens)
- [x] Single instance (tauri-plugin-single-instance) — no duplicate pollers; notification click / second launch focuses the running window
- [x] Hidden launch at Windows logon (no window popup at boot)
- [x] Native Windows notifications (via tauri-plugin-notification)
- [x] Background polling every ~20s for pending tasks (works with window closed)
- [x] No toast while the main window is focused (WhatsApp-style)
- [x] Notification privacy (only count, no task details)
- [x] Mark delivered endpoint (atomic server-side, after successful show)
- [x] Backend notification endpoints (GET /pending, POST /delivered)
- [x] User isolation (server-side userId from session)
- [x] Shared React UI (same as web/PWA)
- [x] Production desktop build pinned to the deployed API via `client/.env.tauri` (build fails if VITE_API_URL is localhost/missing)

### Phase 6 — Polish
- [ ] Edit experience
- [ ] Better empty/loading/error states
- [ ] Micro-interactions
- [ ] Accessibility pass
- [ ] Production deployment

## 13. MVP acceptance criteria

The MVP is complete when:

1. A user can sign in on phone and PC with the same account.
2. A task created on phone appears on PC.
3. A note created on PC appears on phone.
4. Editing/deleting an item syncs across devices.
5. Completing a task syncs across devices.
6. Search/filter works.
7. The Windows app can be installed and opened from the taskbar.
8. Windows startup can launch the app/background notification process.
9. A newly created task can produce a notification containing only:
   `You have a new task`
10. The same task does not cause repeated notifications after being acknowledged/delivered.
