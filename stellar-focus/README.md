# Stellar Focus

**Version 1.0.4** | Companion browser extension for [Stellar](../README.md)

Stellar Focus is a companion browser extension for the Stellar self-hosted productivity PWA. It blocks distracting websites during active Pomodoro focus sessions managed in the Stellar app. The extension and Stellar communicate exclusively through a shared Supabase backend -- there is no direct communication between them. With only two runtime dependencies, Stellar Focus is lightweight by design and built around a fail-safe blocking philosophy: when in doubt, it allows navigation rather than risking a false block.

---

## Install

| Browser | Link |
|---------|------|
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/stellar-focus/eppioehchokbecpepjkkcedffakhepfo) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/stellar-focus/) |

---

## Documentation

| Document | Description |
|----------|-------------|
| [FRAMEWORKS.md](./FRAMEWORKS.md) | Extension development dependencies and third-party libraries |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, blocking engine, sync, and failure recovery patterns |
| [Main App README](../README.md) | Stellar main application documentation |

---

## Table of Contents

1. [Install](#install)
2. [Documentation](#documentation)
3. [Tech Stack](#tech-stack)
4. [Features](#features)
5. [Blocking Logic](#blocking-logic)
6. [Installation (Development)](#installation-development)
7. [Configuration](#configuration)
8. [Build Commands](#build-commands)
9. [Permissions](#permissions)
10. [Privacy](#privacy)
11. [Stellar App](#stellar-app)

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Language** | TypeScript |
| **Build Tool** | esbuild |
| **Backend** | Supabase (PostgreSQL + Realtime WebSockets) |
| **Local Storage** | IndexedDB (raw API, no Dexie) |
| **Browser Compat** | webextension-polyfill |
| **Manifest** | Version 3 (Manifest V3) |
| **Target Browsers** | Firefox 142+, Chrome 109+ |
| **Runtime Dependencies** | `@supabase/supabase-js`, `webextension-polyfill` (2 total) |

---

## Features

### Intelligent Website Blocking

- **Domain matching with subdomain support** -- blocking `youtube.com` also blocks `www.youtube.com`, `music.youtube.com`, and any other subdomain
- **Day-of-week scheduling** -- configure each block list to activate only on specific days of the week
- **Multiple named block lists** -- organize blocked sites into separate lists, each with an independent enable/disable toggle

### Focus Session Integration

- **Real-time sync via Supabase Realtime** -- a single consolidated WebSocket channel with 3 subscriptions instantly detects when focus sessions start, pause, resume, or end
- **Phase-aware blocking** -- only blocks during active focus phases; automatically stops blocking during breaks
- **30-second polling backup** -- browser alarm-based polling ensures state stays current even if the WebSocket connection drops

### Fail-Safe Design

The extension follows a strict fail-safe principle: it **never blocks navigation** when any of the following are true:

- Browser is offline (network connectivity required)
- User is not authenticated
- Focus session is paused or stopped
- Current phase is a break
- Any error occurs in the blocking pipeline

When anything goes wrong, the extension defaults to **allowing** navigation. Users are never locked out of websites due to an extension error.

### Space-Themed Block Page

When a site is blocked during an active focus session, users see an immersive space-themed page featuring:

- An animated spiral galaxy with 5,000+ twinkling stars across 2 spiral arms
- Encouraging messages to stay focused on the current task
- A quick-return link to the Stellar app

### Popup UI

The browser action popup provides at-a-glance focus information:

- Current focus session status (running, paused, on break, inactive)
- Active block lists and their enabled/disabled states
- Total focus time accumulated today
- Real-time sync status indicator
- Admin debug mode toggle for troubleshooting
- Cinematic UI with morphing icons and animated backgrounds

### Options Page

A dedicated options page for configuring the extension's connection to the Stellar backend:

- Supabase project URL
- Supabase anonymous key
- Stellar app URL

---

## Blocking Logic

A navigation request is blocked **only** when every single condition below is true. If any condition fails, the request is allowed through.

```
Navigation Request
│
├── Is the user authenticated?
│   └── NO  --> ALLOW (not logged in)
│   └── YES --> continue
│
├── Is the browser online?
│   └── NO  --> ALLOW (offline fail-safe)
│   └── YES --> continue
│
├── Is the focus session status "running"?
│   └── NO  --> ALLOW (session not active)
│   └── YES --> continue
│
├── Is the current phase "focus" (not break)?
│   └── NO  --> ALLOW (on break)
│   └── YES --> continue
│
├── Is the domain in an enabled block list?
│   └── NO  --> ALLOW (domain not blocked)
│   └── YES --> continue
│
├── Is the block list active for the current day of week?
│   └── NO  --> ALLOW (not scheduled today)
│   └── YES --> BLOCK (redirect to space-themed block page)
```

All six conditions must pass for a block to occur. This design ensures zero false positives -- the extension errs on the side of allowing access.

---

## Installation (Development)

### Firefox

```bash
cd stellar-focus
npm install
npm run build:firefox
```

1. Open `about:debugging#/runtime/this-firefox` in Firefox
2. Click **Load Temporary Add-on**
3. Navigate to the `dist-firefox/` directory and select `manifest.json`

### Chrome

```bash
cd stellar-focus
npm install
npm run build:chrome
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist-chrome/` directory

---

## Configuration

After installing, open the extension's options page to connect it to your Stellar backend.

You will need three values from your Supabase project:

| Setting | Description | Example |
|---------|-------------|---------|
| **Supabase URL** | Your Supabase project URL | `https://your-project.supabase.co` |
| **Supabase Anon Key** | Your Supabase anonymous/public key | `eyJhbGciOiJIUzI1NiIs...` |
| **App URL** | The URL where your Stellar app is hosted | `https://stellarplanner.vercel.app` |

Alternatively, for development you can create a local config file:

```bash
cp src/config.local.example.ts src/config.local.ts
```

Then edit `src/config.local.ts`:

```typescript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const APP_URL = 'https://stellarplanner.vercel.app';
```

---

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build for all browsers (Firefox and Chrome) |
| `npm run build:firefox` | Build for Firefox only (outputs to `dist-firefox/`) |
| `npm run build:chrome` | Build for Chrome only (outputs to `dist-chrome/`) |
| `npm run typecheck` | Run TypeScript type checking without emitting files |
| `npm run clean` | Remove all build output directories |
| `npm run package` | Build all browsers and create distributable `.zip` files |

---

## Permissions

| Permission | Justification |
|------------|---------------|
| `storage` | Store authentication tokens, cached session data, and extension settings locally in the browser |
| `webNavigation` | Intercept navigation events to check URLs against active block lists before the page loads |
| `alarms` | Schedule 30-second background polling intervals as a backup to the WebSocket real-time sync |
| `<all_urls>` | Required to block any user-configured domain -- the extension cannot predict which sites users will add to their block lists |

---

## Privacy

Stellar Focus is designed with user privacy as a priority:

- **Local-only authentication** -- auth tokens are stored exclusively in the browser's local storage and IndexedDB
- **No browsing history** -- the extension does not track, record, or transmit any browsing history
- **No third-party data sharing** -- the extension communicates only with your self-hosted Supabase project; no data is sent to Anthropic, analytics services, or any other third party
- **Minimal data in transit** -- only focus session state and block list configuration are synced with Supabase
- **Clean logout** -- all locally cached data is cleared when the user logs out

---

## Stellar App

Stellar Focus is a companion to the main [Stellar](../README.md) self-hosted productivity app. Focus sessions, block lists, and scheduling are all managed within the Stellar web app. This extension simply enforces the blocking rules during active focus sessions.
