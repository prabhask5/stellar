# Publishing Stellar Focus: every answer the stores ask for

Copy-paste answers for the Chrome Web Store and addons.mozilla.org (AMO) submission forms.
The text in the code blocks is written to be pasted as it is. Field names follow the two
dashboards at the time of writing; if a dashboard has renamed a field, the answer still
applies to its nearest equivalent.

Build the packages with:

```bash
pnpm --filter @stellar/extension zip
```

| File in `apps/extension/.output/`     | Upload to                                 |
| ------------------------------------- | ----------------------------------------- |
| `stellar-focus-<version>-chrome.zip`  | Chrome Web Store                          |
| `stellar-focus-<version>-firefox.zip` | AMO, as the add-on                        |
| `stellar-focus-<version>-sources.zip` | AMO, as the source code (see section 3.4) |

## 0. Things only you can supply

These are the blanks in this document. Fill them before you start; every one is asked for
by at least one store.

| Placeholder                                | What it is                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[PRIVACY POLICY URL]`                     | A public address serving `docs/EXTENSION_PRIVACY.md`. Chrome requires a URL. If the repository is public, the file's GitHub address works. Fill in the contact line at the bottom of that file first.                                                                                                                                                  |
| `[SUPPORT EMAIL]`                          | An address you are willing to show publicly on both listings.                                                                                                                                                                                                                                                                                          |
| `[HOMEPAGE URL]`                           | Where people learn what Stellar Planner is and how to host it (the repository, or a site of yours).                                                                                                                                                                                                                                                    |
| `[REVIEW INSTANCE URL]` and `[REVIEW PIN]` | **A Stellar Planner instance the reviewers can reach, and its PIN.** The extension does nothing without an instance, and a reviewer who cannot get past the connect screen will reject it. Use a separate, throwaway deployment with sample data. Do not give out your own instance or your own PIN. Demo mode (`/demo`) is not enough: it has no API. |
| Licence                                    | AMO makes you choose one, and the repository has no `LICENSE` file. See section 3.5.                                                                                                                                                                                                                                                                   |
| Screenshots                                | Both stores need at least one. See section 1.3.                                                                                                                                                                                                                                                                                                        |

Prepare the review instance like this, so the test steps below work as written:

1. Deploy a second instance and finish setup with a PIN used for nothing else.
2. On its Focus page, create a block list called "Review" containing `example.com`, and switch it on.
3. Leave the timer idle.

One decision to make before the first Firefox upload: the add-on ID in
`apps/extension/wxt.config.ts` is `stellar-focus@stellar.local`. It is permanent once the
add-on is listed. If you would rather it carried a domain you own, change it now.

## 1. Text and images used by both stores

### 1.1 Name and one-line summary

```text
Stellar Focus
```

Summary (124 characters; Chrome's limit is 132, AMO's is 250). Chrome reads it from the
manifest, so it is already in the package:

```text
A focus timer in your toolbar that blocks distracting sites while you focus. The companion to a self-hosted Stellar Planner.
```

### 1.2 Description

```text
Stellar Focus puts your Stellar Planner focus timer in the browser toolbar and keeps distracting websites closed while you focus.

IMPORTANT: this is a companion to Stellar Planner, a self-hosted planner. You need your own Stellar Planner instance (its address and your PIN) to use it. Without one, the extension does nothing.

WHAT IT DOES
• Timer in the toolbar. See the current phase and countdown, and start, pause, skip or end it. It is the same timer as in the app: a change on any device appears everywhere within a second.
• Minutes on the badge. Minutes left during focus, "B" during a break, nothing when idle.
• Blocks the sites you chose. While a focus phase is running or paused, visiting a site on one of your active block lists opens a calm block page with the live countdown instead. Subdomains are included, and tabs already open on a blocked site are moved when the phase starts.
• No bypass button. The block lifts when the focus phase ends, by running out or by ending it from the popup, the app or another device. The block page then offers to continue to where you were going.
• Works offline. The extension remembers when the phase ends and lifts the block at that moment, with or without a connection.
• Breaks are yours. Nothing is blocked during breaks or when the timer is idle.

HOW TO SET IT UP
1. Click the toolbar icon.
2. Enter the address where you open Stellar Planner.
3. Enter your PIN.
Block lists, and which of them are switched on, are managed on the Focus page of the app.

PRIVACY
• The extension talks only to the Stellar Planner instance you connect it to. Nothing is sent to the developer or to any third party.
• No analytics, no ads, no tracking.
• It does not read the content of pages and does not keep or send a record of the sites you visit. Blocking is done by redirect rules the browser applies.

WHY IT ASKS FOR ACCESS TO ALL WEBSITES
You decide which sites go on your block lists, and your instance can be at any address, so the extension cannot know either in advance. The access is used only to redirect blocked sites to the block page and to reach your instance.

GOOD TO KNOW
• Blocking is by domain, not by path.
• It covers the browser profile it is installed in. Allow it in private windows if you want those covered.
• Anyone who can remove an extension can remove this one. It is a commitment device, not parental control.
```

### 1.3 Screenshots

Chrome wants 1280×800 or 640×400 (1 to 5 images). AMO accepts any size; the same images
work. Take them from the review instance so no real data is in them:

1. The popup with a focus phase running and the minutes on the toolbar badge.
2. The block page ("This orbit is closed") with the countdown.
3. The popup's connect screen (address, then PIN).
4. The app's Focus page showing the block lists and their switches, to show where the lists come from.

Chrome also asks for a 128×128 store icon: use `apps/extension/public/icon/128.png`. A
440×280 small promo tile is optional but improves how the listing looks in search.

## 2. Chrome Web Store

### 2.1 Store listing tab

| Field          | Answer                                                                       |
| -------------- | ---------------------------------------------------------------------------- |
| Title          | Taken from the package: Stellar Focus                                        |
| Summary        | Taken from the package (section 1.1)                                         |
| Description    | Section 1.2                                                                  |
| Category       | Productivity → Workflow & Planning (if only "Productivity" is offered, that) |
| Language       | English                                                                      |
| Store icon     | `apps/extension/public/icon/128.png`                                         |
| Screenshots    | Section 1.3                                                                  |
| Homepage URL   | `[HOMEPAGE URL]`                                                             |
| Support URL    | `[HOMEPAGE URL]` or your issue tracker                                       |
| Mature content | No                                                                           |

### 2.2 Privacy practices tab

**Single purpose**

```text
Stellar Focus has one purpose: to help the user stay focused during a timed focus session. It shows the focus timer of the user's own self-hosted Stellar Planner instance in the toolbar, and while a focus phase is running it redirects the websites on the user's own block lists to a block page. The timer and the blocking are the same feature: blocking starts and ends with the focus phase.
```

**Permission justifications**

`storage`

```text
Stores the address of the user's Stellar Planner instance, the sign-in session returned by that instance, and the last known timer state (phase and end time). The stored timer state lets the extension keep blocking, and stop blocking at the right moment, when the service worker restarts or the device is offline.
```

`alarms`

```text
Two uses. A repeating alarm wakes the service worker to re-sync the timer with the user's instance, because a Manifest V3 service worker does not stay alive. A one-off alarm fires at the exact end of the focus phase to remove the blocking rules, so a site is never blocked after the phase has ended.
```

`declarativeNetRequest`

```text
This is how sites are blocked. While a focus phase is active, the extension installs dynamic redirect rules for the domains on the user's active block lists, sending top-level navigation to the extension's own block page. The rules are removed when the phase ends. The declarative API was chosen so that the extension never observes or reads the user's network requests.
```

`tabs`

```text
When a focus phase starts, tabs that are already open on a blocked site would not be caught by the redirect rules, which only apply to new navigation. The extension queries open tabs for their URLs and moves the ones on blocked domains to the block page. The URLs are compared in memory and are not stored or sent anywhere.
```

Host permission (`<all_urls>`)

```text
Two reasons, neither of which can be narrowed in advance. First, the user chooses which websites go on their block lists, and Chrome applies a declarativeNetRequest redirect rule only to sites the extension has host access to, so blocking an arbitrary user-chosen site requires access to all sites. Second, Stellar Planner is self-hosted: the user's instance and its database are at addresses the user types in when connecting, on any domain, and the extension must be able to send requests to them. The extension does not inject scripts into pages and does not read page content.
```

**Remote code**

Select **No, I am not using remote code.** All JavaScript is in the package. The extension
fetches data (JSON) from the user's instance, never code.

**Data usage**

Tick **Authentication information** and nothing else.

| Data type                           | Tick? | Reason                                                                                                                                             |
| ----------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | No    | No name, address, email or similar is handled                                                                                                      |
| Health information                  | No    |                                                                                                                                                    |
| Financial and payment information   | No    |                                                                                                                                                    |
| Authentication information          | Yes   | The PIN is sent to the user's own instance, and the session tokens it returns are stored in extension storage and sent back with each request      |
| Personal communications             | No    |                                                                                                                                                    |
| Location                            | No    |                                                                                                                                                    |
| Web history                         | No    | The extension keeps no list of visited pages. Open tab URLs are compared against the block list in memory when a focus phase starts, and discarded |
| User activity                       | No    | No clicks, keystrokes or network monitoring                                                                                                        |
| Website content                     | No    | Page content is never read                                                                                                                         |

If a reviewer disagrees about Web history because of the `tabs` permission, tick it and
point to the `tabs` justification above; the privacy policy already describes that check.

Tick all three certifications. Each is true:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**

```text
[PRIVACY POLICY URL]
```

### 2.3 Distribution tab

| Field        | Answer                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| Payments     | Free of charge                                                         |
| Visibility   | Public (or Unlisted, if you only want people with the link to find it) |
| Distribution | All regions                                                            |

### 2.4 Test instructions tab

Username: leave empty. Password: `[REVIEW PIN]`. Additional instructions:

```text
Stellar Focus is a companion to Stellar Planner, a self-hosted app, so it needs an instance to connect to. A review instance with sample data is provided:

Address: [REVIEW INSTANCE URL]
PIN: [REVIEW PIN]

To test:
1. Click the Stellar Focus toolbar icon. Enter the address above and press Continue, then enter the PIN.
2. The popup shows the focus timer. Press Start.
3. Open https://example.com in a new tab. It is on the review instance's active block list, so it is redirected to the extension's block page, which shows the live countdown.
4. Open any other site, for example https://www.wikipedia.org. It loads normally.
5. In the popup, press End (or Skip). The block page changes to "Focus complete" and offers to continue to example.com, which now loads.
6. Popup → gear icon → Disconnect removes the session from the browser.

The block lists are managed in the web app at the address above (same PIN), on the Focus page.
```

### 2.5 What to expect

Because of the access to all websites, Chrome puts the item through its longer review. That
is normal for a site blocker and is what the host permission justification is for.

## 3. Firefox Add-ons (addons.mozilla.org)

### 3.1 Upload

| Question                       | Answer                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| How to distribute this version | On this site (listed)                                                               |
| File                           | `stellar-focus-<version>-firefox.zip`                                               |
| Compatible with                | Firefox (desktop). Leave Firefox for Android unticked: it has not been tested there |

The validator may note that the minimum version is 140. That is deliberate: 140 is the first
Firefox with the built-in data consent that new add-ons must use.

### 3.2 Data collection

There is no form for this: Firefox reads it from the package and shows it to the user at
install. The package declares one required data type, **authentication information**,
because the PIN and the session are sent to the user's instance. If a reviewer asks:

```text
The add-on declares "authenticationInfo" because the PIN the user types, and the session tokens returned for it, are transmitted to the Stellar Planner instance the user has chosen to connect to. That instance is the user's own self-hosted server. Nothing is transmitted to the developer or to any third party, and no other category of data leaves the browser: the add-on does not transmit browsing activity, website content or technical data.
```

### 3.3 Describe the add-on

| Field                                                                               | Answer                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                                                                                | Stellar Focus                                                                                                                                                                                                                    |
| Add-on URL                                                                          | `stellar-focus`                                                                                                                                                                                                                  |
| Summary                                                                             | Section 1.1                                                                                                                                                                                                                      |
| Description                                                                         | Section 1.2                                                                                                                                                                                                                      |
| This add-on is experimental                                                         | No                                                                                                                                                                                                                               |
| This add-on requires payment, non-free services or software, or additional hardware | No. Stellar Planner is free software the user hosts themselves. If a reviewer reads "requires additional software" as covering a self-hosted server, ticking it does no harm; the description already says an instance is needed |
| Categories                                                                          | AMO has no productivity category. Choose **Other**; add **Alerts & Updates** if you want a second                                                                                                                                |
| Support email                                                                       | `[SUPPORT EMAIL]`                                                                                                                                                                                                                |
| Support website                                                                     | `[HOMEPAGE URL]`                                                                                                                                                                                                                 |
| Licence                                                                             | Section 3.5                                                                                                                                                                                                                      |
| This add-on has a privacy policy                                                    | Yes. Paste the text of `docs/EXTENSION_PRIVACY.md`                                                                                                                                                                               |

### 3.4 Source code

"Do you need to submit source code?" **Yes.** The package is bundled and minified by a
build tool, so Mozilla requires the sources.

Upload `stellar-focus-<version>-sources.zip`. It contains the extension, the three
workspace packages it imports, the lockfile and `SOURCE_CODE_REVIEW.md`, which holds the
build instructions. Building from that archive was checked to give a package identical,
file for file, to the one you upload. Upload the sources archive from the **same** `zip`
run as the package; a later run with any change would no longer match.

### 3.5 Licence

AMO requires a choice, and the repository has no licence file, so this is yours to decide:

- **All Rights Reserved**: keeps things as they are now. Allowed on AMO.
- **An open-source licence** (MIT, Mozilla Public License 2.0, GPL): pick this only if you
  also intend to license the repository that way, and add the matching `LICENSE` file.

### 3.6 Notes to reviewer

```text
Stellar Focus is a companion to Stellar Planner, a self-hosted app, so it needs an instance to connect to. A review instance with sample data is provided:

Address: [REVIEW INSTANCE URL]
PIN: [REVIEW PIN]

To test:
1. Click the Stellar Focus toolbar icon. Firefox treats Manifest V3 host permissions as optional, so the add-on asks for access to all websites when you connect; allow it.
2. Enter the address above and press Continue, then enter the PIN.
3. The popup shows the focus timer. Press Start.
4. Open https://example.com in a new tab. It is on the review instance's active block list, so it is redirected to the add-on's block page, which shows the live countdown.
5. Open any other site. It loads normally.
6. In the popup, press End. The block page changes to "Focus complete" and offers to continue to example.com.
7. Popup → gear icon → Disconnect removes the session from the browser.

Permissions:
- storage: instance address, session, last known timer state.
- alarms: periodic re-sync, and lifting the block exactly when a focus phase ends.
- declarativeNetRequest: redirect rules for the domains on the user's active block lists, only while a focus phase is active.
- tabs: to move tabs already open on a blocked site when a focus phase starts.
- <all_urls>: the user chooses which sites to block and where their instance is hosted, so neither can be listed in advance. No content scripts are injected and page content is not read.

Network: the add-on makes requests only to the instance address the user enters and to the database address that instance reports (a Supabase project belonging to the same user). There is no remote code, no analytics and no third-party service.

Source code: the attached sources archive is a pnpm workspace. Build instructions are in SOURCE_CODE_REVIEW.md at its root. Three commands produce apps/extension/.output/firefox-mv3, identical to the submitted package. Built with Node 24 and pnpm 12.21.0 (pinned in package.json, installed by Corepack). The bundled third-party library is @supabase/supabase-js.
```

## 4. After approval

- Add the two store links to `docs/EXTENSION.md` and to Settings → Extension in the app
  (`apps/web/components/settings/extension.tsx`), which still describes manual installation.
- Every update: raise `version` in `apps/extension/package.json`, run the `zip` command, and
  upload the new package to both stores. AMO needs the matching sources archive each time.
  The permission and data answers above only need revisiting if the manifest changes.
