# Part 3 notes: chat input integration (round 1, 2026-10-21)

Environment for every result below: Playwright 1.62.1 Chromium (headless, 1280x800), logged out,
channel coconutb, cookie banner rejected. 7TV = vendor/7tv-patched v3.1.6 in local mode
(tools/pw/seventv.mjs). Firefox was NOT run by part 3 (see "Not verified").

## Selectors relied on (observed 2026-10-21)

| what | selector | where |
|---|---|---|
| Slate editor (both kinds) | `div[data-a-target="chat-input"][data-slate-editor="true"][contenteditable="true"]` | input/native.ts SLATE_EDITOR_SELECTOR |
| 7TV wrapper (kind detection) | `seventv-container.seventv-chat-input-container` (closest ancestor of the editor) | input/seventv.ts |
| anchor, native AND 7TV | `div.chat-wysiwyg-input-box` (x8 y711 w1264 h41 in the popout; channel page x1289 w324) | input/native.ts NATIVE_ANCHOR_SELECTORS |
| anchor fallback | `.chat-input__textarea` (native, same rect), the 7TV container (7TV) | |
| Twitch / 7TV tray (we never open while visible) | `div.autocomplete-match-list` | controller.ts NATIVE_TRAY_SELECTOR |
| our popup host | `#tvcmd-popup-host` (blur / mousedown-outside tests) | controller.ts |
| skipped text | `[data-slate-placeholder]`, `[contenteditable="false"]` subtrees; U+FEFF removed | input/native.ts |

Anchor choice (SPEC 7.2 asked for the element at x13 w1254): no ancestor of the editor has that
rect. Measured: editor x18 w1189; chat-wysiwyg-input-box x8 w1264; 7TV's
seventv-chat-input-textarea x8 w1264; seventv-chat-input-container x0 w1280 (full popout width).
The input box (x8 w1264) is the closest, so it is the anchor in both kinds; the SPEC's choice of
the 7TV container would make the popup 1280 px wide. Screenshots show the popup flush with the
input box: docs/critics/r1/p3-prod-7tv-popout-a-filter.png, p3-test-native-channel-a-filter.png.

## Insertion method per input (SPEC 6.4 order reversed, measured)

Both kinds share the Slate adapter (7TV re-parents the same editor). replaceRange selects the
token with Selection.setBaseAndExtent, waits one frame, then dispatches a synthetic
`InputEvent('beforeinput', { inputType: 'insertText', data: '!name ', targetRanges: [StaticRange
over the token], cancelable, bubbles, composed })`. slate-react selects the target range, applies
Editor.insertText and cancels the event. Only when no listener cancels it does
`document.execCommand('insertText')` run (an editor that is not Slate). If Slate cancelled it but
the text is still unchanged 120 ms later, one more beforeinput without targetRanges is sent after
re-selecting and waiting past Slate's 100 ms selectionchange throttle.

Why the order differs from SPEC 6.4: the first live run used execCommand first, as specified.
Result in native popout: DOM "!discord ", Slate draft "!dis" (desync); typing afterwards
corrupted the editor (DOM "/" with Slate ""), and Twitch's "/" and "@" trays stopped opening.
The DOM-only check the SPEC prescribes as the fallback trigger cannot see this, since the DOM
already equals the expected text. Request for the ledger: amend SPEC 6.4 to this order.

## How the Slate draft was read (test only, page world)

`page.evaluate`: take the visible editor element, find its `__reactFiber$*` key, walk `.return`
until `memoizedProps.editor` has an array `children` (found at depth 9 in both kinds), then
concatenate the leaf `text` fields per top-level block (blocks joined by "\n", U+FEFF removed).
The DOM side uses the content script's own cleaning (text nodes minus placeholder /
contenteditable=false subtrees, U+FEFF removed). Survive-a-re-render check: type "x", Backspace,
read both again. Script: .pw-profiles/p3/verify.mjs (gitignored; method copied here so the test
harness can port it), results .pw-profiles/p3/result-*.json.

## Test-only pick path

`document.dispatchEvent(new CustomEvent('tvcmd:test-pick', { detail: JSON.stringify({ name:
'discord' }) }))` makes the controller insert "!discord " at the active "!" token. content/index.ts
handles it ONLY while `document.documentElement.dataset.tvcmdTest === '1'`, which the test sets;
the extension never sets it. A plain string detail ("discord" or "\"discord\"") also works.

## Results (5 configurations, all pass; run 2026-10-21)

Configurations: test-native-popout, test-native-channel (https://www.twitch.tv/coconutb),
test-7tv-popout use dist/chrome with content.js rebuilt against .pw-profiles/p3/fake-messages.ts
(6 fixed commands, no network; the real popup and matcher of parts 2/4 as found in src at that
time). prod-7tv-popout and prod-native-popout use dist/chrome as built (real background; both
share profile .pw-profiles/p3-prod so the cache allowed one provider fetch cycle; "!" listed
100 rows for coconutb, which is the matcher's default limit, so the total is at least 100).

- (a) tvcmd events, every config: "!" -> open query "" ; "!b" -> update "b" ; "!b " -> close ;
  Backspace -> open "b". Counts 6/2 (fake) and 100/20 (prod).
- (b) test-pick "!dis" -> DOM "!discord " = Slate "!discord ", unchanged after x + Backspace, in
  all 5 configs (native popout, native channel page, 7TV, prod native, prod 7TV).
- Keyboard picks with our popup open: Tab on "!dis" -> "!discord ", Enter on "!soc" ->
  "!socials " (not sent), Shift+Tab on "!up" -> "!uptime " (fake data) / "!up " (prod: an exact
  command named "up" ranks first; insert event query "up"), DOM = Slate every time, with and
  without 7TV; no 7TV carousel word appeared.
- (d) with our popup closed, 7TV: ":ee" opens 7TV's tray (first row "Agreed"), ArrowDown changes
  the tray's selected row (tray markup differs before/after) and the text stays ":ee"; zero
  tvcmd events. "/" opens Twitch's tray (first "/block" native, "7TV" with 7TV); "@" opens the
  chatter tray (first "CoconutB"); zero tvcmd events in each. Screenshots p3-*-d-*.png.
- (e) zero console.error / pageerror lines from the extension in all 5 runs (heartbeat: our two
  "[7tv-cmd]" debug lines were captured in each run, so the console filter was live). Zero warns.
- Screenshots: docs/critics/r1/p3-<config>-{a-filter,b-pick,d-slash,d-at,d-colon,d-colon-down}.png.

Second measured fix: with 7TV loaded in headless Chromium, requestAnimationFrame callbacks of the
content script stalled until the next key event (open/update events arrived one keystroke late,
Tab/Enter insertions waiting on a frame never ran). Every frame wait now goes through
afterFrame() (rAF or a 50 ms timer, 100 ms for the watcher, whichever first). Whether this also
happens in a headed browser was not checked.

## Not verified

- Firefox (Marionette driver): insertion through synthetic beforeinput with targetRanges, and
  the Slate draft read, were NOT run in Firefox. Integration must replay the method there.
- Hosted 7TV build and logged-in sessions (out of scope per docs/LEDGER.md).
- Latency numbers (t - keyT) were emitted (2-3 ms rAF lag in native) but not measured against
  the 100 ms budget with a cold cache.
- Mouse: row click, mousedown outside closing the popup, and blur closing it were not exercised.
- Escape with our popup open and the "no reopen until the text changes" rule: not exercised.
- SPA navigation between channels (channel change -> close + new prefetch) was not exercised
  live; only the initial channel detection per page load.
- Popup z-index over the chat column: visible in the popout and on the channel page in the
  screenshots; the computed z-index itself was not read (host created lazily after the dump).
- A 5 minute session for SPEC 1.9; each run here lasted about 30 s.

## Firefox permission check (integration)

Run 2026-10-21 by the round 1 integration agent with tools/dev/int-firefox.mjs (system Firefox,
Marionette, headless, profile .pw-profiles/firefox-int, dist/firefox installed as a temporary
add-on, nothing granted by hand). Logs: .pw-profiles/int-ff.log (coconutb), .pw-profiles/int-ff2.log (lirik).

1. Content script and background ran without any user grant: on the coconutb popout chat a
   'tvcmd' event `fetch` arrived with count 227, fromCache false, followed by open (100 rows),
   update 'b' (20 rows), close, insert 'b'; the input read back "!", "!b", then "!brb " after
   ArrowDown + Tab. Evidence for these coconutb steps: docs/critics/r2/ff-coconutb-01-bang.png to
   -04-tab.png (round 2 re-run, log docs/critics/r2/logs/ff-coconutb.log). The round 1 PNGs were
   overwritten by the later lirik run and show lirik with the Chat Rules dialog and an empty
   input; they are kept as docs/critics/r1/int-firefox-lirik-01-bang.png to -04-tab.png. So the
   beforeinput/targetRanges insertion path also works in Firefox (DOM text only; the Slate draft
   read through the React fiber was NOT replayed in Firefox).
2. moo.bot request succeeds: the extension's own action page (moz-extension://.../action/index.html?login=lirik,
   loaded from the chrome context because WebDriver:Navigate refuses moz-extension URLs) showed
   "moobot no commands 0" - status empty, which the adapter returns only after the POST chain
   answered (a CORS or permission failure would be status error). docs/critics/r1/int-firefox-05-action.png.
3. api.nightbot.tv admits the moz-extension:// origin: the same page showed "nightbot ok 1" for
   lirik (the recorded count), and on coconutb the merged 227 exceeds StreamElements' 160 alone,
   so Nightbot's 75 arrived there too.

Also seen: "fossabot ok 59" for lirik, streamelements empty, botrix unsupported, "60 commands in
total". Not verified in Firefox: the popup on lirik (the logged-out chat-rules dialog of that
channel kept the editor from taking text; no 'tvcmd' event was captured, the cache entry written
13 s before the action page read proves the content script requested it), the Firefox console
for errors (only the content script's console.debug lines reached stdout; zero lines from
moz-extension:// containing "error"), and revoking the host permission in about:addons.

## Round 2

- 7TV Tab with our popup closed (TRUTH-6), 2026-10-21 about 17:20, Chromium headless, vendor 7TV
  v3.1.6 patched local mode, logged out, coconutb popout, dist/chrome loaded: typing "ee" then Tab
  did nothing - no emote completed, no carousel, input stayed "ee", focus stayed in the input
  (docs/critics/r2/p3-7tv-tab-carousel.png). Nothing in the emote sets loaded in that mode starts
  with "ee". Control runs in the same profile: "d" then Tab -> "D: ", a second Tab -> "DaBaby "
  (7TV's tab-completion carousel), identical with our extension loaded
  (docs/critics/r2/p3-7tv-tab-ours-d.png) and without it (p3-7tv-tab-no-ours-d.png); "ee" + Tab
  without our extension also left "ee". So with the popup closed our extension does not change
  7TV's Tab completion. Input cleared afterwards, Enter never pressed.
- Firefox console (P3-2, TRUTH-3): tools/dev/int-firefox.mjs and test/browser/firefox-live.mjs now
  require a heartbeat. On coconutb (int-firefox, profile copied from ff-live, cache hit, no
  fetch) Firefox stdout carried "[7tv-cmd] loaded" and "[7tv-cmd] channel coconutb" from the content
  script and "[7tv-cmd] heartbeat background", a console.debug issued in the background window
  through runtime.getBackgroundPage() from the action page. Both consoles were therefore captured
  (console API lines; devtools.console.stdout.content covers moz-extension pages), and 0 lines from
  the extension mentioned error or warn. Log: docs/critics/r2/logs/ff-coconutb.log. firefox-live.mjs
  checks the content heartbeat only.
- Recorder (P3-1): the "Click outside" probe clicks 10 px above the popup's top edge, centred (the
  chat message area); on coconutb the popup closed and the input kept "!b"
  (docs/critics/r2/rec-p3-probe/notes.md). Twitch's placeholder (p.chat-wysiwyg-input__placeholder,
  a sibling of the editor) and the Slate draft nodes are no longer counted as popup rows, so
  "Backspace past trigger" now reads open -> closed and the closed Up/Down columns read closed.
