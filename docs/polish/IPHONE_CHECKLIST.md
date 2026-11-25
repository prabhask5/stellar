# iPhone and browser checklist — polish pass 1

About 20 minutes. Everything here is something automation could not prove: it ran in desktop builds of WebKit, Chromium and Firefox, never on a real iPhone, and never with a real finger. Do it on the **installed app** (Safari → Share → Add to Home Screen) on your iPhone, signed in to the branch build, then the last section in Chrome and Firefox on a computer.

Write anything that feels off into `docs/polish/FRICTION_LOG.md`. Each step says what good looks like.

## Before you start (1 min)

- Deploy the `polish/pass-1` build somewhere you can reach from the phone (not production data if you can avoid it).
- Open it once in Safari, add it to the Home Screen, open it from the icon, enter your PIN.
- In the container log you should see `[boot] applied migrations 10, 11, 12 (…)` (or just the ones your instance was missing) once. You should not have had to run any SQL.

## 1. Launch and first frame (2 min)

1. Swipe the app away in the app switcher, then tap the icon.
   **Good:** no white flash at any point; the dark sky and your real lists are there at once, not a spinner or an empty page.
2. Leave the app in the background past midnight once this week, or change the phone's clock forward a day and back.
   **Good:** on return, yesterday's tasks are under Overdue and the date at the top is right, without a reload.

## 2. Touch and feedback (3 min)

4. Tap buttons, chips, tab bar items, rows and cards all over the app, slowly.
   **Good:** each one visibly reacts the instant your finger lands, before you lift it. Rows and cards light up; small controls dip. Nothing lags, nothing flashes grey.
5. Long-press a tab bar item, a task row, a list card, a button label.
   **Good:** no text selection handles, no "Copy / Look Up" bubble, no link preview. Then long-press inside a task's description field: the normal text menu **does** appear.
6. Tap the small things: the sheet close button, the switches in Settings, calendar arrows, the 6-dot handles.
   **Good:** you never have to aim. Near misses still hit.
7. **Haptics:** complete a task, flip a switch in Settings, change a segmented control, press + on a goal, start and pause the timer, full-swipe a task away.
   **Good:** a light system tap for each (a double tap for completions). If you feel nothing at all, note your iOS version: this relies on a Safari 17.4+ behaviour and is the one item most likely to differ on your device.

## 3. Gestures (4 min)

8. In Tasks, swipe a row left a little, then let go.
   **Good:** it follows your finger, opens on Reschedule and Delete, with some resistance past them. Swipe a second row: the first closes. Scroll the list: the open row closes.
9. Swipe a row left all the way across.
   **Good:** Delete takes over the whole tray and the task is deleted on release, with an Undo toast. Tap Undo.
10. Swipe a row right. **Good:** it completes. Then open a row to the left and push it back to the right to close it. **Good:** it closes and does **not** complete.
11. Open a task list (Tasks → Lists → any list), then go back with the Back button, and again with iOS's own swipe from the left edge.
    **Good:** the list opens at once and the app stays usable after going back (this froze in QA round 1). Repeat on Goals → a goal list.
12. Open a task (tap its name). **Good:** the sheet is solid (nothing shows through), arrives in about a fifth of a second, and the cursor sits inside the focused field, not below it. Drag the sheet down from its middle, not the grabber.
    **Good:** it follows and dismisses. Open Routines → Manage routines → Add routine (a tall sheet): scroll inside it, then pull down. **Good:** the content scrolls first; only at its top does the sheet itself start to move, and it rests half way before dismissing on a further pull. Catch it mid-bounce: it stays under your finger, no jump.
13. Hold a list card's 6-dot handle for a moment, then drag. **Good:** it lifts and reorders. Same for tasks inside a list and goals inside a goal list.

## 4. Scrolling and navigation (3 min)

14. Scroll any long page. **Good:** the system's own momentum and bounce, no stutter, and the background universe does not hitch the scroll.
15. On Tasks, scroll down. **Good:** the large "Tasks" title gives way to a small centred title in a glass bar at the top; scrolling back restores the large one.
16. Tasks → All, scroll down, tap Goals, tap Tasks. **Good:** Tasks opens on Today at the top (tabs no longer remember where they were). Scroll down and tap Tasks again: it scrolls to the top.
17. Cold-start the app from the Home Screen on the Universe tab. **Good:** no white flash, and the tab bar sits at the bottom from the first frame (in QA round 1 it floated too high until the first navigation; the second fix, which makes the document taller than the screen while the window is short, could not be verified off-device either). If it still floats, note whether the page can be scrolled a little at that moment.

## 5. Keyboard and forms (2 min)

18. Tap quick add and type. **Good:** the page does not zoom, the field stays visible above the keyboard, the return key says "done"/"go", and pressing it adds the task and keeps the keyboard up for the next one.
19. With the keyboard up, drag the list. **Good:** the keyboard goes away.
20. Open a task, edit the description, and with the keyboard up check the sheet's Done/Delete are reachable. Close the keyboard. **Good:** no gap left at the bottom, nothing hidden.
21. Tap a number on a progress goal to type a value. **Good:** a number pad with a decimal key. Type `1,000` on a goal with a large total: it is a thousand, not one.

## 6. Safe areas, landscape, smoothness (2 min)

22. Look at every tab. **Good:** nothing under the Dynamic Island or the home indicator; the sky runs edge to edge behind both.
23. Rotate to landscape on the lock screen (lock the app from Settings → Security → lock timeout, or sign out). **Good:** the keypad sits beside the title and Unlock is on screen. Rotate on Tasks and open a date picker: it opens as a sheet you can use, not a clipped bubble.
24. On Home, complete five tasks quickly. **Good:** the star effects play and nothing you tap waits for them.
25. Put the app in the background for a few minutes and return. **Good:** the universe comes back (not a blank sky) and the timer on Focus shows the right time.

## 7. Offline and sync (2 min)

26. Turn on Airplane Mode. Add two tasks, complete one of them, rename another task, edit its description too. **Good:** a small "Offline. N changes are saved on this device." pill at the top; everything you did stays on screen.
27. Wait half a minute, turn Airplane Mode off. **Good:** the pill goes; open the app on another device: every change is there, including **both** edits to the same task and the completion of the task you created offline.
28. In Settings → Security, with a change still unsynced (Airplane Mode on), tap Sign out. **Good:** it tells you changes have not synced, or that you are offline, instead of silently discarding them.

## 8. Notifications (1 min)

29. Settings → Notifications → enable. Start a focus phase set to 1 minute, leave the app. **Good:** a notification when it ends; tapping it brings the app forward on Focus without a full reload flash.

## 9. Extension, on a computer (3 min)

30. **Chrome:** Settings → Extension → download, unzip, `chrome://extensions` → Load unpacked. Open the popup. **Good:** it opens instantly with the timer (no "Fetching…" flash once connected). Start focus from the phone: the popup follows within a second and the badge shows minutes.
31. Visit a site on an active block list, including one typed with a trailing dot (`youtube.com.`). **Good:** both go to the block page; the countdown matches the phone to the second.
32. End the focus phase from the phone. **Good:** the block page says "Focus complete" and its button takes you to the page you were going to.
33. Turn the computer's network off during a focus phase, wait a minute, open the popup. **Good:** it says offline and still shows the timer; it does **not** ask for your PIN. The block lifts by itself when the phase would have ended.
34. **Firefox:** install the Firefox package (`about:debugging` → This Firefox → Load Temporary Add-on, or your signed build). On Continue, **note whether Firefox asks for permission to access all sites**, and allow it. Then repeat 30–32. (Automation verified these in Firefox 159 with a temporary add-on; a signed, permanently installed build is what could differ.)
35. Sign out everywhere from the phone (Settings → Security). **Good:** within half a minute the extension shows the PIN screen with a "Disconnect this browser" button, and it is no longer blocking anything.

## Not testable here at all

- **Supavisor in transaction mode.** If your production Postgres connection string goes through the pooler's transaction port, the migration runner's advisory lock is not guaranteed. Use the session-mode port or the direct connection for `DATABASE_URL`; with no connection string the app migrates through pg-meta, which is unaffected.
- **Push delivery on iOS** beyond step 29 (timing, Focus modes, Do Not Disturb).
