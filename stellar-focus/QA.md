# Stellar Focus Extension QA Test Document

Comprehensive testing checklist for the Stellar Focus browser extension, covering blocking functionality, sync behavior, offline scenarios, and UI.

---

## Table of Contents

1. [Test Environment Setup](#test-environment-setup)
2. [Installation Tests](#installation-tests)
3. [Authentication Tests](#authentication-tests)
4. [Focus Session Detection Tests](#focus-session-detection-tests)
5. [Website Blocking Tests](#website-blocking-tests)
6. [Block List Management Tests](#block-list-management-tests)
7. [Blocked Page Tests](#blocked-page-tests)
8. [Popup UI Tests](#popup-ui-tests)
9. [Sync & Real-time Tests](#sync--real-time-tests)
10. [Offline Mode Tests](#offline-mode-tests)
11. [Cross-Browser Tests](#cross-browser-tests)
12. [Performance Tests](#performance-tests)
13. [Edge Cases](#edge-cases)

---

## Test Environment Setup

### Prerequisites
- Firefox (latest) with `about:debugging` access
- Chrome (latest) with Developer Mode enabled
- Stellar web app running (local or production)
- Test account with:
  - At least one block list with websites
  - Focus session capability

### Debug Tools
- **Firefox**: `about:debugging` → This Firefox → Stellar Focus → Inspect (service worker console)
- **Chrome**: `chrome://extensions` → Stellar Focus → Service Worker → Inspect
- **IndexedDB**: DevTools → Application → IndexedDB → `stellar-focus-extension`
- **Browser Storage**: DevTools → Application → Local Storage

### Test Domains
Common distracting sites for testing:
- `youtube.com` / `www.youtube.com` / `music.youtube.com`
- `twitter.com` / `x.com`
- `facebook.com`
- `reddit.com`
- `instagram.com`

---

## Installation Tests

### Firefox Installation
- [ ] Load from `about:debugging` → Load Temporary Add-on
- [ ] Extension icon appears in toolbar
- [ ] Popup opens when clicking icon
- [ ] Permissions prompt shows correct permissions
- [ ] No console errors on install

### Chrome Installation
- [ ] Load unpacked from `chrome://extensions`
- [ ] Extension icon appears in toolbar
- [ ] Popup opens when clicking icon
- [ ] No console errors on install

### Update Installation
- [ ] Rebuild extension with changes
- [ ] Reload extension in browser
- [ ] Changes take effect
- [ ] No data loss (cached data preserved)

---

## Authentication Tests

### Login
- [ ] Open popup → auth section shown when not logged in
- [ ] Enter valid email/password → login succeeds
- [ ] Main section appears after login
- [ ] User email/name displays correctly
- [ ] Session persists after popup close/reopen

### Login Errors
- [ ] Invalid email shows error message
- [ ] Wrong password shows error message
- [ ] Network error shows appropriate message
- [ ] Loading state shows during login attempt

### Logout
- [ ] Click "Sign Out" button
- [ ] Confirm logout
- [ ] Auth section appears
- [ ] Session cleared from storage
- [ ] Focus session cache cleared

### Session Persistence
- [ ] Login, close browser, reopen
- [ ] Open popup → still logged in
- [ ] No re-authentication required

---

## Focus Session Detection Tests

### Initial Detection
- [ ] Login to extension
- [ ] Start focus session in Stellar app
- [ ] Open popup → shows "Focusing" status
- [ ] Timer/phase information displays correctly

### Real-time Detection
- [ ] Start focus session in Stellar
- [ ] Watch service worker console
- [ ] See "Real-time: Focus session update" message
- [ ] Popup shows updated status immediately

### Polling Detection
- [ ] Disable real-time (disconnect network briefly)
- [ ] Start focus session in Stellar
- [ ] Wait up to 30 seconds
- [ ] Extension detects session via polling

### Phase Transitions
- [ ] Start focus session → shows "Focus" phase
- [ ] Wait for break → shows "Break" phase
- [ ] Skip to next phase → updates correctly
- [ ] Session ends → shows "Ready" or idle state

### Pause/Resume
- [ ] Pause focus session in Stellar
- [ ] Popup shows paused status
- [ ] Resume session → shows running status
- [ ] Timer continues correctly

---

## Website Blocking Tests

### Basic Blocking
- [ ] Start focus session in Stellar
- [ ] Add `youtube.com` to enabled block list
- [ ] Navigate to `youtube.com` → blocked page shown
- [ ] Navigate to `www.youtube.com` → blocked (subdomain)
- [ ] Navigate to `music.youtube.com` → blocked (subdomain)

### Block List Toggle
- [ ] Enable block list → sites blocked
- [ ] Disable block list → sites allowed
- [ ] Re-enable → sites blocked again

### Multiple Block Lists
- [ ] Create List A with `youtube.com`
- [ ] Create List B with `twitter.com`
- [ ] Enable both → both domains blocked
- [ ] Disable List A → only Twitter blocked
- [ ] Disable List B → neither blocked

### Days-of-Week Scheduling
- [ ] Create block list with weekdays only
- [ ] Test on weekday → sites blocked
- [ ] Change system date to weekend (or test on weekend) → sites allowed
- [ ] Create block list with specific days → only blocks on those days

### Break Phase
- [ ] Start focus session
- [ ] During focus phase → sites blocked
- [ ] Advance to break phase
- [ ] Same sites → now allowed
- [ ] Return to focus → blocked again

### Session States
- [ ] Session running + focus phase → blocking active
- [ ] Session paused → no blocking
- [ ] Session stopped → no blocking
- [ ] No session → no blocking

---

## Block List Management Tests

### View Block Lists
- [ ] Login to extension
- [ ] See count of active block lists in popup
- [ ] Click to expand/view lists (if implemented)

### Edit Block Lists
- [ ] Click edit link in popup
- [ ] Opens correct page in Stellar app (`/focus/block-lists/{id}`)
- [ ] Uses existing tab if Stellar already open
- [ ] Opens new tab if no Stellar tab

### Add Website from App
- [ ] Add website in Stellar app
- [ ] Check service worker console for real-time update
- [ ] New website immediately blocked (if in focus)

### Remove Website from App
- [ ] Remove website in Stellar app
- [ ] Website no longer blocked
- [ ] Real-time update received

---

## Blocked Page Tests

### Visual Elements
- [ ] Blocked page loads correctly
- [ ] Galaxy animation renders
- [ ] Starfield background renders
- [ ] "Stay Focused" message displays
- [ ] Submessage displays (randomized)
- [ ] Blocked domain shows at bottom

### Animations
- [ ] Galaxy rotates smoothly
- [ ] Stars twinkle
- [ ] No performance issues (smooth 60fps)
- [ ] Window resize handled correctly

### Navigation
- [ ] "Return to Focus" button works
- [ ] Opens/focuses Stellar app
- [ ] Doesn't create duplicate tabs

### Keyboard Shortcuts
- [ ] Press `Escape` → goes back in history
- [ ] Press `Enter` → opens Stellar app

### Multiple Blocks
- [ ] Get blocked, click back
- [ ] Try another blocked site
- [ ] Each block shows correct domain

---

## Popup UI Tests

### Layout
- [ ] Popup opens at correct size
- [ ] All elements visible without scrolling
- [ ] Responsive if width constrained
- [ ] Starfield background animates

### Sync Indicator
- [ ] Shows idle state (checkmark) when synced
- [ ] Shows syncing state (spinner) during sync
- [ ] Shows error state on sync failure
- [ ] Clicking triggers manual sync

### Focus Status Card
- [ ] Correct icon shows for each phase (focus/break/idle)
- [ ] Status label accurate ("Focusing", "On Break", "Ready")
- [ ] Time remaining displays (if implemented)

### Block Lists Section
- [ ] Shows count of active lists
- [ ] Toggle enables/disables lists
- [ ] Changes sync to server

### User Section
- [ ] Avatar/initial displays
- [ ] User name/email displays
- [ ] Sign out button works

### Footer Links
- [ ] "Open Stellar" link works
- [ ] Uses existing tab or opens new
- [ ] Privacy link opens policy page

### Offline Placeholder
- [ ] Shows when offline
- [ ] Hides main content appropriately
- [ ] Online → placeholder hides

---

## Sync & Real-time Tests

### Real-time Focus Updates
- [ ] Start session in Stellar
- [ ] Extension receives WebSocket update
- [ ] Console shows "Real-time: Focus session update"
- [ ] State updates without manual refresh

### Real-time Block List Updates
- [ ] Add website to block list in Stellar
- [ ] Extension receives update
- [ ] Console shows "Real-time: Block list update"
- [ ] New site immediately blocked

### Manual Sync
- [ ] Click sync button in popup
- [ ] Sync indicator shows syncing state
- [ ] Data refreshes
- [ ] Sync indicator returns to idle

### Sync After Coming Online
- [ ] Go offline
- [ ] Come back online
- [ ] Extension re-establishes subscriptions
- [ ] Data syncs correctly

---

## Offline Mode Tests

### Offline Detection
- [ ] Go offline (DevTools → Network → Offline)
- [ ] Popup shows offline state
- [ ] Service worker logs "Offline - skipping poll"

### Offline Blocking
- [ ] Start focus session while online
- [ ] Verify blocking works
- [ ] Go offline
- [ ] **IMPORTANT**: Extension should fail-safe (allow navigation when offline)
- [ ] This is intentional behavior for safety

### Cached Data
- [ ] Login and sync while online
- [ ] Go offline
- [ ] Open popup → can still see cached data
- [ ] Block lists still visible (but blocking disabled)

### Coming Online
- [ ] Was offline, come online
- [ ] Service worker logs reconnection
- [ ] Real-time subscriptions re-established
- [ ] Blocking resumes if session active

### Offline Login
- [ ] Must have logged in online at least once
- [ ] Go offline
- [ ] Close and reopen popup
- [ ] Should still be "logged in" (cached session)
- [ ] Full functionality requires online

---

## Cross-Browser Tests

### Firefox Specific
- [ ] Manifest version 3 working
- [ ] Background scripts load correctly
- [ ] alarms API works
- [ ] webNavigation API works
- [ ] Storage API works (browser.storage.local)

### Chrome Specific
- [ ] Service worker lifecycle correct
- [ ] alarms API works
- [ ] webNavigation API works
- [ ] Storage API works (chrome.storage.local)

### Feature Parity
- [ ] Blocking works identically
- [ ] Popup looks the same
- [ ] Blocked page renders the same
- [ ] Performance comparable

---

## Performance Tests

### Startup Performance
- [ ] Extension initializes quickly (< 1s)
- [ ] Popup opens quickly (< 500ms)
- [ ] No blocking lag on navigation

### Memory Usage
- [ ] Service worker memory reasonable (< 50MB)
- [ ] Blocked page memory reasonable
- [ ] No memory leaks over time

### Animation Performance
- [ ] Galaxy renders at 60fps
- [ ] No jank during rotation
- [ ] Window resize smooth
- [ ] No CPU spikes

### Network Efficiency
- [ ] Polling only every 30 seconds
- [ ] Real-time doesn't cause excessive traffic
- [ ] Caching reduces redundant requests

---

## Edge Cases

### Rapid Navigation
- [ ] Click blocked link multiple times quickly
- [ ] Extension handles gracefully
- [ ] No duplicate redirects
- [ ] No crashes

### Tab Management
- [ ] Block in Tab A, open Tab B
- [ ] Tab B also blocks (service worker global)
- [ ] Multiple tabs handled correctly
- [ ] Private/incognito window behavior

### URL Edge Cases
- [ ] HTTPS version of blocked site
- [ ] HTTP version (if exists)
- [ ] URL with path (`youtube.com/watch?v=...`)
- [ ] URL with query params
- [ ] URL with fragment (`#`)

### Domain Edge Cases
- [ ] Subdomain not in list but parent is
- [ ] Parent domain not in list but subdomain is
- [ ] Similar domain names (youutube.com vs youtube.com)
- [ ] Internationalized domain names

### State Transitions
- [ ] Extension installed while session active
- [ ] Browser restart during session
- [ ] Multiple quick phase transitions
- [ ] Session timeout/expire

### Network Edge Cases
- [ ] Slow network (3G simulation)
- [ ] Intermittent connectivity
- [ ] VPN connection/disconnection
- [ ] Proxy settings

### Auth Edge Cases
- [ ] Session expires during use
- [ ] Password changed in Stellar app
- [ ] Account deleted
- [ ] Multiple accounts (switch users)

---

## Test Execution Checklist

### Pre-Release Testing
- [ ] All installation tests pass
- [ ] All authentication tests pass
- [ ] Basic blocking works correctly
- [ ] Offline behavior correct (fail-safe)
- [ ] Real-time sync working
- [ ] No console errors
- [ ] Performance acceptable

### Regression Testing
After any code change:
- [ ] Blocking still works
- [ ] Popup still works
- [ ] Blocked page renders
- [ ] Sync still functions
- [ ] Auth still works

### Production Verification
After Firefox Add-ons/Chrome Web Store deployment:
- [ ] Installation from store works
- [ ] All permissions granted
- [ ] Login works
- [ ] Blocking works
- [ ] Updates received

---

## Bug Report Template

```markdown
### Bug Title
[Clear, concise description]

### Environment
- Browser: Firefox/Chrome [version]
- Extension Version:
- OS:
- Stellar App Version:

### Steps to Reproduce
1.
2.
3.

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Service Worker Console Logs
[Copy relevant logs from about:debugging]

### Screenshots/Videos
[If applicable]

### Additional Context
- Online/Offline:
- Focus session state:
- Block lists enabled:
```

---

## Firefox Add-ons Review Notes

When submitting to Firefox Add-ons:

1. **Source Code Required**: Yes (uses esbuild)
2. **Build Instructions**: `npm install && npm run build:firefox`
3. **Data Collection**: Yes (authentication, email)
4. **Host Permissions**: `<all_urls>` (required for blocking any domain)
5. **`strict_min_version`**: 142.0 (for `data_collection_permissions`)

**Reviewer Testing Tips:**
- Create test account at stellarplanner.vercel.app
- Create a block list with `example.com`
- Start a focus session
- Try navigating to `example.com`
- Should see blocked page
