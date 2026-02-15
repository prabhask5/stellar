# Stellar Planner

A self-hosted, offline-first productivity PWA for managing goals, tasks, routines, and focus sessions. Built with SvelteKit, Dexie.js, and Supabase, Stellar works entirely from your browser with full offline support, real-time multi-device sync, and a space-themed interface.

Try it at: [https://planner.prabhas.io/demo](https://planner.prabhas.io/demo)

---

## Documentation

| Document | Description |
|----------|-------------|
| [FRAMEWORKS.md](./FRAMEWORKS.md) | Complete guide to all frameworks and architectural patterns |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, sync engine, conflict resolution, auth flows |
| [@stellar/sync-engine](https://github.com/prabhask5/stellar-engine) | Sync engine, auth, conflict resolution, realtime |
| [stellar-focus/](./stellar-focus/README.md) | Companion browser extension for website blocking |

---

## Table of Contents

1. [Features](#features)
2. [Setup Guide to Self-Host](#setup-guide-to-self-host)
3. [Mobile Installation](#mobile-installation)
4. [Demo Mode](#demo-mode)
5. [Configuration](#configuration)
6. [Tech Stack](#tech-stack)
7. [Debug Mode](#debug-mode)
8. [Companion Extension](#companion-extension)

---

## Features

### Task Management
- **Daily Tasks**: A daily checklist with drag-to-reorder. Tasks reset each day so you start fresh.
- **Long-Term Tasks & Reminders**: Calendar-based planning with due dates, color-coded categories, and status grouping (overdue, due today, upcoming, completed). Items can be either **tasks** (with completion checkboxes) or **reminders** (persistent bell-icon items that cannot be marked complete).
- **Task Categories**: Create colored tags to organize long-term tasks and reminders. Categories are auto-created when you create a project.
- **Commitments**: Three-pillar organization (Career, Projects, Personal) for ongoing responsibilities. Drag-reorderable within each section.

### Goal Tracking
- **Goal Lists**: Named collections of goals with visual progress bars showing completion percentage.
- **Goal Types**: Three types of goals:
  - **Completion**: Binary done/not-done goals.
  - **Incremental**: Progress-based goals with a target value (e.g., "Read 20 pages").
  - **Progressive**: Goals that automatically increase their target over time on a configured schedule.
- **Overflow Celebration**: Goals can exceed 100% with animated celebration effects that scale with the overflow percentage.

### Projects
- **Project Organization**: Group related goal lists, task categories, and commitments under a single project.
- **Current Project**: Set one project as your current focus, displayed as a banner with animated space effects.
- **Auto-Generated Resources**: Creating a project automatically creates an associated goal list, task category, and commitment.

### Daily Routines
- **Flexible Scheduling**: Set routines for specific days of the week (weekdays, weekends, or custom).
- **Calendar View**: Full month calendar with color-coded cells showing daily completion percentage (red to yellow to green).
- **Three Routine Types**: Completion (did you do it?), incremental (how many reps?), and progressive (auto-increasing targets).
- **Date Range**: Set start and optional end dates for time-bounded routines.

### Focus Timer (Pomodoro)
- **Customizable Sessions**: Configure focus duration, short break, long break, and number of sessions before a long break.
- **Phase Management**: Automatic transitions between focus, break, and long break phases with visual session schedule.
- **Website Blocking**: Integrates with the Stellar Focus browser extension to block distracting websites during focus phases.
- **Focus Time Tracking**: Tracks accumulated focus minutes per day.

### Block Lists
- **Multiple Lists**: Create separate named block lists (e.g., "Social Media", "News", "Entertainment").
- **Day Scheduling**: Configure each list to be active only on certain days of the week.
- **Enable/Disable**: Toggle individual lists on and off without deleting them.
- **Subdomain Matching**: Blocking `youtube.com` automatically blocks `www.youtube.com`, `music.youtube.com`, etc.

### Offline-First Architecture
- **Local-First Data**: All reads and writes happen instantly against IndexedDB. No loading spinners for data operations.
- **Background Sync**: Changes queue locally and sync to Supabase automatically when online. The sync engine uses an outbox pattern with intent-based operations.
- **Offline Authentication**: Credentials are cached locally so you can log in and use the app without internet.
- **Conflict Resolution**: Field-level conflict resolution with pending-queue protection, recently-modified grace periods, and deterministic device-ID tiebreaking for simultaneous edits.
- **Real-Time Updates**: Supabase Realtime WebSocket subscriptions provide instant multi-device sync. Falls back to 15-minute polling if WebSocket disconnects.

### PWA Capabilities
- **Installable**: Works as a standalone app on desktop, Android, and iOS. Install prompt appears on the home screen.
- **Full Offline Navigation**: Background precaching downloads all route chunks after first load, enabling every page to work offline.
- **Smart Caching**: Network-first for HTML, cache-first for immutable assets, stale-while-revalidate for static resources.
- **Update Flow**: Non-intrusive prompt when a new version is available. One tap to refresh.

### UI
- **Space Theme**: Animated starfields, nebula effects, orbital particles, and cosmic color gradients throughout.
- **Responsive Design**: Optimized layouts for iPhone (including Dynamic Island), Android, tablet, and desktop.
- **Drag-and-Drop**: All lists support drag-to-reorder with smooth animations.
- **Sync Indicator**: Real-time visual feedback showing sync status (synced, syncing, pending, offline, error) with detailed error tooltips.

---

## Setup Guide to Self-Host

### Prerequisites
- A GitHub account
- A Vercel account (free tier works)
- A Supabase account (free tier works)

### Step 1: Fork the Repository

Fork this repository to your own GitHub account. This gives you your own copy that Vercel can deploy from.

### Step 2: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Choose a region close to you and set a database password.
3. Once the project is created, go to **Settings > API** and note your:
   - **Project URL** (e.g., `https://abcdefg.supabase.co`)
   - **Anon/Public Key** (starts with `eyJ...`)

### Step 3: Set Up the Database Schema

1. In your Supabase project, go to the **SQL Editor**.
2. Open the `supabase-schema.sql` file from this repository.
3. Copy the entire contents and paste it into the SQL Editor.
4. Click **Run**. This creates all tables, indexes, Row Level Security policies, and realtime subscriptions.

### Step 4: Enable Realtime

1. In Supabase, go to **Database > Replication**.
2. Under "Supabase Realtime", make sure all the entity tables are enabled for realtime. The schema SQL should have done this, but verify that tables like `focus_sessions`, `block_lists`, `goals`, etc. appear in the publication.

### Step 5: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and create a new project.
2. Import your forked GitHub repository.
3. Set the following environment variables:

| Variable | Value |
|----------|-------|
| `PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Your Supabase anon key |

4. Deploy. Vercel will build and host your instance automatically.

### Step 6: Run the Setup Wizard

1. Visit your deployed app URL (e.g., `https://your-app.vercel.app`).
2. On first visit, you'll be redirected to the setup page (`/setup`).
3. Enter your Supabase URL and Anon Key.
4. Click **Validate** to test the connection.
5. Optionally enter a Vercel token to auto-deploy environment variables.
6. Once validated, the app caches the config locally and you're ready to go.

### Step 7: Create Your Account

1. Navigate to the login page.
2. Click **Sign Up** and enter your email and password.
3. Check your email for a confirmation link (Supabase sends this automatically).
4. Click the confirmation link to verify your account.
5. Log in and start using Stellar.

---

## Mobile Installation

Stellar is a PWA — add it to your home screen for quick access and an app-like experience after deploying.

### iOS (Safari)

1. Open your Stellar instance in Safari.
2. Tap the **Share** button (square with arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. Stellar appears as a standalone app with its own icon.

### Android (Chrome)

1. Open your Stellar instance in Chrome.
2. Tap the three-dot menu.
3. Tap **Add to Home screen** (or **Install app** if Chrome shows it).
4. Stellar installs as a standalone app.

### Desktop (Chrome/Edge)

1. Open your Stellar instance.
2. Click the install icon in the address bar.
3. Click **Install**.

Once installed, Stellar runs as a standalone window with full offline support.

---

## Demo Mode

Try Stellar without creating an account or setting up Supabase. Visit `/demo` in any deployed instance to launch an interactive sandbox.

**How it works:**
- A separate IndexedDB database (`GoalPlannerDB_demo`) is created — your real data is never touched.
- All 13 entity types are pre-seeded with sample data (projects, goals, tasks, routines, focus sessions, block lists, and more).
- Every feature works: browse pages, create/edit/delete items, use the focus timer, manage block lists, change settings.
- Changes persist within the session but reset on page refresh.

**What's limited in demo mode:**
- Cloud sync (no Supabase connection)
- Email and PIN changes
- Device management
- Debug/sync tools

**For developers:** Demo mode is powered by `@prabhask5/stellar-engine`'s demo infrastructure. Configuration lives in `src/lib/demo/config.ts` and mock data in `src/lib/demo/mockData.ts`. Pass a `DemoConfig` to `initEngine({ demo: ... })` to enable it.

---

## Configuration

### Runtime Configuration

Stellar uses runtime configuration rather than build-time environment variables. This means:

- Config is fetched from the server's `/api/config` endpoint on load.
- Config is cached in localStorage for instant subsequent loads and offline PWA support.
- The setup wizard at `/setup` handles initial configuration through the UI.

### Environment Variables

These are set in your Vercel project settings:

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Yes | Your Supabase anon/public key |

### Updating Configuration

You can update the Supabase configuration from the **Profile** page without redeploying. This triggers a redeploy with the new environment variables if a Vercel token is configured.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | SvelteKit 2 with Svelte 5 |
| **Language** | TypeScript (strict mode) |
| **Local Database** | Dexie.js (IndexedDB wrapper) |
| **Remote Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth + offline credential caching |
| **Real-time** | Supabase Realtime (WebSocket subscriptions) |
| **Sync Engine** | @stellar/sync-engine (custom) |
| **Build Tool** | Vite |
| **Deployment** | Vercel |

---

## Debug Mode

On the Profile page, you can toggle debug mode to enable detailed console logging. When enabled, the following information is logged to the browser console:

- `[SYNC]` - Sync cycle details: trigger type, items pushed/pulled, data transfer size, duration
- `[Auth]` - Authentication events, session management, offline/online transitions
- `[Tombstone]` - Soft delete cleanup operations
- `[Conflict]` - Field-level conflict resolution details

### Browser Console Debug Functions

These functions are available in the browser console when debug mode is enabled:

| Function | Description |
|----------|-------------|
| `window.__stellarSyncStats()` | View sync cycle statistics (total cycles, recent cycle details, trigger types) |
| `window.__stellarEgress()` | Monitor data transfer from Supabase (total bytes, per-table breakdown, recent cycles) |
| `window.__stellarTombstones()` | Check soft-deleted record counts across all tables |
| `window.__stellarTombstones({ cleanup: true })` | Manually trigger tombstone cleanup |
| `window.__stellarTombstones({ cleanup: true, force: true })` | Force server cleanup (bypasses 24-hour interval) |
| `window.__stellarSync.forceFullSync()` | Reset sync cursor, clear local data, and re-download everything from server |
| `window.__stellarSync.resetSyncCursor()` | Clear the stored cursor so the next sync pulls all data |
| `window.__stellarSync.sync()` | Trigger a manual sync cycle |
| `window.__stellarSync.getStatus()` | View current sync cursor and pending operation count |
| `window.__stellarSync.checkConnection()` | Test Supabase connectivity |
| `window.__stellarSync.realtimeStatus()` | Check realtime connection state and health |

### PWA Cache Status

Check the service worker cache status:

```javascript
navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATUS' });
navigator.serviceWorker.addEventListener('message', e => {
  if (e.data.cached !== undefined) console.log('Cache:', e.data);
});
// Output: { cached: 78, total: 78, ready: true, version: "..." }
```

---

## Companion Extension

**Stellar Focus** is a browser extension that blocks distracting websites during focus sessions managed in Stellar.

- Blocks sites only during active focus phases (breaks and pauses allow full access)
- Real-time sync via Supabase Realtime WebSockets
- Day-of-week scheduling for block lists
- Subdomain matching
- Fail-safe design: never blocks when offline or uncertain
- Beautiful space-themed blocking page with animated spiral galaxy

**Install:**
- [Chrome Web Store](https://chromewebstore.google.com/detail/stellar-focus/eppioehchokbecpepjkkcedffakhepfo)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/stellar-focus/)

See [stellar-focus/README.md](./stellar-focus/README.md) for full documentation.

---

## Local Development

```bash
git clone <your-fork-url>
cd stellar
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`. You still need a Supabase project with the schema applied.

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create production build |
| `npm run preview` | Preview production build locally |
| `npm run check` | TypeScript type checking |
| `npm run lint` | ESLint code linting |
| `npm run validate` | Run type check + lint + dead code detection |

---

## Privacy

Stellar is fully self-hosted. Your data lives in your own Supabase project. No analytics, tracking, or third-party services are used beyond Supabase (which you control). All data is stored locally in IndexedDB and synced only to your Supabase instance.

See the in-app privacy policy at `/policy` for details.
