# Reference: 7TV ":" emote autocomplete on Twitch chat (recorded 2026-10-21)

The quality bar our "!" command popup is judged against in a blind A/B. Numbers come from
docs/recordings/ref-7tv-colon-dark/ and ref-7tv-colon-light/ (dom.json, timings.json, frames/).
Recorder: tools/pw/record.mjs (same script records our extension later). Launcher: tools/pw/seventv.mjs.

## Build used, and why it is patched

- Asset: GitHub release SevenTV/Extension v3.1.6 (2025-03-04), `7tv-webextension-mv3.zip`, unpacked to
  vendor/7tv (manifest_version 3, version 3.1.6). Not executed in node; only loaded as an extension.
- site.js first fetches https://extension.7tv.gg/manifest.json and, if a newer build is hosted, injects
  the REMOTE build instead ("hosted mode"; today v3.1.10, `seventv.twitchsite.3.1.10.*.js`).
- On today's Twitch build BOTH hosted v3.1.10 and local v3.1.6 throw
  `TypeError: o.props.children.splice is not a function` in the chat-input button patch
  (assets/seventv.ChatInputControllerModule.3.1.6.js). Twitch's ChatInputLatencyTrackingErrorBoundary
  catches it and the ENTIRE chat input disappears (logged out; logged in not checked). Stock 7TV is
  therefore unusable logged out right now.
- Recordings use vendor/7tv-patched: the same v3.1.6 files with one guard
  (`if(!o)return n;` -> `if(!o||!o.props||!Array.isArray(o.props.children))return n;`), loaded in local
  mode (Playwright aborts requests to extension.7tv.gg). The guard only skips 7TV's extra input buttons;
  the autocomplete code (ChatInputModule) is untouched. Treat the recordings as "7TV v3.1.6 behaviour",
  not "what a 7TV user sees today".

## How 7TV hooks the chat input

- 7TV does NOT replace the Slate editor. The editor stays `div.chat-wysiwyg-input__editor`
  (`data-slate-editor="true"`, `data-a-target="chat-input"`, contenteditable), re-parented inside
  `seventv-container.seventv-chat-input-textarea` within `seventv-container.seventv-chat-input-container`.
  The `.chat-input` class the native layout has is gone from the visible tree once 7TV mounts, so
  selectors must target `[data-a-target="chat-input"]` / `.chat-wysiwyg-input__editor`, not `.chat-input`.
- Text is kept in Slate: 7TV writes by applying Slate operations (`remove_node`/`insert_node`/
  `set_selection`) on the editor instance found through React internals, and reads the text from Slate.
  Plain DOM writes would desync Slate; our extension must insert through the editor (or synthetic
  input events Slate accepts).
- The popup is NOT 7TV's own element: 7TV wraps Twitch's native autocomplete provider and injects its
  emote matches into Twitch's native tray `div.autocomplete-match-list` (styled-component
  `InjectLayout-sc-1i43xsx-0`), inside a `.scrollable-area`. 7TV's own CSS classes
  (`seventv-autocomplete-floater`, `-list`, `-item`, `-item-provider`) exist in the bundle but were not
  used for this popup.
- Colon completion opens only when the token is ":" plus at least 2 characters (code: `o.length<3`
  returns). Default mode "Must include input" (substring), up to 25 matches; emoji excluded by default.

## Visual language (measured, viewport 1280x800, popout chat)

| property | dark | light |
|---|---|---|
| position | above input, gap 4 px | same |
| popup rect | x13 y179 w1254 h528 (full input width) | same |
| rows | 18 matches, 13 visible, then scroll | same |
| row height | 42 px (emote image + name) | same |
| scroller | `.scrollable-area`, overflow-y auto, scrollHeight 742 / clientHeight 528 | same |
| font | 14px Inter (Twitch stack), weight 400, line-height 19.6px | same |
| popup background | rgb(24,24,27) | rgb(255,255,255) |
| text | rgb(239,239,241) | rgb(14,14,16) |
| provider label | "(7TV)" / "(7TV Global)" rgb(41,182,246); "(BTTV Global)" in text colour | same |
| match highlight | none: matched letters are not bold or coloured | same |
| selected row | full-width grey bar (visually about rgb(53,53,58) dark, light grey in light; detector did not capture the value) | |
| radius / shadow / z-index | 0px / none / 1 | same |
| row content | 28 px emote image, name, provider in parentheses; no second line | same |

Ordering: case-insensitive alphabetical over substring matches (":eel" lists DOYOUFEEL... before
FeelsAmazingMan); no prefix-before-substring ranking.

## Timings (headless Chromium, in-page keydown timeStamp -> 16 ms DOM poll)

- Popup open: 94.3 ms dark / 95.9 ms light (final run; an earlier run gave 96.8 / 95.4), on the key
  that makes the token 3 chars (":ee").
- Filter update: 81.6 ms / 82.0 ms (earlier run 82.4 / 82.5) (":ee" -> ":eel").
- ":" and ":e" show nothing (by design, 2-char minimum).

## Keyboard model (frames + dom.json probes)

| key | popup open | popup closed |
|---|---|---|
| Down / Up | move the grey selection one row (first row pre-selected); wrap at the ends NOT verified | not exercised reliably (probe noise) |
| Tab | inserts the selected emote + trailing space (":eel", Down Down Up -> "FeelsAmazingMan ") | 7TV tab-completion carousel (prefix match; "d" -> "D: ") |
| Shift+Tab | inserts the selected row too (observed "DOYOU... ") | not probed |
| Enter | inserts the selected emote + space (first row); does not send | not pressed (would send) |
| Escape | closes popup, keeps ":eel" in the input | no visible change |
| Space | closes popup, space typed (":eel ") | types a space |
| Backspace past trigger | input empties, popup gone | deletes |
| Mouse click on a row | inserts that row (the "click outside" probe at y=200 landed on a row) | - |

Click outside the popup was NOT exercised (the probe hit a row); see limits.

## Popups that must not be fought (gate-7tv-bang/)

- "!" and "!d" with 7TV: NO popup (frames 02-trigger, 03-filter1). Only Twitch's own promo strip
  ("Animated Emotes can be disabled in Settings") showed above the input once. Tab on "!d" left "!d";
  Shift+Tab produced "!drop " (7TV/Twitch word completion) - our Tab handler must win while our popup
  is open and must not run when it is closed.
- "/": Twitch's native command tray opens (11 rows, first "7TV", 7TV registers its own commands there).
- "@": Twitch's native chatter tray opens (1 row, "CoconutB").

## A/B checklist (score each win / tie / loss vs this reference)

1. Trigger latency: popup visible within about 100 ms of the opening key (7TV: 96 ms, but needs 2 chars).
2. Filter latency: list updates within about 85 ms per key (7TV: 82 ms).
3. Prefix-before-substring ranking (7TV: none, alphabetical substring - an easy win).
4. Highlight of the matched characters (7TV: none - an easy win).
5. Row density: rows readable and compact (7TV: 42 px rows, 13 visible).
6. Position: directly above the input, input-width, small gap (7TV: above, 4 px gap).
7. Theme fit dark AND light (7TV uses Twitch's tray colours: rgb(24,24,27)/rgb(239,239,241) and white/rgb(14,14,16)).
8. Selection visibility: the selected row is obvious at a glance (7TV: grey full-width bar).
9. Up/Down movement and wrap at both ends.
10. Tab inserts the selected command plus a trailing space, input keeps focus.
11. Enter inserts (does not send) while the popup is open.
12. Esc closes the popup and leaves the typed text.
13. No flicker or layout jump while filtering (compare frames 03/04).
14. Scroll with many rows keeps the selection in view.
15. Closes on space and on click outside.

## Limits

- Logged out, headless Chromium, one channel (coconutb), one viewport; patched local v3.1.6, not the
  hosted build users get. Firefox not recorded.
- Selection index and colour detection failed (7TV's selected style sits on an inner node); the
  selection facts above come from frames, not dom.json.
- Probe rows for "closed" keys and Up/Down wrap are unreliable (stale popup marker); verified only:
  Tab, Enter, Escape, Space, Shift+Tab, row click.
