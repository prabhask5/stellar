# The browser extension

**Stellar Focus**, the Stellar Planner extension, puts your focus timer in the browser toolbar and blocks the sites on your active block lists while a focus phase is running. It works in Chrome (and Chromium browsers such as Edge, Brave and Arc) and in Firefox, from one codebase in `apps/extension`.

## Install

Your instance serves the extension packages itself, so they always match your server version: open **Settings → Extension** in the app and download the one for your browser.

### Chrome, Edge, Brave, Arc

1. Download `stellar-focus-chrome.zip` and unzip it into a folder you will keep.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder.
4. Pin "Stellar Focus" from the puzzle-piece menu so the timer is visible.

Chrome only installs packed extensions from the Chrome Web Store, so a self-hosted extension stays loaded "unpacked". That is fully functional; Chrome may remind you about developer-mode extensions on startup. To update, replace the folder's contents with the new zip and press the reload arrow on the extension's card.

### Firefox

Release versions of Firefox only install signed extensions. Two options:

- **Try it now (temporary).** Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select `stellar-focus-firefox.zip`. It stays until Firefox restarts.
- **Install permanently (sign it once).** Signing an unlisted add-on is free and automatic, but needs your own Mozilla account, so it cannot be done for you:
  1. Create API credentials at <https://addons.mozilla.org/developers/addon/api/key/>.
  2. If you will share the build with anyone else, first change `browser_specific_settings.gecko.id` in `apps/extension/wxt.config.ts` to an ID of your own (for example `stellar-focus@your-domain.com`); add-on IDs are unique on addons.mozilla.org.
  3. Build and sign:

     ```bash
     pnpm --filter @stellar/extension build
     npx web-ext sign --channel unlisted \
       --source-dir apps/extension/.output/firefox-mv3 \
       --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
     ```

  4. Open the resulting `.xpi` from `web-ext-artifacts/` in Firefox to install it.

  Firefox Developer Edition, Nightly and ESR can instead install the unsigned zip after setting `xpinstall.signatures.required` to `false` in `about:config`.

When you connect, Firefox asks for permission to "access your data for all websites". The extension needs it to redirect blocked sites and to reach your instance; see Permissions below.

## Connect

1. Click the toolbar icon.
2. Enter the address where you open Stellar Planner, for example `planner.example.com`.
3. Enter your PIN.

The extension then appears under **Settings → Security** in the app, in the device list, where you can revoke it. To unlink from the browser side, open the popup's settings (gear icon) and choose **Disconnect**.

## What it does

- **Timer in the toolbar.** The popup shows the current phase and countdown with Start, Pause, Skip and End. It is the same timer as in the app: a change on any device shows up everywhere within a second.
- **Badge.** Minutes remaining in gold during focus, `B` during a break, nothing when idle.
- **Blocking.** While a focus phase is running **or paused**, top-level navigation to any domain on your active block lists (subdomains included) is redirected to a block page with the live countdown. Tabs already open on a blocked site are redirected when the phase starts. Breaks do not block.
- **No bypass.** The block page has no "unblock for five minutes" button. The block lifts when the focus phase ends, by running out or by ending or skipping it from the popup, the app or another device. The page then offers to continue to the address you were heading for.
- **Offline.** The extension remembers the phase's end time. Without a network it keeps blocking until that moment and then stops by itself; a paused phase keeps blocking until the extension can sync again.

Block lists and which of them are active are managed on the app's **Focus** page, and changes apply in the extension immediately.

## Permissions

| Permission              | Why                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`               | Remembers the instance address, the session and the last known timer state                                                                                                |
| `alarms`                | Wakes the background every 30 seconds to re-sync, and exactly when a phase ends to lift the block                                                                         |
| `declarativeNetRequest` | Installs the redirect rules for blocked sites. The extension never reads page content or browsing history                                                                 |
| `tabs`                  | Finds tabs already open on a blocked site when a focus phase starts                                                                                                       |
| Access to all sites     | A redirect rule only applies to sites the extension has access to, and you can put any site on a block list; the same access lets it call your instance and your Supabase |

The extension talks only to your Stellar Planner instance and your Supabase. Nothing goes to the developer or any third party, and there are no analytics. In Firefox's terms it handles one kind of data, authentication information: the PIN you type and the session it earns are sent to your own instance. Firefox 140 or newer is required, because that is the first version with the built-in data consent new add-ons must use.

Publishing to the Chrome Web Store and addons.mozilla.org: every answer the two stores ask for is in [EXTENSION_STORE.md](EXTENSION_STORE.md), and the privacy policy to link is [EXTENSION_PRIVACY.md](EXTENSION_PRIVACY.md).

## Limits

- Blocking applies to the browser profile where the extension is installed. Private or incognito windows are covered only if you allow the extension there (Chrome: extension details → "Allow in Incognito"; Firefox: "Run in Private Windows").
- Anyone who can remove an extension can remove this one. It is a commitment device, not parental control.
- Blocking is by domain. Paths (`example.com/feed` only) are not supported.

## Developing

```bash
pnpm --filter @stellar/extension dev            # Chrome, with reload on change
pnpm --filter @stellar/extension dev:firefox    # Firefox
pnpm --filter @stellar/extension test           # rule builder, blocking decision, badge
pnpm --filter @stellar/extension zip            # build both and copy the zips into apps/web/public/extension
```

`apps/web/e2e/10-extension.spec.ts` loads the built Chrome extension into a real Chromium and exercises connecting, live sync, blocking, pause, offline expiry and disconnect.
