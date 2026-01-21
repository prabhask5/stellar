# Stellar Focus - Browser Extension

Block distracting websites during Stellar focus sessions. Supports both **Firefox** and **Chrome**.

## Quick Setup

### 1. Create your local config file

```bash
cd stellar-focus
cp src/config.local.example.ts src/config.local.ts
```

Then edit `src/config.local.ts` with your actual values:

```typescript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-actual-anon-key';
export const APP_URL = 'https://your-app-url.com';
```

### 2. Install and build

```bash
npm install
npm run build          # Build for both browsers
npm run build:firefox  # Build Firefox only
npm run build:chrome   # Build Chrome only
```

### 3. Test locally

**Firefox:**
1. Open Firefox and go to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `dist-firefox/manifest.json`

**Chrome:**
1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist-chrome` folder

### 4. Package for distribution

```bash
# Firefox (.xpi)
cd dist-firefox && zip -r ../stellar-focus-firefox.zip . && cd ..

# Chrome (.zip for Chrome Web Store)
cd dist-chrome && zip -r ../stellar-focus-chrome.zip . && cd ..
```

---

## Features

- **Website Blocking**: Automatically blocks configured websites during focus sessions
- **Block Lists**: Create and manage multiple block lists from the Stellar app
- **Offline Support**: Login works offline with cached credentials
- **Same Account**: Uses your existing Stellar account credentials
- **Cinematic Block Page**: Beautiful, encouraging block page when you try to access blocked sites

## Important: Blocking Only Works Online

**Website blocking only works when online.** When offline:
- You can still log in with cached credentials
- Block list management works offline (synced when back online)
- **Websites are NOT blocked** - blocking requires internet to verify focus session status

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
├── src/                       # Shared source code
│   ├── config.ts              # Config loader
│   ├── config.local.ts        # YOUR SECRETS - gitignored!
│   ├── config.local.example.ts # Template for config.local.ts
│   ├── popup/                 # Extension popup UI
│   ├── background/            # Service worker for blocking
│   ├── pages/                 # Block page shown when sites are blocked
│   ├── auth/                  # Authentication
│   └── lib/                   # Utilities (storage, network, sync)
├── dist-firefox/              # Firefox build output (gitignored)
└── dist-chrome/               # Chrome build output (gitignored)
```

## How It Works

1. **Authentication**: Sign in with your Stellar account credentials
2. **Polling**: Extension polls Supabase every 30 seconds for active focus sessions
3. **Blocking**: During focus phase, blocked sites redirect to the block page
4. **Sync**: Block lists sync from Supabase and cache locally

## Permissions Required

- `storage`: Store authentication and block list cache
- `webNavigation`: Intercept navigation to block websites
- `alarms`: Schedule periodic focus session polling
- `<all_urls>`: Required to block any website

## Development

```bash
npm run build          # Build for all browsers
npm run build:firefox  # Build Firefox only
npm run build:chrome   # Build Chrome only
npm run clean          # Clean all build outputs
npm run typecheck      # Type-check TypeScript
```

## Troubleshooting

**"Offline - blocking disabled"**: Expected when offline. Blocking needs internet.

**Websites not being blocked**:
1. Ensure you have an active focus session in Stellar
2. Check website is in an enabled block list
3. Verify you're online
4. Click refresh button in popup

**Can't log in offline**: You must log in online at least once first to cache credentials.
