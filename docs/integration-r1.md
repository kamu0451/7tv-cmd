# Integration, round 1 (2026-10-21)

## Edits made

No src file needed glue: the three parts compiled together, no "STUB from scaffold" marker was
left in src, and the end-to-end path worked on the first Chromium run. Edits outside src:

| File | Change | Reason |
| --- | --- | --- |
| tools/dev/int-e2e.mjs (new) | Chromium e2e driver: "!", "b", ArrowDown, Tab, Escape, "abc!", 7TV ":ee" | step 2 of the integration task; reusable by the test harness |
| tools/dev/int-firefox.mjs (new) | Firefox driver over tools/ff/marionette.mjs; seeds prefs.js (console to stdout, fixed moz-extension UUID) | step 3; the chrome context needs -remote-allow-system-access |
| tools/ff/marionette.mjs | launchFirefox accepts `extraArgs` (default []) | to pass -remote-allow-system-access; default behaviour unchanged |
| tools/dev/assemble-providers.mjs (new) | builds PROVIDERS.md, refuses non-ASCII sources | step 5, repeatable |
| PROVIDERS.md, README.md | assembled / filled | step 5 |
| docs/part3-notes.md | appended "Firefox permission check (integration)" | SPEC 9 |

tools/pw/record.mjs was NOT changed: it already walks open shadow roots (round 1 S3) and found
our rows in both themes.

Request budget: Chromium runs share the profile .pw-profiles/rec-ext, seeded from part 2's
.pw-profiles/p2-check, so coconutb came from the cache part 2 filled at 15:36 (fetch event
fromCache true) and the recorder fetched nothing. The second channels (nickmercs in Chromium,
lirik in Firefox) were loaded after 16:38, more than an hour after part 2's live fetches of them.
Login "twitch" got one Chromium cycle at about 15:48 (not fetched in the hour before, so within
the rule). One cycle exceeded the rule: coconutb in Firefox at about 15:52 (the task's ordered
Firefox check, about 16 minutes after part 2's cycle in another profile; a fresh Firefox profile
has no cache to seed).

## What works (seen)

- typecheck, build, lint (web-ext: 0 errors, 0 notices, 0 warnings), zip: all exit 0.
- Chromium popout coconutb: fetch 227 (cache), "!" -> 100 rows (filterCommands limit 100), row 0
  selected; "b" -> 20 rows; ArrowDown -> row 1 (!brb); Tab -> input "!brb ", popup closed; Escape
  -> closed, "!" kept, focus kept; "abc!" -> no popup. docs/critics/r1/int-chromium-coconutb-*.png.
- Chromium + 7TV (vendor/7tv-patched, local mode): same path -> "!brb "; afterwards 7TV's ":ee"
  tray opens, ArrowDown moves its selection, ours stays closed. docs/critics/r1/int-7tv-coconutb-*.png.
- Firefox: see docs/part3-notes.md "Firefox permission check (integration)": temporary install,
  fetch 227, "!" 100 rows, "!b" 20, Tab -> "!brb "; moo.bot ok (empty), nightbot ok under
  moz-extension://. The coconutb evidence is docs/critics/r2/ff-coconutb-*.png (round 2 re-run).
  docs/critics/r1/int-firefox-lirik-01-bang.png to -04-tab.png (renamed from int-firefox-01..04)
  show lirik with the Chat Rules dialog, not coconutb; int-firefox-05-action.png is lirik's
  action page.
- Recordings: docs/recordings/ours-bang-dark and ours-bang-light (Tab "!brb ", Enter "!ban ",
  Escape keeps "!b", Shift+Tab inserts, Space closes and types, Down x30 wraps over 20 rows).

## What does not work / not verified

- Second channel popup: nickmercs (Nightbot 102) and twitch (Nightbot 4) both show a logged-out
  "Chat Rules" dialog on first focus (twitch is also emote-only); its button stays disabled until
  the rules are scrolled and the editor was gone afterwards, so no popup was seen there. The
  nickmercs fetch cycle ran (cache written at 16:39). Same cause in Firefox on lirik. Not a bug of
  ours, but the e2e driver needs a reliable rules-dialog path (deferred to the test harness).
- "!" alone showed at most 100 of a channel's commands (SPEC 8 limit default 100); coconutb has 227.
  Round 2 raised the limit to 1000 (docs/LEDGER.md P4-1): the list now shows all 227 rows. The
  100-row figures in this file and in docs/critics/r1/logs/ are the round 1 numbers.
- Recorder probe "Click outside" clicks (640,200), which lands on our full-height popup and picks
  a row ("!ban "): a probe artifact, not a click-outside failure; click-outside itself is untested.
- Not run: a 5 minute session, SPA channel change, row hover, below-input fallback, the Slate
  draft read in Firefox, the hosted 7TV build, logged-in sessions.

## Console errors

From this extension: 0 in every Chromium run (page and service worker, error-level console and
page errors filtered to chrome-extension:// or "7tv-cmd"). The one error captured in the 7TV run is
7TV's own ("[7TV] [ERROR] <Site> Failed to fetch host manifest", local mode blocks 7TV's host).
Firefox: zero moz-extension:// error lines on stdout (content console only; the background
console was not captured in round 1; round 2 captured both with a heartbeat, see
docs/critics/r2/logs/ff-coconutb.log).

## Text evidence (copied from the gitignored .pw-profiles/*.log in round 2, repo path replaced by <repo>)

All in docs/critics/r1/logs/: int-ff.log (Firefox coconutb events and rows, round 1: 100 rows;
its `error` field is the action-page navigation Marionette refused), int-e2e-1.log (Chromium,
consoleErrors []), int-e2e-2.log (Chromium + 7TV, the one 7TV-own error above), int-e2e-3.log to
int-e2e-5.log (runs that timed out waiting for the chat input; failures, kept as the record),
int-lint.log (0 errors, 0 notices, 0 warnings), build.log, ff-live.log (test/browser/firefox-live.mjs),
soak-plain.log and soak-7tv.log (one minute soaks, extensionErrors 0), tb-all.log (the earlier full
`npm run test:browser` run, 66 passed; ANSI colour codes removed and the check mark and guillemet
written as "ok" and ">").

## Channels and counts

| Channel | Browser | Fetch count | Provider doc counts | Popup rows ("!" / "!b") |
| --- | --- | --- | --- | --- |
| coconutb | Chromium | 227 | Nightbot 75 + StreamElements 160, 8 shared names | 100 / 20 |
| coconutb | Chromium + 7TV | 227 | same | 100 / 20 |
| coconutb | Firefox | 227 | same | 100 / 20 |
| lirik | Firefox (action page) | 60 | Nightbot 1 (doc 1) + Fossabot 59 (no doc count) | not seen (rules dialog) |
| nickmercs | Chromium | cached, count not captured | Nightbot 102 | not seen (rules dialog) |

## Firefox result

installed: temporary add-on runs content script and background without a grant; popup, filter,
ArrowDown and Tab insertion work on coconutb; moo.bot and api.nightbot.tv answer the extension.
