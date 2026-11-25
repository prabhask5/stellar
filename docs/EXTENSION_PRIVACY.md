# Stellar Focus privacy policy

_Last updated: 25 November 2026_

Stellar Focus is a browser extension that shows the focus timer of a Stellar Planner
instance and blocks the websites on that instance's block lists while a focus phase runs.
Stellar Planner is self-hosted: the instance is a server that you, the user, run or have
been given access to. The developer of Stellar Focus does not run it and has no access to it.

## The short version

- The extension sends data to **one place only: the Stellar Planner instance whose address
  you type in**, and the database that instance tells it to use.
- **Nothing is sent to the developer** or to any third party. There are no analytics, no
  advertising, no tracking and no error reporting.
- The extension does not read the content of the pages you visit and does not keep or send
  a record of the sites you visit.

## What the extension handles

| Data                                                                           | Why                                                                           | Where it goes                                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The address of your instance                                                   | To know which server to talk to                                               | Stored in the browser's extension storage                                                            |
| Your PIN                                                                       | To sign in to your instance                                                   | Sent once to your instance over the connection you gave. Never stored                                |
| The session your instance returns (sign-in tokens, an account id, a device id) | To stay signed in and stay in sync                                            | Stored in the browser's extension storage; sent to your instance and its database with each request  |
| A device label, such as "Firefox extension"                                    | So your instance can list the browser under its devices and you can revoke it | Sent to your instance when you connect                                                               |
| Timer state and your block lists                                               | To show the countdown and know which sites to block                           | Received from your instance; the last known state is stored in the browser so blocking works offline |
| The address of a tab you open on a blocked site                                | To show the block page and offer the same address once the focus phase ends   | Kept inside the block page's own address, in your browser. Never sent anywhere                       |

When a focus phase starts, the extension looks at the addresses of your open tabs to move
any that are on a blocked site to the block page. That check happens in the browser; the
addresses are not stored or sent.

## Permissions

- **Storage**: the instance address, the session and the last known timer state.
- **Alarms**: to re-sync periodically and to lift the block at the moment a focus phase ends.
- **Declarative Net Request**: to redirect navigation to blocked sites to the block page. This
  works through rules the browser applies; the extension does not see your requests.
- **Tabs**: to find tabs already open on a blocked site when a focus phase starts.
- **Access to all websites**: any site can be put on a block list, and the instance can be at
  any address, so the extension cannot know either in advance.

## Keeping and deleting

Everything the extension stores is in your browser. **Disconnect** in the popup's settings
erases the session from the browser; removing the extension erases everything. Data held by
your Stellar Planner instance is governed by whoever runs that instance, which is normally you.

## Sharing

The extension does not sell, share or transfer your data to anyone. It has no access to
your data itself: it is a program that runs in your browser and talks to your server.

## Changes

If this policy changes, the new version will be published at the same address with a new date.

## Contact

Questions about this policy: `[CONTACT EMAIL OR ISSUE TRACKER URL]`
