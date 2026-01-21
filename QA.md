# Stellar QA Test Document

Comprehensive testing checklist covering all features, edge cases, sync behavior, offline authentication, and online/offline transitions.

---

## Table of Contents

1. [Test Environment Setup](#test-environment-setup)
2. [Authentication Tests](#authentication-tests)
3. [Goal Lists Tests](#goal-lists-tests)
4. [Daily Routines Tests](#daily-routines-tests)
5. [Calendar Tests](#calendar-tests)
6. [Tasks Tests](#tasks-tests)
7. [Focus Timer Tests](#focus-timer-tests)
8. [Block Lists Tests](#block-lists-tests)
9. [Sync Engine Tests](#sync-engine-tests)
10. [Offline Mode Tests](#offline-mode-tests)
11. [PWA Tests](#pwa-tests)
12. [UI/UX Tests](#uiux-tests)
13. [Cross-Device Tests](#cross-device-tests)
14. [Performance Tests](#performance-tests)
15. [Edge Cases](#edge-cases)

---

## Test Environment Setup

### Prerequisites
- [ ] Chrome with DevTools (Application tab for IndexedDB/Service Worker)
- [ ] Firefox for cross-browser testing
- [ ] Mobile device or emulator for responsive testing
- [ ] Network throttling tool (Chrome DevTools or external)
- [ ] Multiple browser sessions/incognito windows for multi-device simulation

### Test Accounts
- Primary test account (main testing)
- Secondary test account (cross-device sync testing)

### Developer Tools
- IndexedDB inspection: DevTools → Application → IndexedDB → GoalPlannerDB
- Service Worker: DevTools → Application → Service Workers
- Network tab for sync verification
- Console for error monitoring

---

## Authentication Tests

### Online Login
- [ ] Login with valid email/password succeeds
- [ ] Login with invalid email shows error
- [ ] Login with wrong password shows error
- [ ] Login button shows loading spinner during request
- [ ] Successful login redirects to `/goals`
- [ ] User name displays in navigation
- [ ] Session persists after page refresh

### Signup
- [ ] Signup with new email succeeds
- [ ] Signup with existing email shows error
- [ ] Weak password shows validation error
- [ ] First/last name fields are captured
- [ ] Successful signup redirects to `/goals`

### Offline Login
- [ ] After online login, go offline (DevTools → Network → Offline)
- [ ] Refresh page - should stay authenticated
- [ ] Navigate between pages - should work
- [ ] Login form works offline with cached credentials
- [ ] Wrong password offline shows error
- [ ] Offline session expires after 7 days

### Logout
- [ ] Logout clears session
- [ ] Logout redirects to login page
- [ ] After logout, cannot access protected routes
- [ ] IndexedDB credentials cleared on logout

### Session Management
- [ ] Session refresh when online
- [ ] Automatic re-authentication on reconnect
- [ ] Multiple tabs share session state
- [ ] Password change invalidates offline credentials

---

## Goal Lists Tests

### Create Goal List
- [ ] Click "New List" opens creation form
- [ ] Can enter list name
- [ ] Creating list adds to list immediately (optimistic)
- [ ] New list appears at top of list
- [ ] Empty name validation (if applicable)

### View Goal Lists
- [ ] All lists display with names
- [ ] Completion percentage shows correctly
- [ ] Color gradient reflects completion (red→green)
- [ ] Clicking list navigates to detail view

### Edit Goal List
- [ ] Can edit list name
- [ ] Edit saves immediately
- [ ] Name updates in list view

### Delete Goal List
- [ ] Delete confirmation (if applicable)
- [ ] Deleted list removes from view immediately
- [ ] Deleting list deletes associated goals

### Goals within List

#### Create Goal
- [ ] Add completion goal works
- [ ] Add incremental goal works
- [ ] Incremental goal with target value saves correctly
- [ ] New goal appears in list
- [ ] Order is preserved

#### Update Goal
- [ ] Toggle completion goal works
- [ ] Increment incremental goal works
- [ ] Decrement incremental goal works
- [ ] Can edit goal name
- [ ] Changes reflect immediately

#### Delete Goal
- [ ] Delete removes goal from view
- [ ] List completion percentage updates

#### Reorder Goals
- [ ] Drag and drop reorders goals
- [ ] New order persists after refresh
- [ ] Order syncs to other devices

### Progress Calculation
- [ ] 0/5 goals = 0% (red)
- [ ] 2/5 goals = 40% (yellow-ish)
- [ ] 5/5 goals = 100% (green)
- [ ] Incremental goals: 50/100 = 50% contribution
- [ ] Mixed goals calculate correctly

---

## Daily Routines Tests

### Create Routine
- [ ] Create routine with name
- [ ] Select completion type
- [ ] Select incremental type with target
- [ ] Set start date
- [ ] Set end date (optional)
- [ ] Select active days (subset of week)
- [ ] "Every Day" quick-select works
- [ ] "Weekdays" quick-select works
- [ ] "Weekends" quick-select works
- [ ] Routine appears in list

### Edit Routine
- [ ] Can change name
- [ ] Can change type
- [ ] Can modify date range
- [ ] Can change active days
- [ ] Changes save correctly

### Delete Routine
- [ ] Delete removes routine
- [ ] Associated progress data handled

### Active Days Logic
- [ ] Routine with Monday-Friday only shows on weekdays
- [ ] Routine with Sat-Sun only shows on weekends
- [ ] Routine with specific days only shows on those days
- [ ] "All days" routine shows every day
- [ ] Past routines (ended) don't show for current day

### Date Range Logic
- [ ] Routine not started yet doesn't show for today
- [ ] Routine ended yesterday doesn't show for today
- [ ] Routine active today shows correctly
- [ ] Future start date - routine not visible until that date

---

## Calendar Tests

### Monthly View
- [ ] Correct month name displays
- [ ] Correct number of days
- [ ] Days aligned to correct day-of-week
- [ ] Previous/next month navigation works
- [ ] Today highlighted

### Day Colors
- [ ] No routines = neutral color
- [ ] 0% completion = red
- [ ] 50% completion = yellow/orange
- [ ] 100% completion = green
- [ ] Days before any routine started = neutral

### Day Detail View
- [ ] Click day opens detail panel
- [ ] Shows routines active on that day
- [ ] Can toggle completion goals
- [ ] Can increment/decrement incremental goals
- [ ] Changes reflect in calendar color

### Edge Cases
- [ ] First day of month alignment correct
- [ ] Months with 28, 29, 30, 31 days all work
- [ ] Year transition (Dec → Jan) works
- [ ] Leap year February displays correctly

---

## Tasks Tests

### Daily Tasks
- [ ] Add new task works
- [ ] Task appears in list
- [ ] Toggle completion works
- [ ] Completed tasks show strikethrough
- [ ] Can reorder tasks (drag-drop)
- [ ] "Clear completed" removes completed tasks

### Task Categories
- [ ] Create new category with name and color
- [ ] Category appears in category list
- [ ] Color picker works
- [ ] Edit category name/color
- [ ] Delete category (handles tasks in category)

### Commitments
- [ ] Create commitment in Career section
- [ ] Create commitment in Social section
- [ ] Create commitment in Personal section
- [ ] Commitments display in correct sections
- [ ] Edit commitment name/section
- [ ] Delete commitment
- [ ] Reorder commitments within section

### Long-term Tasks
- [ ] Create task with name
- [ ] Set due date
- [ ] Assign category (optional)
- [ ] Task appears sorted by due date
- [ ] Toggle completion works
- [ ] Edit task details
- [ ] Delete task
- [ ] Filter by category works

---

## Focus Timer Tests

### Starting Session
- [ ] Click start begins focus phase
- [ ] Timer displays correct duration
- [ ] Progress ring animates
- [ ] Status shows "Focusing"
- [ ] Extension notified (if installed)

### Timer Mechanics
- [ ] Timer counts down correctly
- [ ] Pause stops countdown
- [ ] Resume continues from paused time
- [ ] Skip moves to next phase
- [ ] Timer reaches 0 and transitions

### Phase Transitions
- [ ] Focus → Short Break (before long break interval)
- [ ] Focus → Long Break (at long break interval)
- [ ] Break → Focus (increments cycle)
- [ ] Final cycle ends session

### Session Persistence
- [ ] Refresh page - timer continues
- [ ] Close and reopen - timer state restored
- [ ] Timer accurately calculated from stored timestamps

### Focus Time Tracking
- [ ] "Focus Time Today" shows 0m initially
- [ ] After focus phase, time updates
- [ ] Skipping early counts actual elapsed time
- [ ] Break time not counted
- [ ] Multiple sessions accumulate

### Settings
- [ ] Open settings modal
- [ ] Change focus duration (5-240 min)
- [ ] Change short break (1-20 min)
- [ ] Change long break (5-60 min)
- [ ] Change cycles before long break
- [ ] Toggle auto-start breaks
- [ ] Toggle auto-start focus
- [ ] Settings persist after refresh
- [ ] Modal doesn't overlap navbar

---

## Block Lists Tests

### Create Block List
- [ ] Create new list with name
- [ ] Select active days
- [ ] List appears in block lists section

### Edit Block List
- [ ] Edit opens edit page
- [ ] Can change name
- [ ] Can change active days
- [ ] Save persists changes

### Enable/Disable
- [ ] Toggle enables/disables list
- [ ] Disabled list shows visually different
- [ ] Disabled list doesn't block during focus

### Add Blocked Websites
- [ ] Add domain to list
- [ ] Domain appears in list
- [ ] Subdomains handled (www.example.com → example.com)

### Remove Blocked Websites
- [ ] Remove website from list
- [ ] Website no longer blocked

### Active Days Logic
- [ ] List with Mon-Fri only blocks weekdays
- [ ] List with specific days only blocks on those days
- [ ] "All days" list blocks every day

### Delete Block List
- [ ] Delete removes list
- [ ] Associated websites removed

---

## Sync Engine Tests

### Initial Sync
- [ ] After login, data loads from local DB
- [ ] Background sync pulls remote data
- [ ] UI updates when sync completes

### Push Sync
- [ ] Create entity → appears locally immediately
- [ ] Create entity → syncs to server (check Network tab)
- [ ] Update entity → syncs to server
- [ ] Delete entity → syncs to server

### Pull Sync
- [ ] Change data in another session/device
- [ ] Original session receives update
- [ ] UI refreshes with new data

### Conflict Resolution
- [ ] Edit same entity on two devices offline
- [ ] Bring both online - last write wins
- [ ] No data loss for non-conflicting fields

### Retry Logic
- [ ] Create entity while offline
- [ ] Come online - entity syncs
- [ ] Network error during sync → retry
- [ ] Max retries exceeded → item quarantined

### Real-time Updates
- [ ] Supabase subscription active
- [ ] Change from Device A
- [ ] Device B receives update without refresh

---

## Offline Mode Tests

### Going Offline
- [ ] Use DevTools Network → Offline
- [ ] App continues to function
- [ ] Sync status shows "Offline"
- [ ] Can read all data

### Writing Offline
- [ ] Create goal list offline → appears locally
- [ ] Edit goal offline → changes locally
- [ ] Delete goal offline → removed locally
- [ ] All operations queue for sync

### Coming Online
- [ ] Enable network
- [ ] Sync starts automatically
- [ ] Queued operations push to server
- [ ] Status returns to "idle"
- [ ] No data loss

### Extended Offline
- [ ] Work offline for extended period
- [ ] Multiple create/update/delete operations
- [ ] Come online → all operations sync
- [ ] Order of operations preserved

### Offline Authentication
- [ ] Login online, then go offline
- [ ] Refresh page → still authenticated
- [ ] Can use app fully offline
- [ ] Credentials cached in IndexedDB

---

## PWA Tests

### Installation
- [ ] "Add to Home Screen" prompt appears (mobile)
- [ ] Install via browser UI (desktop)
- [ ] App icon appears on home screen/dock
- [ ] Launches in standalone mode

### Offline Capability
- [ ] Install app, then go offline
- [ ] App still opens
- [ ] All features work offline

### Update Flow
- [ ] Deploy new version
- [ ] User sees "Update Available" banner
- [ ] Click "Refresh" updates app
- [ ] New version loads correctly
- [ ] Old caches cleaned up

### Cache Behavior
- [ ] First visit caches critical assets
- [ ] Subsequent visits load from cache
- [ ] HTML served fresh (network-first)
- [ ] JS/CSS cached (cache-first)

---

## UI/UX Tests

### Responsive Design
- [ ] Mobile viewport (375px) - all features accessible
- [ ] Tablet viewport (768px) - optimal layout
- [ ] Desktop viewport (1200px+) - full layout
- [ ] Navigation adapts to viewport
- [ ] Touch targets adequate on mobile

### Animations
- [ ] Starfield background animates smoothly
- [ ] Button hover effects work
- [ ] Modal open/close transitions
- [ ] Loading skeletons display
- [ ] Timer ring animation smooth
- [ ] No jank during interactions

### Accessibility
- [ ] Tab navigation works
- [ ] Focus rings visible
- [ ] Screen reader can navigate
- [ ] Color contrast adequate
- [ ] Reduced motion preference respected

### Loading States
- [ ] Initial load shows skeletons
- [ ] Data loads and replaces skeletons
- [ ] No layout shift

### Error States
- [ ] Network error shows message
- [ ] Invalid form input shows error
- [ ] Sync error shows indicator

### Navigation
- [ ] All nav links work
- [ ] Back button works
- [ ] Deep links work
- [ ] Route guards protect authenticated routes

---

## Cross-Device Tests

### Multi-Device Sync
- [ ] Login on Device A
- [ ] Login on Device B (same account)
- [ ] Create goal on A → appears on B
- [ ] Edit routine on B → reflects on A

### Conflict Scenarios
- [ ] Both devices offline
- [ ] Edit same goal on both
- [ ] Both come online
- [ ] Last edit wins, no corruption

### Session Sync
- [ ] Start focus session on Device A
- [ ] Check status on Device B
- [ ] Session state visible on both

---

## Performance Tests

### Initial Load
- [ ] First contentful paint < 2s
- [ ] Time to interactive < 3s
- [ ] No blocking requests

### IndexedDB Performance
- [ ] 100 goals load quickly
- [ ] 1000 goals load without issue
- [ ] Queries optimized (check indexes)

### Sync Performance
- [ ] Large data set syncs without timeout
- [ ] UI remains responsive during sync
- [ ] No memory leaks during extended use

### Animation Performance
- [ ] 60fps during animations
- [ ] No jank in timer ring
- [ ] Smooth scrolling with many items

---

## Edge Cases

### Empty States
- [ ] No goal lists - shows empty message
- [ ] No routines - shows empty message
- [ ] No tasks - shows empty message
- [ ] Empty goal list - shows "Add a goal"

### Boundary Values
- [ ] Goal name max length
- [ ] Incremental goal target = 0
- [ ] Incremental goal target = very large number
- [ ] Focus duration = 5 min (minimum)
- [ ] Focus duration = 240 min (maximum)
- [ ] Date far in past (for start date)
- [ ] Date far in future (for end date)

### Race Conditions
- [ ] Rapid clicking create button
- [ ] Quick succession of edits
- [ ] Sync while writing
- [ ] Multiple tabs editing same entity

### Data Integrity
- [ ] Soft-deleted items don't appear
- [ ] Tombstoned items sync correctly
- [ ] Orphaned data handled (goal without list)
- [ ] Circular references prevented

### Error Recovery
- [ ] Network timeout during sync
- [ ] Supabase rate limit
- [ ] IndexedDB storage full
- [ ] Browser tab crash and recovery

### Time Zone Handling
- [ ] Calendar shows correct dates
- [ ] Routines activate at correct local time
- [ ] "Today" calculation correct across midnight
- [ ] User in different time zone

### Browser Compatibility
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari
- [ ] Chrome Mobile

---

## Test Execution Checklist

### Pre-Release Testing
- [ ] All authentication tests pass
- [ ] All CRUD operations work
- [ ] Sync functioning correctly
- [ ] Offline mode fully working
- [ ] PWA installation works
- [ ] UI renders correctly across devices
- [ ] No console errors
- [ ] Performance acceptable

### Regression Testing
After any code change, verify:
- [ ] Affected feature works
- [ ] Related features still work
- [ ] Sync still functions
- [ ] Offline mode unaffected

### Production Verification
After deployment:
- [ ] App loads on production URL
- [ ] Can create new account
- [ ] Existing users can login
- [ ] Data syncs correctly
- [ ] PWA update works

---

## Bug Report Template

```markdown
### Bug Title
[Clear, concise description]

### Environment
- Browser:
- OS:
- Device:
- Network: Online/Offline

### Steps to Reproduce
1.
2.
3.

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Screenshots/Videos
[If applicable]

### Console Errors
[Any errors from DevTools]

### Additional Context
[Any other relevant information]
```
