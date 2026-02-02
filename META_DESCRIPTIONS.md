# Stellar Planner - Marketing Copy & Store Listing Descriptions

---

## Quick Reference

| Platform | Character Limit | Key Focus |
|---|---|---|
| GitHub Repository | ~250 chars | Tech stack, self-hosted, offline-first, key features |
| Firefox Add-on Summary | 250 chars | What the extension does, concise |
| Firefox Add-on Description | 250+ chars recommended | Features, setup steps, privacy |
| Chrome Web Store Description | No hard limit | Features, setup, permissions, privacy, support |

---

## Keywords for Discoverability

**Stellar Planner (main app):**
productivity, PWA, offline-first, self-hosted, goal tracking, task manager, daily planner, Pomodoro timer, focus timer, project management, routines, commitments, SvelteKit, Dexie.js, Supabase, drag-and-drop, real-time sync, space theme, open source

**Stellar Focus (browser extension):**
website blocker, focus mode, distraction blocker, productivity extension, Pomodoro, site blocker, focus timer, block distracting websites, study tool, deep work, scheduled blocking, block list

---

## A) GitHub Repository Short Summary

```
Stellar is a self-hosted, offline-first productivity PWA with goal tracking, daily tasks, routines, Pomodoro focus timer, and project organization. Built with SvelteKit, Dexie.js, and Supabase with real-time multi-device sync.
```

(228 characters)

---

## B) Firefox Add-on Store - Summary

```
Companion extension for Stellar productivity app. Blocks distracting websites during active Pomodoro focus sessions. Syncs block lists in real time via your Supabase instance. Fail-safe: never blocks when offline.
```

(214 characters)

---

## C) Firefox Add-on Store - Description

```
Stellar Focus is the companion browser extension for Stellar, a self-hosted productivity PWA. It blocks distracting websites while you're in an active Pomodoro focus phase, helping you stay on task during deep work sessions.

KEY FEATURES:
- Blocks websites only during active focus phases in Stellar
- Multiple configurable block lists
- Subdomain matching (block "reddit.com" and all its subdomains)
- Day-of-week scheduling (e.g., block social media only on weekdays)
- Real-time sync via Supabase WebSockets — changes apply instantly across devices
- Fail-safe design: never blocks pages when offline or connection state is uncertain
- Cinematic space-themed blocked page with spiral galaxy animation

HOW TO USE:
1. Set up a Stellar account at your self-hosted Stellar instance
2. Install this extension and open the options page
3. Enter your Supabase URL and anon key (found in your Stellar deployment)
4. Sign in with your Stellar account credentials
5. Configure your block lists in Stellar Planner under Focus settings
6. Start a focus session in Stellar — blocked sites are enforced automatically

PRIVACY:
- Stellar Focus connects only to your own self-hosted Supabase instance
- No data is sent to third-party servers
- No browsing history is collected or stored
- No analytics or tracking of any kind
- Authentication credentials are stored locally in extension storage

Requires a Stellar account. Learn more and set up Stellar: https://github.com/prabhask5/stellar
```

---

## D) Chrome Web Store - Description

```
Stellar Focus blocks distracting websites during your active Pomodoro focus sessions in Stellar, the self-hosted productivity app. Stay focused on what matters — sites are blocked only when you're in a focus phase and unblocked the moment your session ends.

FEATURES:
- Focus-aware blocking — sites are blocked only during active Pomodoro focus phases, not during breaks or idle time
- Multiple block lists — organize blocked sites into separate lists for different contexts
- Subdomain matching — blocking "reddit.com" automatically covers all subdomains like "old.reddit.com"
- Day-of-week scheduling — set specific days for each block list (e.g., block social media on weekdays only)
- Real-time sync — block lists sync instantly across all your devices via Supabase WebSockets
- Fail-safe design — the extension never blocks pages when offline or when the connection state is uncertain
- Space-themed blocked page — a cinematic spiral galaxy animation reminds you to stay on task

HOW TO USE:
1. Set up a Stellar account at your self-hosted Stellar instance
2. Install Stellar Focus and open the extension options page
3. Enter your Supabase URL and anon key from your Stellar deployment
4. Sign in with your Stellar account credentials
5. Configure block lists in Stellar Planner under Focus settings
6. Start a Pomodoro focus session in Stellar — blocked sites are enforced automatically
7. When your focus phase ends, all sites are unblocked instantly

REQUIREMENTS:
- A self-hosted Stellar instance with Supabase backend
- A Stellar user account

PRIVACY:
- Connects only to your own self-hosted Supabase instance — no third-party servers
- No browsing history is collected, stored, or transmitted
- No analytics, telemetry, or tracking of any kind
- Authentication credentials are stored locally in Chrome extension storage
- The extension is fully open source — inspect the code yourself

PERMISSIONS EXPLAINED:
- "storage" — stores your authentication session and cached block lists locally
- "webNavigation" — detects page navigations to check URLs against your block lists
- "alarms" — schedules periodic sync to keep block lists up to date
- "host_permissions: <all_urls>" — required to redirect any blocked URL to the blocked page; the extension only checks URLs against your configured block lists and takes no other action

SUPPORT:
- Source code & issues: https://github.com/prabhask5/stellar
- Report bugs or request features via GitHub Issues

Version 1.0.4
```
