# Stellar

A space-themed productivity Progressive Web App featuring offline-first architecture, real-time synchronization, and comprehensive goal/task/focus management.

**Live:** [stellarplanner.vercel.app](https://stellarplanner.vercel.app)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | SvelteKit 2 with Svelte 5 |
| **Language** | TypeScript (strict mode) |
| **Local Database** | Dexie.js (IndexedDB wrapper) |
| **Remote Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth + custom offline credential caching |
| **Real-time** | Supabase Realtime (WebSocket subscriptions) |
| **Deployment** | Vercel |

---

## Features

### Task Management
- **Daily Tasks**: Quick checklist with drag-to-reorder and bulk clear
- **Long-Term Tasks**: Calendar-based task planning with due dates and categories
- **Commitments**: Three-pillar organization (Career, Social, Personal) for recurring responsibilities

### Goal Tracking
- **Goal Lists**: Named collections with visual progress tracking
- **Goal Types**: Binary completion or incremental progress (e.g., "Read 20 pages")
- **Overflow Celebration**: Goals can exceed 100% with space-themed celebration effects that scale with overflow percentage - color transitions from green to cyan to purple with orbiting stars and cosmic glow

### Daily Routines
- **Flexible Scheduling**: Set routines for specific days (weekdays, weekends, or custom)
- **Calendar View**: Month view with color-coded completion (red → yellow → green)
- **Progress Tracking**: Per-day progress with overflow support and celebration effects

### Focus Timer (Pomodoro)
- **Customizable Sessions**: Configure focus/break durations and cycle counts
- **Phase Management**: Automatic transitions between focus, break, and long break
- **Website Blocking**: Integrates with companion browser extension to block distracting sites during focus

### Offline-First Architecture
- **Local-First Data**: All reads/writes happen instantly against IndexedDB
- **Bidirectional Sync**: Changes queue locally and sync when online
- **Offline Authentication**: PBKDF2-hashed credentials enable offline login
- **Conflict Resolution**: Pending queue protection with recently-modified grace periods

### PWA Capabilities
- **Installable**: Full standalone app experience on desktop and mobile
- **Offline Fallback**: Space-themed offline page when cached content unavailable
- **Smart Caching**: Network-first for HTML, cache-first for immutable assets
- **Update Flow**: Non-intrusive prompts when new versions are available

---

## UI Highlights

- **Space Theme**: Animated starfields, nebula effects, and cosmic color palette throughout
- **Glassmorphic Design**: Frosted glass cards with subtle blur effects
- **Pull-to-Refresh**: Mobile-friendly manual sync trigger
- **Sync Indicator**: Real-time status showing pending changes, sync progress, and errors
- **Responsive**: Optimized for mobile, tablet, and desktop viewports

---

## Local Development

### Prerequisites
- Node.js 18+
- Supabase project

### Setup
```bash
git clone <repository-url>
cd stellar
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
```

### Environment Variables
```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

### Database Setup
Execute `supabase-schema.sql` in your Supabase SQL Editor.

### Build
```bash
npm run build
npm run preview
```

---

## Companion Extension

**Stellar Focus** is a browser extension that blocks distracting websites during focus sessions.

- Real-time sync via Supabase Realtime WebSockets
- Day-of-week scheduling for block lists
- Beautiful space-themed blocking page with animated galaxy
- Fail-safe design: never blocks when offline or during breaks

See [stellar-focus/README.md](./stellar-focus/README.md) for details.

---

## Documentation

- [FRAMEWORKS.md](./FRAMEWORKS.md) - Guide to frameworks and dependencies
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design, sync engine, conflict resolution
- [TESTING.md](./TESTING.md) - Comprehensive test plan
