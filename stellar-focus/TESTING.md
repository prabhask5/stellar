# Stellar Focus Extension Test Plan

Comprehensive test plan covering blocking behavior, real-time synchronization, authentication, and edge cases for the Stellar Focus browser extension.

---

## Table of Contents

1. [Authentication Tests](#1-authentication-tests)
2. [Focus Session Detection Tests](#2-focus-session-detection-tests)
3. [Website Blocking Tests](#3-website-blocking-tests)
4. [Block List Tests](#4-block-list-tests)
5. [Day Scheduling Tests](#5-day-scheduling-tests)
6. [Real-time Sync Tests](#6-real-time-sync-tests)
7. [Polling Tests](#7-polling-tests)
8. [Offline Behavior Tests](#8-offline-behavior-tests)
9. [Popup UI Tests](#9-popup-ui-tests)
10. [Blocked Page Tests](#10-blocked-page-tests)
11. [Browser-Specific Tests](#11-browser-specific-tests)
12. [Extension Lifecycle Tests](#12-extension-lifecycle-tests)
13. [Edge Cases](#13-edge-cases)

---

## 1. Authentication Tests

### 1.1 Login

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Successful login | Open popup, enter valid credentials, click Login | User logged in, main section appears |
| Wrong password | Enter incorrect password | Error message displayed |
| Wrong email | Enter unregistered email | Error message displayed |
| Empty fields | Submit with empty fields | Validation prevents submission |
| Login persists | Login, close popup, reopen | Still logged in |
| Login persists across restart | Login, restart browser | Still logged in |

### 1.2 Logout

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Successful logout | Click logout | Auth form appears, cached data cleared |
| Logout stops blocking | Logout during focus session | Websites no longer blocked |
| Logout clears cache | Logout, check IndexedDB | Block lists and session cache cleared |

### 1.3 Session Management

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Token refresh | Stay logged in past token expiry | Token auto-refreshed |
| Session sync with main app | Login in extension, check main app | Same session |
| Session persistence | Close all tabs, reopen extension | Session preserved |

---

## 2. Focus Session Detection Tests

### 2.1 Session State Detection

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Detect running session | Start focus in main app | Extension shows "Focus Time" status |
| Detect paused session | Pause focus in main app | Extension shows "Session Paused" |
| Detect no session | Stop focus in main app | Extension shows "Ready to Focus" |
| Detect break phase | Wait for break in main app | Extension shows "Break Time" |

### 2.2 Session Caching

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Cache stores session | Start focus, check IndexedDB | Session in focusSessionCache |
| Cache updates on change | Change phase, check IndexedDB | Cache reflects new phase |
| Cache cleared on end | Stop session, check IndexedDB | Cache cleared |

---

## 3. Website Blocking Tests

### 3.1 Basic Blocking

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Block listed domain | Add youtube.com, start focus, navigate | Redirected to blocked page |
| Allow unlisted domain | Navigate to unlisted site during focus | Site loads normally |
| Block with www prefix | Add youtube.com, navigate to www.youtube.com | Blocked (subdomain match) |
| Block subdomain | Add google.com, navigate to mail.google.com | Blocked (subdomain match) |
| Don't block parent | Add mail.google.com, navigate to google.com | Not blocked (exact match only) |

### 3.2 Phase-Based Blocking

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Block during focus | Navigate during focus phase | Blocked |
| Allow during break | Navigate during break phase | Allowed |
| Block after break ends | Focus→break→focus, navigate | Blocked again |
| Allow when paused | Pause session, navigate | Allowed |
| Allow when stopped | Stop session, navigate | Allowed |

### 3.3 Protocol Handling

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Block HTTP | Navigate to http://blocked.com | Blocked |
| Block HTTPS | Navigate to https://blocked.com | Blocked |
| Don't block extension URLs | Navigate to moz-extension:// | Allowed |
| Don't block about: pages | Navigate to about:settings | Allowed |
| Don't block chrome:// | Navigate to chrome://extensions | Allowed |

### 3.4 Frame Handling

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Block main frame | Navigate to blocked site | Blocked |
| Allow iframe | Embedded iframe of blocked site | Not blocked (design choice) |

---

## 4. Block List Tests

### 4.1 List Management

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| New list blocks | Create list, add domain, start focus | Domain blocked |
| Disabled list allows | Disable list, start focus | Domains not blocked |
| Re-enabled list blocks | Re-enable list | Domains blocked again |
| Deleted list allows | Delete list, navigate | Domains not blocked |

### 4.2 Multiple Lists

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Domain in multiple lists | Add domain to two lists, disable one | Still blocked (other list) |
| All lists disabled | Disable all lists | No blocking |
| Mixed enabled/disabled | One enabled, one disabled | Only enabled list's domains blocked |

### 4.3 Cache Sync

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Cache updates on add | Add domain in main app | Extension blocks domain |
| Cache updates on remove | Remove domain in main app | Extension allows domain |
| Cache updates on toggle | Toggle list in main app | Extension respects new state |

---

## 5. Day Scheduling Tests

### 5.1 Active Days

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Weekday-only list on weekday | Set Mon-Fri, test on Wednesday | Blocked |
| Weekday-only list on weekend | Set Mon-Fri, test on Saturday | Allowed |
| Weekend-only list on weekend | Set Sat-Sun, test on Sunday | Blocked |
| Weekend-only list on weekday | Set Sat-Sun, test on Monday | Allowed |
| All days (null) | Set all days, test any day | Always blocked |

### 5.2 Day Boundaries

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Midnight transition | Test across midnight | Uses new day's schedule |
| Timezone handling | Test with different system timezone | Uses local time |

### 5.3 Multiple Lists Different Schedules

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| List A: Mon-Fri, List B: Sat-Sun | Test any day | Some list always active |
| Overlapping schedules | Both lists cover Tuesday | Both active on Tuesday |

---

## 6. Real-time Sync Tests

### 6.1 Focus Session Events

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Session start event | Start focus in main app | Extension updates within 1s |
| Session pause event | Pause focus in main app | Extension updates within 1s |
| Session stop event | Stop focus in main app | Extension updates within 1s |
| Phase change event | Wait for phase change | Extension updates within 1s |

### 6.2 Block List Events

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| List created event | Create list in main app | Extension caches within 1s |
| List updated event | Update list in main app | Extension caches within 1s |
| List deleted event | Delete list in main app | Extension removes from cache |
| Website added event | Add website in main app | Extension caches within 1s |
| Website removed event | Remove website in main app | Extension removes from cache |

### 6.3 Subscription Recovery

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Reconnect after disconnect | Simulate WebSocket disconnect | Subscription re-established |
| Token refresh maintains subscription | Wait for token refresh | Subscription continues working |

---

## 7. Polling Tests

### 7.1 Regular Polling

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Poll interval | Wait 30+ seconds | Poll executes |
| Poll updates state | Change session in DB directly | Poll detects change |
| Poll on browser start | Start browser with extension | Initial poll executes |

### 7.2 Polling Fallback

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Poll when realtime fails | Disable WebSocket | Polling continues working |
| Poll catches missed events | Miss realtime event | Poll recovers state |

---

## 8. Offline Behavior Tests

### 8.1 Offline Detection

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Detect offline | Disable network | Extension shows offline state |
| Detect online | Re-enable network | Extension shows online state |
| Handle flaky connection | Toggle network rapidly | Handles gracefully |

### 8.2 Offline Blocking

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| No blocking when offline | Go offline, navigate to blocked site | Site allowed (fail-safe) |
| Blocking resumes online | Come online during focus | Blocking resumes |

### 8.3 Offline Cache

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Cache persists offline | Go offline, check IndexedDB | Data still present |
| Cache used on reconnect | Come online | Cached data used initially |

---

## 9. Popup UI Tests

### 9.1 Status Display

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Show focus status | Open popup during focus | Shows "Focus Time" |
| Show break status | Open popup during break | Shows "Break Time" |
| Show idle status | Open popup with no session | Shows "Ready to Focus" |
| Show paused status | Open popup when paused | Shows "Session Paused" |
| Update on change | Change state while popup open | UI updates |

### 9.2 Block Lists Display

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Show all lists | Open popup with lists | All lists displayed |
| Show enabled state | Have enabled/disabled lists | Correct indicators shown |
| Show edit links | View list items | Edit links present and work |
| Show empty state | Have no block lists | "No block lists" message |

### 9.3 Sync Status

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Show syncing | Trigger sync | Syncing indicator shows |
| Show synced | After successful sync | Synced checkmark shows |
| Show error | Cause sync error | Error indicator shows |
| Show offline | Go offline | Offline indicator shows |

### 9.4 Navigation

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Open Stellar | Click "Open Stellar" | Stellar opens or focuses |
| Focus existing tab | Have Stellar open, click button | Existing tab focused |
| Edit block list | Click edit on list | Opens edit page in Stellar |

### 9.5 Focus Time Display

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Show today's time | Complete focus sessions | Total time displayed |
| Update during session | Active session running | Time increments |
| Format correctly | Various time amounts | "15m", "1h 30m", etc. |

---

## 10. Blocked Page Tests

### 10.1 Page Display

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Shows blocked domain | Get blocked | Domain displayed correctly |
| Shows encouraging message | Get blocked | Random submessage shown |
| Galaxy renders | Get blocked | Animated galaxy visible |
| Starfield renders | Get blocked | Background stars visible |

### 10.2 Navigation

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Return button works | Click "Return to Stellar" | Opens/focuses Stellar |
| Escape key works | Press Escape | Goes back in history |
| Enter key works | Press Enter | Opens Stellar |

### 10.3 Visual Quality

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Responsive design | View on various screen sizes | Layout adapts |
| Animation performance | Watch animations | Smooth 60fps |
| Reduced motion | Enable prefers-reduced-motion | Animations disabled |

---

## 11. Browser-Specific Tests

### 11.1 Firefox

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Install from AMO | Install via Add-ons site | Installs correctly |
| Manifest V3 works | Check functionality | All features work |
| Permissions granted | Install extension | Required permissions granted |
| Service worker persists | Leave browser idle | Worker stays active |

### 11.2 Chrome

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Load unpacked | Load from dist-chrome | Loads correctly |
| Manifest V3 works | Check functionality | All features work |
| Service worker lifecycle | Test worker activation | Activates when needed |
| Storage quota | Check storage limits | Stays within limits |

### 11.3 Cross-Browser

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Same blocking behavior | Test same scenario | Identical results |
| Same UI | Compare popups | Visually identical |
| Same real-time | Test realtime sync | Both receive updates |

---

## 12. Extension Lifecycle Tests

### 12.1 Installation

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| First install | Install fresh extension | Initializes correctly |
| Initialize on install | Check after install | Alarm set, state initialized |
| Permissions prompt | Install | Correct permissions requested |

### 12.2 Update

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Update preserves data | Update extension version | Cached data preserved |
| Update reinitializes | Update extension | Alarm and state reset |

### 12.3 Browser Restart

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| State survives restart | Restart browser | Login preserved |
| Cache survives restart | Restart browser | Block lists cached |
| Session resumes | Restart during focus | Session state preserved |

### 12.4 Extension Reload

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Reload preserves login | Reload extension | Still logged in |
| Reload reconnects | Reload extension | Realtime reconnects |
| Blocking resumes | Reload during focus | Blocking continues |

---

## 13. Edge Cases

### 13.1 Rapid State Changes

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Rapid start/stop | Start/stop quickly | Correct final state |
| Rapid navigation | Navigate to many blocked sites | All blocked correctly |
| Rapid list changes | Add/remove domains quickly | All changes reflected |

### 13.2 Large Data Sets

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Many block lists | Create 50+ lists | All cached and used |
| Many domains | Add 1000+ domains | All checked efficiently |
| Long domain names | Add very long domain | Handled correctly |

### 13.3 Network Edge Cases

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Very slow network | Throttle to 2G | Eventually syncs |
| Intermittent connection | Packet loss | Recovers gracefully |
| Supabase down | Simulate outage | Shows offline, no blocking |

### 13.4 Concurrent Access

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Multiple popup opens | Open popup in multiple windows | All update correctly |
| Popup during navigation | Open popup while being blocked | Shows correct state |
| Edit while blocking | Edit list while navigating | Eventually consistent |

### 13.5 Session Timing

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Session expires | Let focus session complete | Blocking stops |
| Phase transition during nav | Navigate as phase changes | Correct for new phase |
| Midnight during session | Focus across midnight | Day check uses new day |

### 13.6 Domain Edge Cases

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| IP address | Add 192.168.1.1 | Blocks IP correctly |
| localhost | Add localhost | Blocks localhost |
| Port in URL | Navigate to blocked.com:8080 | Blocks (port ignored) |
| Path in URL | Navigate to blocked.com/path | Blocks (path ignored) |
| Query string | Navigate to blocked.com?q=1 | Blocks (query ignored) |
| Fragment | Navigate to blocked.com#section | Blocks (fragment ignored) |

### 13.7 Special Characters

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| IDN domain | Add xn--example | Handles Punycode |
| Unicode domain | Add emoji.ws | Converts correctly |
| Special chars in URL | Navigate to site with % encoding | Handles encoding |

---

## Test Environment Setup

### Prerequisites
- Firefox 142+ and/or Chrome 109+
- Node.js 18+ for building
- Supabase project with test data
- Network throttling tools (optional)

### Build for Testing
```bash
cd stellar-focus
npm install
npm run build:firefox   # or build:chrome
```

### Load Extension
**Firefox:**
1. Open `about:debugging`
2. Click "This Firefox"
3. Load Temporary Add-on
4. Select `dist-firefox/manifest.json`

**Chrome:**
1. Open `chrome://extensions`
2. Enable Developer Mode
3. Load Unpacked
4. Select `dist-chrome` directory

### Test Data Setup
1. Create test account in Stellar
2. Create various block lists with different schedules
3. Add domains to block lists
4. Note credentials for extension login

### Monitoring
- **IndexedDB**: Use browser DevTools → Application → IndexedDB
- **Service Worker**: DevTools → Application → Service Workers
- **Console**: Background page console for logs
- **Network**: DevTools → Network for Supabase requests
