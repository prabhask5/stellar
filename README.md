# Stellar

A cinematic, offline-first productivity suite that synchronizes across devices and integrates with a browser extension for distraction-free focus sessions. Built with a sophisticated local-first architecture that ensures your data is always available—even without an internet connection.

**Live:** [stellarplanner.vercel.app](https://stellarplanner.vercel.app)

---

## Why Stellar?

Most productivity apps fail you the moment your connection drops. Stellar was architected from the ground up to never let that happen. Every interaction is instant because reads and writes happen locally first. Your data syncs seamlessly in the background when you're online, and you can keep working without interruption when you're not.

---

## Features

### Goal Lists
Create organized lists of goals with visual progress tracking.
- **Completion goals**: Simple checkbox-style goals for binary tasks
- **Incremental goals**: Track numeric progress (e.g., "Read 30/100 pages")
- **Live color gradients**: Each goal displays a red-to-green gradient based on completion percentage
- **Drag-and-drop reordering**: Reorganize goals with smooth animations
- **Progress aggregation**: Lists show overall completion percentage with visual indicators

### Daily Routines
Build consistent habits with recurring goals that track daily progress.
- **Days-of-week scheduling**: Choose which days each routine is active (e.g., weekdays only)
- **Date range support**: Set start and optional end dates for time-boxed routines
- **Monthly calendar view**: See your entire month color-coded by daily completion
- **Quick-select buttons**: Instantly set common patterns (Every Day, Weekdays, Weekends)
- **Daily progress tracking**: Click any day to view and update that day's routines

### Tasks
Manage both daily quick tasks and long-term planning with due dates.
- **Daily tasks**: Quick-add tasks for today with checkbox completion
- **Long-term tasks**: Plan ahead with due dates and category organization
- **Task categories**: Create color-coded categories for visual organization
- **Commitments system**: Organize responsibilities into Career, Social, and Personal sections
- **Drag-and-drop**: Reorder tasks and commitments effortlessly

### Focus Timer
Pomodoro-style focus sessions with customizable durations.
- **Configurable timers**: Adjust focus duration (up to 4 hours), short breaks (up to 20 min), and long breaks (up to 1 hour)
- **Cycle tracking**: Automatic long breaks after configurable number of focus cycles
- **Auto-start options**: Optionally auto-start breaks and focus phases
- **Smooth ring animation**: Cinematic circular progress indicator with fluid animations
- **Daily focus time tracking**: See total focus time accumulated today
- **Session persistence**: Sessions survive page refreshes and browser restarts

### Block Lists
Define websites to block during focus sessions, synced with the browser extension.
- **Multiple lists**: Organize blocks by category (e.g., "Social Media", "News Sites")
- **Days-of-week scheduling**: Block sites only on specific days
- **Enable/disable toggle**: Quickly activate or deactivate lists
- **Domain-based blocking**: Blocks entire domains including subdomains
- **Real-time sync with extension**: Changes appear in your browser instantly

### Stellar Focus Browser Extension
Companion extension that enforces your block lists during focus sessions.
- **Works offline**: Continues blocking even without internet (using cached data)
- **Beautiful blocked page**: Cinematic interstitial with countdown timer
- **Real-time status**: See current focus phase and time remaining
- **Multiple browser support**: Available for Chrome (Manifest V3) and Firefox
- **[View Extension README →](./stellar-focus/README.md)**

---

## Offline-First Architecture

Stellar implements a true local-first architecture. This isn't just caching—it's a complete paradigm shift in how the application handles data.

### How It Works

1. **All reads from local**: Every query reads from IndexedDB (via Dexie). The UI never waits for the network.
2. **Instant writes**: User actions immediately update local storage and render instantly.
3. **Background sync**: Every write creates an entry in a persistent outbox queue.
4. **Automatic reconciliation**: When online, the sync engine ships pending changes to Supabase and pulls remote updates.
5. **Conflict resolution**: Last-write-wins with intelligent protection for in-flight changes.

### Key Sync Features

- **Atomic transactions**: Local writes and sync queue entries happen in a single Dexie transaction—no orphaned states
- **Mutex-based concurrency**: Proper async locking prevents concurrent sync cycles from corrupting state
- **Recently-modified protection**: 5-second TTL prevents remote pull from overwriting fresh local changes
- **Pending entity detection**: Never overwrites entities that have unsynced local modifications
- **Retry with exponential backoff**: Failed sync items retry up to 5 times before quarantine
- **Real-time subscriptions**: Supabase WebSocket channels push instant updates from other devices
- **Visibility-based sync**: Syncs on tab focus change for fresh data after being away

### Offline Authentication

Stellar goes beyond typical offline support by enabling full authentication without network access.

- **Credential caching**: On successful login, credentials are hashed and stored locally
- **PBKDF2-SHA256**: Industry-standard password hashing with 100,000 iterations
- **Timing-safe comparison**: Prevents timing attacks during password verification
- **Automatic session extension**: Offline sessions extend up to 7 days
- **Seamless reconnection**: When network returns, automatically re-authenticates with Supabase

---

## Progressive Web App (PWA)

Install Stellar on any device for a native app experience.

### PWA Features
- **Installable**: Add to home screen on iOS, Android, Windows, macOS, and Linux
- **Offline support**: Full functionality without internet connection
- **Smart caching**: Service worker precaches critical assets on install
- **Background sync**: Queued changes sync when connection returns
- **Update prompts**: Clean in-app notification when new version is available
- **Cache versioning**: Old caches automatically cleaned on update

### Service Worker Strategy
- **Network-first for HTML**: Always tries to get fresh content, falls back to cache
- **Cache-first for assets**: CSS, JS, images served instantly from cache
- **Stale-while-revalidate**: Background updates for optimal freshness
- **Version-stamped caches**: Each build generates unique cache namespace

---

## Design System

Stellar features a custom-built design system with cinematic space-themed aesthetics.

### Visual Theme
- **Deep space color palette**: Rich purples (#6c5ce7), magentas (#ff79c6), cyans (#00d4ff), and greens (#26de81)
- **Animated starfield backgrounds**: Three parallax star layers with subtle movement
- **Nebula effects**: Soft gradient overlays creating depth
- **Orbital animations**: Rotating rings and floating particles
- **Shooting stars**: Occasional diagonal streaks across backgrounds
- **Glassmorphism**: Frosted glass effect on cards and modals

### UI Components
- **Smooth transitions**: 0.3s ease-out on all interactive elements
- **Hover states**: Subtle glow effects and scale transforms
- **Loading states**: Shimmer placeholders matching content shapes
- **Toast notifications**: Slide-in messages for user feedback
- **Modal system**: Backdrop blur with centered/top-aligned content
- **Responsive breakpoints**: Mobile-first design scaling to desktop

### Accessibility
- **Keyboard navigation**: Full tab support with visible focus rings
- **ARIA labels**: Screen reader support for interactive elements
- **Color contrast**: WCAG-compliant text on all backgrounds
- **Reduced motion**: Respects `prefers-reduced-motion` preference

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | SvelteKit 2 with Svelte 5 |
| **Language** | TypeScript (strict mode) |
| **Local Database** | Dexie (IndexedDB wrapper) |
| **Remote Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth + custom offline auth |
| **Real-time** | Supabase Realtime (WebSocket) |
| **Styling** | Custom CSS with CSS variables |
| **Date Handling** | date-fns |
| **Build Tool** | Vite 6 |
| **Deployment** | Vercel |

---

## Architecture Highlights

### Sync Engine (`src/lib/sync/engine.ts`)
The heart of offline-first functionality. 700+ lines of carefully orchestrated synchronization logic:
- 12 parallel Supabase queries in `pullRemoteChanges()`
- Atomic batch inserts wrapped in Dexie transactions
- Entity-level conflict detection with pending queue checks
- Tab visibility listeners for intelligent sync timing

### Database Layer (`src/lib/db/`)
- **Schema versioning**: 7 migration versions with upgrade functions
- **Repository pattern**: Clean separation of data access logic
- **15 IndexedDB tables**: Goals, routines, tasks, focus sessions, auth, and more
- **Compound indexes**: Optimized queries for common access patterns

### State Management (`src/lib/stores/`)
- **Svelte 5 runes**: Modern reactive primitives with `$state` and `$derived`
- **Store-per-domain**: Isolated stores for goals, routines, tasks, focus, and sync status
- **Local-first reads**: Stores load from IndexedDB immediately, subscribe to sync events
- **Optimistic updates**: UI reflects changes before sync confirms

### Focus Timer System
- **Millisecond precision**: Timer state preserved across page loads via `phase_remaining_ms`
- **Alarm-based ticks**: Uses `setInterval` with drift correction
- **Phase transitions**: Automatic progression from focus → break → focus
- **Extension messaging**: Pushes real-time state to browser extension

---

## Project Structure

```
stellar/
├── src/
│   ├── routes/                    # SvelteKit pages
│   │   ├── (protected)/           # Authenticated routes
│   │   │   ├── goals/             # Goal lists feature
│   │   │   ├── routines/          # Daily routines feature
│   │   │   ├── tasks/             # Tasks feature
│   │   │   ├── focus/             # Focus timer feature
│   │   │   │   └── block-lists/   # Block list management
│   │   │   ├── calendar/          # Monthly calendar view
│   │   │   └── profile/           # User settings
│   │   ├── login/                 # Login page
│   │   ├── signup/                # Registration page
│   │   └── policy/                # Privacy policy
│   ├── lib/
│   │   ├── components/            # Reusable UI components
│   │   │   ├── focus/             # Focus timer components
│   │   │   └── Modal.svelte       # Modal dialog system
│   │   ├── db/                    # Dexie database layer
│   │   │   ├── schema.ts          # IndexedDB schema (7 versions)
│   │   │   └── repositories/      # Data access functions
│   │   ├── stores/                # Svelte reactive stores
│   │   ├── sync/                  # Sync engine & queue
│   │   │   ├── engine.ts          # Core sync orchestration
│   │   │   └── queue.ts           # Outbox queue management
│   │   ├── auth/                  # Authentication utilities
│   │   │   ├── crypto.ts          # PBKDF2 password hashing
│   │   │   ├── offlineCredentials.ts
│   │   │   └── offlineSession.ts
│   │   ├── supabase/              # Supabase client & types
│   │   ├── types.ts               # TypeScript interfaces
│   │   └── utils/                 # Helper functions
│   └── app.css                    # Global styles
├── static/
│   ├── sw.js                      # Service worker
│   ├── manifest.json              # PWA manifest
│   └── icons/                     # App icons
├── stellar-focus/                 # Browser extension
│   └── [See extension README]
└── supabase-schema.sql            # Database DDL
```

---

## Setup

### Prerequisites
- Node.js 18+
- A Supabase project

### 1. Clone and Install
```bash
git clone <repository-url>
cd stellar
npm install
```

### 2. Configure Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase-schema.sql` in the SQL Editor
3. Copy your project URL and anon key from Settings → API

### 3. Environment Variables
Create `.env`:
```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 5. Build for Production
```bash
npm run build
```

Deploy the `build` directory to Vercel, Netlify, or Cloudflare Pages.

---

## Browser Extension

The **Stellar Focus** extension enforces your block lists during focus sessions. It works offline, caches your session data, and displays a beautiful blocked page when you try to visit distracting sites.

**[View Full Extension Documentation →](./stellar-focus/README.md)**

Quick install:
- **Firefox**: Available on [Firefox Add-ons](https://addons.mozilla.org)
- **Chrome**: Load unpacked from `stellar-focus/dist-chrome`

---

## License

MIT License. See [LICENSE](./LICENSE) for details.
