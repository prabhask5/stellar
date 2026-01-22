# Stellar Focus

Browser extension that blocks distracting websites during focus sessions managed by the Stellar productivity app. Integrates via Supabase Realtime for instant state synchronization.

Get it on Chrome: https://chromewebstore.google.com/detail/stellar-focus/eppioehchokbecpepjkkcedffakhepfo

And on Firefox: https://addons.mozilla.org/en-US/firefox/addon/stellar-focus/

---

## Table of Contents

1. [Documentation](#documentation)
2. [Tech Stack](#tech-stack)
3. [Features](#features)
4. [Blocking Logic](#blocking-logic)
5. [Installation](#installation)
6. [Configuration](#configuration)
7. [Permissions](#permissions)
8. [Privacy](#privacy)

---

## Documentation

| Document | Description |
|----------|-------------|
| [FRAMEWORKS.md](./FRAMEWORKS.md) | Extension development dependencies |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Extension system design |
| [TESTING.md](./TESTING.md) | Test plan |
| [Main App README](../README.md) | Stellar main application |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Language** | TypeScript |
| **Build** | esbuild |
| **Backend** | Supabase (PostgreSQL + Realtime) |
| **Local Storage** | IndexedDB |
| **Target Browsers** | Firefox 142+, Chrome 109+ |
| **Manifest** | Version 3 |

---

## Features

### Intelligent Website Blocking
- **Domain Matching**: Blocks exact domains and all subdomains (e.g., `youtube.com` blocks `www.youtube.com`, `music.youtube.com`)
- **Day-Based Scheduling**: Configure block lists to activate only on specific days
- **Multiple Lists**: Organize blocked sites into named lists with independent enable/disable toggles

### Focus Session Integration
- **Real-Time Sync**: WebSocket subscriptions instantly detect when focus sessions start, pause, or end
- **Phase-Aware**: Only blocks during active focus phases, automatically disables during breaks
- **Polling Backup**: 30-second alarm-based polling ensures state stays current even if WebSocket disconnects

### Fail-Safe Design
The extension **never blocks** when:
- Browser is offline (network connectivity required)
- User is not authenticated
- Focus session is paused or stopped
- Current phase is a break
- Any error occurs (defaults to allowing navigation)

### Space-Themed Block Page
When a site is blocked, users see a beautiful space-themed page featuring:
- Animated spiral galaxy with 5,000+ twinkling stars
- Encouraging messages to stay focused
- Quick return to Stellar app

---

## Blocking Logic

```
Navigation blocked only when ALL conditions are true:
├── User is authenticated
├── Browser is online
├── Focus session status is "running"
├── Current phase is "focus" (not break)
├── Domain is in an enabled block list
└── Block list is active for current day of week
```

---

## Installation

### Firefox (Development)

```bash
cd stellar-focus
npm install
npm run build:firefox
```

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `dist-firefox/manifest.json`

### Chrome (Development)

```bash
cd stellar-focus
npm install
npm run build:chrome
```

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist-chrome` directory

---

## Configuration

```bash
cp src/config.local.example.ts src/config.local.ts
```

Edit `src/config.local.ts`:

```typescript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const APP_URL = 'https://stellarplanner.vercel.app';
```

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build for all browsers |
| `npm run build:firefox` | Build Firefox only |
| `npm run build:chrome` | Build Chrome only |
| `npm run typecheck` | Type-check TypeScript |

---

## Permissions

| Permission | Justification |
|------------|---------------|
| `storage` | Store auth tokens and cached data |
| `webNavigation` | Intercept navigation for blocking |
| `alarms` | Schedule background polling |
| `<all_urls>` | Block any user-configured domain |

---

## Privacy

This extension:
- Stores authentication tokens locally only
- Caches block list data in local IndexedDB
- Does NOT track browsing history
- Does NOT send data to third parties
- Communicates only with your configured Supabase project

All data is cleared on logout.

