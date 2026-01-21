# Stellar Project Summaries

This document contains various summaries for different platforms and use cases.

---

## Table of Contents

1. [GitHub Repository Summary](#github-repository-summary)
2. [Firefox Extension - Summary (for Reviewers)](#firefox-extension---summary-for-reviewers)
3. [Firefox Extension - Description (for Store Listing)](#firefox-extension---description-for-store-listing)
4. [Chrome Extension - Description (for Store Listing)](#chrome-extension---description-for-store-listing)

---

## GitHub Repository Summary

**One-liner:**
> Offline-first productivity suite with focus timer, website blocking, and real-time sync across devices.

**Short Description (for repo description):**
> A cinematic, local-first productivity app featuring goal tracking, daily routines, tasks, and Pomodoro-style focus sessions. Includes a companion browser extension that blocks distracting websites during focus time. Works offline with background sync via Supabase.

**Full Description (for repo README intro):**
> Stellar is a personal productivity suite built with a sophisticated local-first architecture. Every interaction is instant because all data operations happen locally first, then sync seamlessly in the background.
>
> **Features:**
> - Goal lists with completion and progress tracking
> - Daily routine habits with calendar visualization
> - Daily tasks and long-term planning with due dates
> - Pomodoro-style focus timer with customizable durations
> - Block lists that sync with the Stellar Focus browser extension
> - Full offline support including offline authentication
> - Progressive Web App (PWA) for native app experience
>
> **Tech Stack:** SvelteKit 5, TypeScript, Dexie (IndexedDB), Supabase, Custom CSS

**Topics/Tags:**
`productivity` `local-first` `offline-first` `svelte` `sveltekit` `supabase` `indexeddb` `pwa` `focus-timer` `pomodoro` `goal-tracker` `habit-tracker` `browser-extension`

---

## Firefox Extension - Summary (for Reviewers)

**What this extension does:**

Stellar Focus blocks distracting websites during focus sessions started from the Stellar productivity web app (stellarplanner.vercel.app). Users create "block lists" containing domains they want blocked, then when they start a focus session in the Stellar app, this extension prevents navigation to those domains by redirecting to an encouraging "blocked" page.

**Key behaviors:**

1. **Requires Authentication**: Users must log in with their Stellar account credentials. The extension uses Supabase for authentication, storing session tokens in `browser.storage.local`.

2. **Real-time Sync**: The extension subscribes to Supabase WebSocket channels for instant updates when:
   - A focus session starts/stops/pauses
   - Block lists are modified
   - Blocked websites are added/removed

3. **Polling Backup**: Every 30 seconds, the extension polls Supabase to ensure state is current (backup for missed real-time events).

4. **Blocking Logic**: Websites are ONLY blocked when:
   - User is online
   - User is authenticated
   - A focus session is running (not paused)
   - The current phase is "focus" (not "break")
   - The domain is in an enabled block list
   - The block list is active on the current day of week

5. **Fail-Safe Offline**: When offline, blocking is disabled. This is intentional to prevent locking users out of websites when connectivity is lost.

6. **Blocked Page**: When a blocked domain is visited, the user is redirected to an internal page (`pages/blocked.html`) showing an encouraging message and animated galaxy visualization.

**Data Collected:**

- **Authentication Info**: Supabase JWT tokens for API access (stored in browser.storage.local)
- **User Email**: Retrieved from Supabase auth, displayed in popup and used for account identification
- **Block Lists**: Cached in IndexedDB for functionality, synced from user's Supabase data

**No data is shared with third parties. All communication is between the extension and the user's Supabase project.**

**Permissions Justification:**

- `storage`: Store authentication tokens and cached block list data in IndexedDB
- `webNavigation`: Intercept navigation events to check if destination should be blocked
- `alarms`: Schedule periodic polling every 30 seconds for session state
- `<all_urls>`: Required to block any website the user configures (block lists are user-defined)

**Build Tools:**

The extension uses esbuild to bundle TypeScript source code. To review the source:

1. `npm install`
2. `npm run build:firefox`
3. Output is in `dist-firefox/`

---

## Firefox Extension - Description (for Store Listing)

**Name:** Stellar Focus

**Summary (max 250 characters):**
Block distracting websites during Stellar focus sessions. Real-time sync with the Stellar productivity app, encouraging blocked page with galaxy animation, and automatic blocking during focus phases.

**Full Description:**

**Stellar Focus** is the companion extension for [Stellar](https://stellarplanner.vercel.app), a productivity app for tracking goals, habits, and focused work time.

### How It Works

1. **Create Block Lists** - In the Stellar app, create lists of distracting websites (e.g., "Social Media" with youtube.com, twitter.com, reddit.com)

2. **Start a Focus Session** - Use Stellar's Pomodoro-style focus timer to begin a work session

3. **Stay Focused** - This extension automatically blocks your configured sites during focus phases

4. **Take Breaks Freely** - During break phases, all sites are accessible

### Features

**Intelligent Blocking**
- Only blocks during active focus phases (not during breaks)
- Respects day-of-week scheduling (e.g., only block on weekdays)
- Toggle individual block lists on/off

**Real-Time Sync**
- Changes in the Stellar app appear instantly in the extension
- Start a focus session on your phone, blocking activates on your computer

**Beautiful Blocked Page**
- Encouraging "Stay Focused" message with motivational submessages
- Mesmerizing spiral galaxy animation
- One-click return to Stellar app

**Offline-Aware**
- Caches your settings for quick startup
- Fails safely when offline (doesn't lock you out)

### Privacy

- Your block lists are stored in your own Supabase database
- No browsing history is collected or stored
- No data is shared with third parties
- Login credentials are handled securely by Supabase

### Requirements

- A free Stellar account (create at stellarplanner.vercel.app)
- Internet connection for initial sync and blocking verification

### Support

For help or feedback, visit our [GitHub repository](https://github.com/your-repo) or email support.

---

**Categories:** Productivity

**Tags:** focus, productivity, website blocker, pomodoro, distraction blocker, time management

---

## Chrome Extension - Description (for Store Listing)

**Name:** Stellar Focus - Website Blocker for Focus Sessions

**Summary:**
Block distracting websites during Stellar focus sessions. Sync with the Stellar productivity app for intelligent, phase-aware blocking.

**Full Description:**

**Stellar Focus** blocks distracting websites when you're in a focus session in the Stellar productivity app.

**What makes it different?**

Unlike typical website blockers that are always-on or time-based, Stellar Focus integrates with the Stellar app's Pomodoro-style focus timer. It knows when you're supposed to be focusing and when you're on a break.

**Key Features:**

✅ **Smart Blocking** - Only blocks during focus phases, freely browse during breaks

✅ **Customizable Block Lists** - Create multiple lists (Social Media, News, Entertainment) and enable only what you need

✅ **Day Scheduling** - Block sites only on weekdays, weekends, or specific days

✅ **Real-Time Sync** - Start focus on any device, blocking activates everywhere

✅ **Beautiful Blocked Page** - Animated galaxy visualization with encouraging messages

✅ **Privacy Focused** - Your data stays in your Supabase project, no third-party tracking

**How to Use:**

1. Create an account at stellarplanner.vercel.app
2. Set up your block lists with distracting websites
3. Install this extension and sign in
4. Start a focus session in Stellar
5. Get blocked when you try to visit distracting sites!

**Permissions Explained:**

- **Storage**: Save your login and cached settings
- **Web Navigation**: Detect when you try to visit a blocked site
- **Alarms**: Check focus status every 30 seconds
- **All URLs**: Block any website you configure (you control the list)

Need help? Visit stellarplanner.vercel.app or check our GitHub.

---

**Category:** Productivity

**Tags:** website blocker, focus, productivity, pomodoro, distraction blocker, time management, concentration

---

## Additional Marketing Copy

### Tagline Options

1. "Block distractions. Build focus. Reach your goals."
2. "Smart website blocking for smarter focus sessions."
3. "When you need to focus, Stellar has your back."
4. "Turn off distractions. Turn on productivity."
5. "The website blocker that knows when you're working."

### Social Media Blurb

> Tired of falling down YouTube rabbit holes during work?
>
> Stellar Focus blocks distracting sites ONLY when you're in focus mode - so you can browse freely during breaks.
>
> Part of the Stellar productivity suite. Free at stellarplanner.vercel.app
>
> #productivity #focus #deepwork

### Press/Blog Description

**Stellar** is a new entrant in the productivity app space, distinguishing itself with a true local-first architecture. Where most apps require constant internet connectivity, Stellar works entirely offline, syncing changes seamlessly when you reconnect.

The suite includes goal tracking (both one-time and recurring habits), a Pomodoro-style focus timer, and task management. Its companion browser extension, **Stellar Focus**, enforces website blocking during focus sessions.

Technical highlights include:
- All data stored locally in IndexedDB, synced via Supabase
- PBKDF2-SHA256 password hashing for offline authentication
- Real-time WebSocket subscriptions for instant multi-device sync
- PWA support for native-like mobile experience
- Custom space-themed design system with animated backgrounds

The project is built with SvelteKit 5 and TypeScript, demonstrating modern offline-first architecture patterns.
