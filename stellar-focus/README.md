# Stellar Focus - Firefox Extension

Block distracting websites during Stellar focus sessions.

## Quick Setup

### 1. Create your local config file

```bash
cd stellar-focus
cp src/config.local.example.ts src/config.local.ts
```

Then edit `src/config.local.ts` with your actual values:

```typescript
export const SUPABASE_URL = 'https://dqllviacdoartbmhkqrk.supabase.co';
export const SUPABASE_ANON_KEY = 'your-actual-anon-key';
export const APP_URL = 'https://stellarplanner.vercel.app';
```

### 2. Install and build

```bash
npm install
npm run build
```

### 3. Test locally in Firefox

1. Open Firefox and go to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from `stellar-focus/`

### 4. Deploy to Firefox Add-ons

```bash
# Create ZIP for submission
zip -r stellar-focus.zip manifest.json icons/ dist/ -x "*.DS_Store"
```

Then:
1. Go to [addons.mozilla.org](https://addons.mozilla.org)
2. Sign in / create account
3. Click "Submit a New Add-on"
4. Upload `stellar-focus.zip`
5. Fill in listing details
6. Submit for review (1-3 days)

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
├── manifest.json              # Extension manifest (Manifest V3)
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── build.js                   # Build script for HTML/CSS copying
├── .gitignore                 # Ignores config.local.ts, dist/, node_modules/
├── icons/                     # Extension icons
├── src/
│   ├── config.ts              # Config loader (imports from config.local.ts)
│   ├── config.local.ts        # YOUR SECRETS - gitignored!
│   ├── config.local.example.ts # Template for config.local.ts
│   ├── popup/                 # Extension popup UI
│   ├── background/            # Service worker for blocking
│   ├── pages/                 # Block page shown when sites are blocked
│   ├── auth/                  # Authentication (same pattern as main app)
│   └── lib/                   # Utilities (storage, network, sync)
└── dist/                      # Built extension files (gitignored)
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
npm run build    # Compile TypeScript and copy assets
npm run watch    # Watch for TypeScript changes
npm run clean    # Clean dist folder
```

## Troubleshooting

**"Offline - blocking disabled"**: Expected when offline. Blocking needs internet.

**Websites not being blocked**:
1. Ensure you have an active focus session in Stellar
2. Check website is in an enabled block list
3. Verify you're online
4. Click refresh button in popup

**Can't log in offline**: You must log in online at least once first to cache credentials.
