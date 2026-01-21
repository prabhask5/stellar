# Stellar Focus

A browser extension that enforces website blocking during focus sessions from the Stellar productivity app. Features real-time sync with the main app, offline caching, and a cinematic blocked page experience.

---

## Overview

Stellar Focus is the companion extension for [Stellar](../README.md), a local-first productivity suite. During focus sessions, the extension intercepts navigation to distracting websites and displays an encouraging blocked page with a beautiful spiral galaxy animation.

**Key Features:**
- Blocks configured websites during active focus phases (not during breaks)
- Real-time sync with Stellar via Supabase WebSocket subscriptions
- Continues blocking offline using cached data
- Cinematic blocked page with encouraging messages
- Days-of-week scheduling for block lists
- Available for Firefox and Chrome

---

## How It Works

### Focus Session Detection

1. **Initial Load**: On browser startup, the extension fetches the current focus session state from Supabase
2. **Polling**: Every 30 seconds, polls for session updates (backup for real-time)
3. **Real-time Subscriptions**: WebSocket channels receive instant updates when:
   - Focus session starts/stops/pauses
   - Phase changes (focus ↔ break)
   - Block lists are modified

### Website Blocking Logic

```
Navigation Event
      │
      ▼
┌──────────────────┐
│  Online check    │── No ──▶ Allow (fail-safe)
└───────┬──────────┘
        │ Yes
        ▼
┌──────────────────┐
│ Focus session    │── No ──▶ Allow
│ running?         │
└───────┬──────────┘
        │ Yes
        ▼
┌──────────────────┐
│ Phase = focus?   │── No ──▶ Allow (breaks are free)
└───────┬──────────┘
        │ Yes
        ▼
┌──────────────────┐
│ Domain in block  │── No ──▶ Allow
│ list?            │
└───────┬──────────┘
        │ Yes
        ▼
┌──────────────────┐
│ Block list       │── No ──▶ Allow (disabled list)
│ enabled?         │
└───────┬──────────┘
        │ Yes
        ▼
┌──────────────────┐
│ Active day?      │── No ──▶ Allow (not scheduled)
└───────┬──────────┘
        │ Yes
        ▼
    🚫 BLOCK
```

### Domain Matching

- Exact match: `youtube.com` blocks `youtube.com`
- Subdomain match: `youtube.com` also blocks `www.youtube.com`, `music.youtube.com`
- Protocol agnostic: Works for both HTTP and HTTPS

---

## Installation

### Firefox

**From Firefox Add-ons (Recommended):**
1. Visit the [Stellar Focus page on Firefox Add-ons](https://addons.mozilla.org)
2. Click "Add to Firefox"
3. Grant permissions when prompted

**For Development:**
1. Build the extension: `npm run build:firefox`
2. Open `about:debugging` in Firefox
3. Click "This Firefox" → "Load Temporary Add-on"
4. Select `dist-firefox/manifest.json`

### Chrome

**From Chrome Web Store:**
Coming soon

**For Development:**
1. Build the extension: `npm run build:chrome`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist-chrome` directory

---

## Features

### Popup Interface

The extension popup provides:
- **Connection status**: Shows online/offline and sync state
- **Focus session status**: Current phase (Focus/Break/Idle) and timer
- **Block lists overview**: See which lists are active
- **Quick actions**: Link to open Stellar, edit block lists
- **User info**: Logged-in account details

### Blocked Page

When you try to visit a blocked site during focus:
- **Spiral galaxy animation**: Mesmerizing procedural galaxy with twinkling stars
- **Starfield background**: Additional depth with 500+ animated stars
- **Encouraging message**: Fixed "Stay Focused" with rotating submessages:
  - "This moment is for your focus."
  - "You've got this."
  - "Your future self will thank you."
  - "Deep work requires deep focus."
  - "Stay present. Stay powerful."
  - And more...
- **Domain display**: Shows which site was blocked (non-judgmental)
- **Return to Focus**: Button to go back to the Stellar app
- **Keyboard shortcuts**: Escape (go back), Enter (open Stellar)

### Offline Support

The extension caches:
- Block lists and blocked websites
- Current focus session state
- User authentication state

When offline:
- Uses cached data to determine blocking
- Continues enforcing blocks if a session was active
- Syncs changes when connection returns

**Important:** Blocking requires having been online at least once to cache data. If you go offline with an active focus session, blocking continues. If you were offline when the session started, no blocking occurs (fail-safe behavior).

---

## Setup for Development

### Prerequisites
- Node.js 18+
- A Supabase project (shared with main Stellar app)

### 1. Install Dependencies
```bash
cd stellar-focus
npm install
```

### 2. Configure
Copy the example config:
```bash
cp src/config.local.example.ts src/config.local.ts
```

Edit `src/config.local.ts`:
```typescript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const APP_URL = 'https://stellarplanner.vercel.app';
```

### 3. Build
```bash
# Build for Firefox
npm run build:firefox

# Build for Chrome
npm run build:chrome

# Build both
npm run build
```

### 4. Load in Browser
See [Installation](#installation) section above.

---

## Build System

The extension uses esbuild for fast TypeScript compilation.

### Build Commands

```bash
npm run build              # Build both browsers
npm run build:firefox      # Firefox only
npm run build:chrome       # Chrome only
npm run clean             # Remove dist directories
npm run package           # Build and create ZIP files
npm run typecheck         # Type-check TypeScript
```

### Output Structure

```
dist-firefox/              # Firefox build
├── manifest.json          # Firefox manifest (MV3)
├── background/
│   └── service-worker.js  # Compiled service worker
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── pages/
│   ├── blocked.html
│   ├── blocked.js
│   └── blocked.css
└── icons/
    ├── icon-48.png
    └── icon-128.png

dist-chrome/               # Chrome build (similar structure)
└── manifest.json          # Chrome manifest (MV3)
```

---

## Project Structure

```
stellar-focus/
├── manifests/
│   ├── firefox.json           # Firefox manifest (MV3)
│   └── chrome.json            # Chrome manifest (MV3)
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── build.js                   # Multi-target build script
├── icons/                     # Extension icons
│   ├── icon-48.png           # Toolbar icon
│   └── icon-128.png          # Store listing icon
├── src/                       # Source code
│   ├── config.ts              # Config loader
│   ├── config.local.ts        # Local secrets (gitignored)
│   ├── config.local.example.ts # Template for config
│   ├── background/
│   │   └── service-worker.ts  # Main background script
│   ├── popup/
│   │   ├── popup.html         # Popup UI markup
│   │   ├── popup.ts           # Popup logic
│   │   └── popup.css          # Popup styles
│   ├── pages/
│   │   ├── blocked.html       # Blocked page markup
│   │   ├── blocked.ts         # Galaxy/starfield renderer
│   │   └── blocked.css        # Blocked page styles
│   ├── lib/
│   │   ├── storage.ts         # IndexedDB layer
│   │   └── network.ts         # Online/offline detection
│   └── auth/
│       └── supabase.ts        # Supabase client
├── dist-firefox/              # Firefox build (gitignored)
└── dist-chrome/               # Chrome build (gitignored)
```

---

## Technical Details

### Service Worker

The background script (`service-worker.ts`) handles:

| Function | Description |
|----------|-------------|
| `init()` | Initialize extension state, start polling |
| `setupAlarm()` | Configure 30-second poll interval |
| `pollFocusSession()` | Fetch current session from Supabase |
| `refreshBlockLists()` | Fetch and cache block lists |
| `isDomainBlocked(hostname)` | Check if domain should be blocked |
| `subscribeToRealtime()` | Set up WebSocket subscriptions |

### Storage Layer

IndexedDB with three object stores:

| Store | Purpose |
|-------|---------|
| `blockLists` | Cached block list configurations |
| `blockedWebsites` | Cached domain entries |
| `focusSessionCache` | Current session state |

### Permissions

```json
{
  "permissions": [
    "storage",        // IndexedDB for caching
    "webNavigation",  // Intercept navigations
    "alarms"          // Background polling
  ],
  "host_permissions": [
    "<all_urls>"      // Block any website
  ]
}
```

### Data Collection Disclosure (Firefox)

Required by Mozilla Add-ons:
```json
"browser_specific_settings": {
  "gecko": {
    "data_collection_permissions": {
      "required": ["authenticationInfo", "personallyIdentifyingInfo"]
    }
  }
}
```

The extension collects:
- **Authentication info**: Supabase session tokens for API access
- **Personal info**: Email for account identification (stored securely by Supabase)

---

## Troubleshooting

### "Offline - blocking disabled"
Expected when offline. Blocking needs internet to verify focus session status.

### Websites not being blocked
1. Ensure you have an active focus session in Stellar
2. Check the website is in an enabled block list
3. Verify the block list is active on the current day
4. Confirm you're online
5. Click refresh button in popup

### Can't log in offline
You must log in online at least once first to cache credentials.

### Block list changes not reflecting
1. Click the sync button in the popup
2. Wait for the 30-second poll interval
3. Check the Stellar app for sync status

---

## Privacy

This extension:
- Stores authentication tokens locally (IndexedDB)
- Caches block list data for offline use
- Does not track browsing history
- Does not send data to third parties
- Communicates only with your Supabase project

See [Privacy Policy](https://stellarplanner.vercel.app/policy)

---

## Related Documentation

- [Stellar README](../README.md) - Main application documentation
- [Stellar Architecture](../ARCHITECTURE.md) - Technical architecture details
- [Stellar QA](../QA.md) - Test procedures for the main app
- [Extension Architecture](./ARCHITECTURE.md) - Detailed extension architecture
- [Extension QA](./QA.md) - Test procedures for the extension
