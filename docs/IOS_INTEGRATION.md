# Building the iOS app

Stellar Planner was built so a native iOS app can be added without touching the server. This document is the brief for that app: how it connects, where each kind of data comes from, and how to match the look.

Nothing here is implemented yet. Sections marked **(later)** are ideas that need Apple entitlements or extra design work.

## 1. Connect flow

The same three steps the browser extension uses.

1. **Ask for the address.** Accept anything URL-like (`planner.example.com`, with or without scheme or path) and reduce it to an origin. Default to `https://`.
2. **`GET {appUrl}/api/v1/instance`.** Confirm `name == "Stellar Planner"` and `configured == true`. Keep `supabaseUrl` and `supabaseAnonKey`. If `apiVersion` is higher than the app understands, ask the user to update the app.
3. **PIN.** Show a numeric keypad (6 to 12 digits) and call `POST {appUrl}/api/v1/auth/pin`:

   ```json
   { "pin": "246810", "device": { "name": "Alex's iPhone", "kind": "ios" } }
   ```

   The response contains `session` (`access_token`, `refresh_token`, `expires_at`, `user_id`) and `device_id`. Handle `401` (wrong PIN: show the server's message), `423` (locked: show a countdown from `retry_after_seconds`) and `429`.

Store `appUrl`, the Supabase URL and anon key, and the session in the **Keychain** (`kSecAttrAccessibleAfterFirstUnlock`, so background refresh works). The PIN itself is never stored. The device appears under Settings → Devices in the web app, where it can be revoked; treat any `401` after a refresh attempt as "signed out" and return to the PIN screen with the address remembered.

## 2. Realtime with supabase-swift

Hand the session to [supabase-swift](https://github.com/supabase/supabase-swift) and let it own token refresh. It then serves both Realtime and REST with the same token.

```swift
import Supabase

let supabase = SupabaseClient(supabaseURL: instance.supabaseUrl, supabaseKey: instance.supabaseAnonKey)
try await supabase.auth.setSession(accessToken: session.accessToken, refreshToken: session.refreshToken)

// Keep the Keychain copy current: refresh tokens rotate.
Task {
  for await (event, session) in supabase.auth.authStateChanges {
    if event == .tokenRefreshed || event == .signedIn, let session { keychain.save(session) }
    if event == .signedOut { router.showPin() }
  }
}
```

The focus timer is the one thing that must be live. Subscribe to the owner's row:

```swift
let channel = supabase.channel("sp:\(userId)")
let changes = channel.postgresChange(AnyAction.self, schema: "public", table: "sp_focus_state", filter: .eq("user_id", value: userId))
await channel.subscribe()

for await _ in changes {
  await timer.refresh()   // GET /focus/state, see below
}
```

- On every event (and on `scenePhase == .active`, and after reconnecting) call `GET /api/v1/focus/state`. It returns `state`, `settings`, `blocking` and `server_time` in one round trip, so the app never has to assemble them.
- Compute the countdown locally: `remaining = phase_ends_at − (Date() + skew)` where `skew = server_time − Date()` measured when the response arrived. Tick with `TimelineView(.periodic(from: .now, by: 1))`; never count down by decrementing.
- Send changes with `POST /api/v1/focus/actions` and `expectedVersion = state.version`. On `409`, adopt the returned state silently: another device simply got there first.
- Also subscribe to `sp_focus_settings`, `sp_block_lists` and `sp_block_list_sites` if the app shows or enforces blocking.
- Joining the channel with presence (`channel.track(["device": "ios:\(deviceId)", "kind": "ios"])`) makes the phone count in the web app's "N devices in sync" indicator.

The other tables are published to Realtime as well (`sp_tasks`, `sp_goals`, `sp_routines`, `sp_routine_logs`, …). Subscribing is optional; delta sync over REST when the app becomes active is enough for a first version.

## 3. REST for everything else

Use the REST API ([API.md](./API.md), [openapi.json](./openapi.json)) with `Authorization: Bearer <access token>` taken from `supabase.auth.session`. Generate Swift types from `openapi.json` with [swift-openapi-generator](https://github.com/apple/swift-openapi-generator) rather than writing them by hand.

Recommended sync model, mirroring the web app:

- **Local store** (SwiftData or GRDB), one table per collection.
- **Pull:** on launch and on foreground, call each list endpoint with `updated_since = last server_time`; upsert `data`, delete `deleted_ids`, store the new `server_time`.
- **Push:** apply changes locally first, then send them from an ordered outbox. Creates carry a client-generated UUID in `id`, so a retried request can never duplicate a row. Drop an operation on `400`/`404`; retry on network errors and `5xx`.
- **Do not reimplement rules.** Recurrence, streaks, day completion, goal completion and scoring are computed in Postgres. Read them from `/routines/days`, `/goals`, `/focus/stats` and `/universe/snapshot`. `packages/shared/src/fixtures.ts` holds the parity fixtures the web client is tested against if the app needs to predict a result optimistically.
- **"Today"** follows the owner's `timezone` setting, not the device's.

## 4. Design tokens

`docs/ios/StellarTokens.swift` is generated from `packages/ui-tokens/tokens.json` (`pnpm tokens`), the same source as the web CSS. Add it to the app target as is and do not edit it by hand.

```swift
Text("This orbit is closed.")
  .stellarText(.title1)
  .foregroundStyle(StellarTokens.Colors.textPrimary)

VStack { … }
  .padding(StellarTokens.Space.s16)
  .stellarGlass(cornerRadius: StellarTokens.Radius.card)

Button("Start focus") { … }
  .foregroundStyle(StellarTokens.Colors.accentInk)
  .background(StellarTokens.Colors.accent, in: RoundedRectangle(cornerRadius: StellarTokens.Radius.button, style: .continuous))
```

- The app is dark only: set `.preferredColorScheme(.dark)` at the root.
- Text styles use the system font (SF Pro) with tabular digits, like the web app on Apple devices.
- Use `StellarTokens.Motion.sheetSpring` and `thumbSpring` for transitions, and `pressScale` for pressed states. Honour `accessibilityReduceMotion` by switching to opacity-only transitions.
- `StellarTokens.eras` lists the universe eras and their score thresholds.

## 5. Safe areas and the Dynamic Island

The web app's rule carries over directly: **backgrounds bleed, content respects.**

```swift
ZStack {
  UniverseBackground()          // the sky / 3D scene
    .ignoresSafeArea()          // under the status bar, Dynamic Island and home indicator

  ScrollView {
    content                     // never ignores safe areas
  }
  .safeAreaInset(edge: .bottom, spacing: 0) {
    StellarTabBar()             // floating glass capsule
      .padding(.horizontal, StellarTokens.Space.s16)
      .padding(.bottom, StellarTokens.Space.s8)
  }
}
```

- Never hard-code a status-bar height. Dynamic Island phones report a top inset of about 59 pt, notched phones 47 pt, and home-button phones 20 pt; SwiftUI's safe area already covers all three.
- Put the tab bar in `safeAreaInset(edge: .bottom)` so scroll content automatically ends above it and above the home indicator. On home-button devices the bottom inset is zero, so keep the explicit 8 pt bottom padding.
- Sheets: use `.presentationDetents` with `.presentationBackground(.ultraThinMaterial)` and the `sheet` radius token; bottom content inside a sheet still needs the bottom safe area.
- Landscape: the Dynamic Island moves to a side; do not ignore horizontal safe areas for content. Full-bleed backgrounds still ignore them.
- Keep interactive controls at least 44 × 44 pt, and keep nothing interactive within the top inset.

## 6. Live Activity and Dynamic Island **(later)**

A focus countdown is a natural Live Activity.

- Start an `Activity<FocusAttributes>` when `state.status` becomes `running`; update it when the state changes; end it on `idle`.
- Render the countdown with `Text(timerInterval: start...end, countsDown: true)`, which keeps ticking without the app running, so no per-second updates are needed.
- Compact presentation: the phase glyph leading, remaining time trailing, in the accent gold for focus and violet for breaks. Expanded: phase label, round `n of m`, and Pause / Skip buttons implemented as `LiveActivityIntent`s that call `POST /focus/actions`.
- Changes made on other devices will not reach a suspended app through the Realtime socket. Keeping a Live Activity accurate in that case needs **ActivityKit push notifications** (APNs, token per activity), which means a server component holding an APNs key. The current server only sends Web Push; an APNs sender would be a new, optional piece alongside the existing scheduler that already detects phase ends.

## 7. Blocking apps with Screen Time **(later)**

The extension blocks websites in desktop browsers. On iOS the equivalent is shielding apps and web domains with Apple's Screen Time frameworks while `blocking.active` is true.

- **FamilyControls**: request authorization with `AuthorizationCenter.shared.requestAuthorization(for: .individual)` and let the user choose apps, categories and web domains with `FamilyActivityPicker`. The selection is opaque tokens that stay on the device; it cannot be derived from, or synced to, the server's domain block lists. Treat it as a per-device companion to the block lists.
- **ManagedSettings**: apply `ManagedSettingsStore().shield.applications`, `.applicationCategories` and `.webDomains` when a focus phase starts; clear them when it ends. Web domains from `blocking.patterns` can be shielded directly with `WebDomain(domain:)` in Safari.
- **DeviceActivity**: schedule a `DeviceActivitySchedule` ending at `phase_ends_at` so a `DeviceActivityMonitor` extension lifts the shield on time even if the app is not running, the same idea as the extension's offline alarm. A paused focus phase keeps the shield on.
- **ShieldConfiguration** extension: style the shield like the block page ("This orbit is closed.") using the tokens.

Caveats to plan for:

- The **Family Controls entitlement** (`com.apple.developer.family-controls`) works in development builds immediately, but **distribution (TestFlight and App Store) requires Apple's approval**, requested per bundle identifier, including each extension's. Approval can take weeks.
- Shields are applied from the device. If the timer is started on another device while the phone is locked and the app suspended, nothing shields until the app runs again; a silent APNs push (same server piece as in section 6) would be needed to close that gap.
- The monitor and shield extensions run in tight sandboxes with small memory limits and no network access; share state through an App Group.
- Screen Time authorization can be revoked by the user in Settings at any time. Check `AuthorizationCenter.shared.authorizationStatus` on launch and degrade to "timer only".
