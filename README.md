# 7tv-cmd

A cross-browser WebExtension (Manifest V3, Firefox first, Chrome second) that adds a popup to the
Twitch chat input. When you type "!" it lists the bot commands available in that channel, filters
as you type, and inserts the chosen command on Tab or Enter, the way the 7TV extension completes
emotes after ":". The commands come from the public command pages of Nightbot, StreamElements,
Fossabot and Moobot. No Twitch login, no Twitch API credentials, no setup. It coexists with 7TV.
Unofficial: not affiliated with or endorsed by 7TV, Twitch or any of the bot providers; the name
only says what it sits next to.

Status: 0.1.0, signed by Mozilla on 2026-10-22 as a self-distributed (unlisted) add-on, source
archive attached; audited before publishing (`docs/audit/SUMMARY.md`). The contract is
`docs/SPEC.md`; decisions that override it are in `docs/LEDGER.md`; provider research is in
`PROVIDERS.md`. Licence: MIT, see `LICENSE`.

## What already exists

The research gate (`docs/gate-7tv.md`, 2026-10-21) found that 7TV completes emotes, chatter names
and its own "/" commands, but has no completion for "!" bot commands and no open issue or pull
request asking for it. Elsewhere, FrankerFaceZ ships an official add-on "Custom Commands Auto
Completer" (StreamElements, Fossabot, Nightbot, Moobot; not tested here), BetterTTV has "Command
Autocomplete" for paid BTTV Pro users from its own backend, and Chatterino has nothing comparable.
This extension is for people on 7TV or the plain Twitch input who want it without an account or a
paid tier.

## Install (development builds)

Build first: `npm install`, then `npm run build`. This writes `dist/firefox` and `dist/chrome`.

### Firefox (temporary add-on)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on" and pick `dist/firefox/manifest.json`.

The temporary add-on disappears when Firefox closes. `npm run start:firefox` is `web-ext run` on
`dist/firefox` with a throwaway profile (a fresh Firefox profile, not yours) and opens a Twitch
popout chat; it was not exercised by the test run.

### Firefox (permanent install, signed)

Release Firefox installs an add-on permanently only when Mozilla has signed it. Self-distributed
("unlisted") add-ons are signed automatically (Mozilla's page says within 24 hours, usually much
quicker), nothing is published, and Mozilla may still review the add-on later and block it if it
breaks a policy:

1. Log in at addons.mozilla.org, open Developer Hub -> "Manage API Keys" and generate a key pair.
2. In the repo, with the keys in the environment:
   `WEB_EXT_API_KEY=<issuer> WEB_EXT_API_SECRET=<secret> npm run sign`
   (PowerShell: `$env:WEB_EXT_API_KEY="<issuer>"; $env:WEB_EXT_API_SECRET="<secret>"; npm run sign`),
   or put those two lines (`NAME=value`) in a `.env` file in the repo root; it is ignored by git
   and `npm run sign` reads it when present.
3. Install the signed `web-ext-artifacts/*.xpi` through `about:addons` -> gear icon -> "Install
   Add-on From File".

The add-on id `7tv-cmd@example.com` becomes permanent at the first signing; change it in
`scripts/build.mjs` before then if you want another. The build is TypeScript bundled by esbuild, so
Mozilla's source-code policy applies: attach the source with
`git archive -o web-ext-artifacts/7tv-cmd-source.zip HEAD` and
`npm run sign -- --upload-source-code web-ext-artifacts/7tv-cmd-source.zip`. A reviewer rebuilds it
with Node 22 and npm 10 on Windows or Linux (`npm ci`, then `npm run build`) and compares
`dist/firefox` with the signed package. `npm run sign` was checked only as far as its "missing
api-key / api-secret" errors; nothing was signed by the test run.

Host permission: the manifest asks for one host permission, `https://moo.bot/*`, because Moobot's
API answers only to its own site. Nightbot, StreamElements and Fossabot need none. The switch is in
`about:addons` -> 7tv-cmd -> Permissions. If you revoke it, Moobot's request fails and that error is
cached for the hour; the other providers are unaffected (unit-tested, not tried in about:addons).
After switching it back on, press Refresh on the toolbar page.

### Chrome and other Chromium browsers (unpacked)

1. Open `chrome://extensions` and turn on Developer mode.
2. Click "Load unpacked" and pick the `dist/chrome` folder.

## Supported providers

| Provider | Badge | Notes |
| --- | --- | --- |
| Nightbot | NB | public API, no host permission |
| StreamElements | SE | enabled, non-hidden custom commands only |
| Fossabot | FB | includes Fossabot's default commands that are enabled |
| Moobot | MB | needs the `https://moo.bot/*` host permission |

Botrix is registered but disabled (no usable public endpoint); for WizeBot, Streamlabs Cloudbot and
PhantomBot no public per-channel endpoint was found (`PROVIDERS.md` records how far each search
went). When two providers publish the same name, the
first in the order above wins and the row shows its badge. Details: `PROVIDERS.md`.

## Keyboard

The popup opens when the word under the caret starts with "!" at the start of the input or after
a space ("abc!" does not open it). It lists all of the channel's commands (limit 1000; "!" on
coconutb lists 227 rows). With the popup open:

- ArrowDown / ArrowUp move the selection (the first row starts selected; both ends wrap).
- Tab, Shift+Tab or Enter insert the selected command as `!name ` (Enter never sends the message).
- Escape closes the popup and keeps your text; Space closes it and types the space.
- Mouse: click inserts (tested); hover moves the selection (not covered by the browser tests).

With the popup closed the extension handles no key; 7TV's ":" emote list and Twitch's "/" and "@"
lists open as before; 7TV's Tab completion was tried once with and without our extension: "ee"
plus Tab does nothing, "d" plus Tab completes an emote the same way in both (`docs/part3-notes.md`
"Round 2"; local-mode 7TV, logged out).

## Cache rule

Each provider is asked at most once per channel per hour (one fetch cycle: the login lookup plus
the commands call; Moobot's list is paged, up to six requests). Results, empty results and errors
are all cached for the hour in `storage.local`. The store keeps the 50 most recent channels; a
channel that was pushed out is fetched again on the next visit. The toolbar button opens a small
page with each provider's status and a Refresh button, throttled to once per channel per minute;
that button is the one way to ask sooner than the hour.

## Privacy

When you open a Twitch page that has a chat input, the extension sends that channel's name (the
login in the page URL) to the public, unauthenticated command endpoints of Nightbot,
StreamElements, Fossabot and Moobot, before you type anything, at most once per channel per hour.
Those services therefore see which channel you are viewing and your IP address, as they would if
you opened their public command page yourself. Nothing else leaves the browser: no Twitch login,
user name, cookies, tokens, Twitch API calls, chat messages or typed text (the query after "!" is
matched on the page). The command cache is stored on your device only; there is no analytics,
telemetry or error reporting. The Firefox manifest declares this as "browsing activity" data
collection (`data_collection_permissions`), which Firefox shows at install. Full text:
`PRIVACY.md`.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit`, exit 1 on any error |
| `npm run build` | typecheck, esbuild bundles, manifest variants and the action page into `dist/firefox` and `dist/chrome` |
| `npm run zip` | zips both builds into `web-ext-artifacts/7tv-cmd-<browser>-<version>.zip` |
| `npm run sign` | `web-ext sign` on `dist/firefox`, unlisted channel, keys from `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` (not run by the test run) |
| `npm run lint` | `web-ext lint` on `dist/firefox` (exit 1 on errors, warnings printed) |
| `npm test` | unit tests (vitest) |
| `npm run test:browser` | `scripts/test-browser.mjs`: builds the fixture page, then runs the browser tests (Playwright, `test/browser`) on `dist/chrome` |
| `npm run start:firefox` | `web-ext run` on `dist/firefox` with a throwaway profile, opens a Twitch popout chat (not exercised by the test run) |
| `npm run record` | `tools/pw/record.mjs`, pass its flags after `--` |

`npm run test:browser` needs `dist/chrome` (run `npm run build` first) and builds the fixture page
itself before Playwright starts. `keyboard.spec.ts` runs on that local fixture page and makes no
network request; its "seventv" setups use a 7TV-shaped fixture DOM. `live.spec.ts` touches live
twitch.tv: one channel (coconutb), logged out and read-only, one provider fetch cycle per hour per
profile (`.pw-profiles/browser-live`). Its 7TV test needs `vendor/7tv-patched` (not in the repo;
the one-line guard to apply to the 7TV v3.1.6 release zip is in `docs/reference-7tv-popup.md`,
the decision in `docs/LEDGER.md` section "Round 0 -> 1") and is skipped when it is absent.

Integration checks used in round 1: `node tools/dev/int-e2e.mjs` (Chromium),
`node tools/dev/int-firefox.mjs` (Firefox through Marionette), `node tools/dev/assemble-providers.mjs`
(rebuilds `PROVIDERS.md`).

## Verified (round 1 integration and round 2 re-runs, 2026-10-21, logged out, headless)

Only what was seen working. The screenshots, event logs, DOM dumps and recordings behind these
lines are kept outside the public repository (the ignored `docs/critics/` and `docs/recordings/`
folders); the round notes that cite them by name are `docs/integration-r1.md`,
`docs/integration-r2.md` and `docs/part3-notes.md`.

- typecheck, build, web-ext lint (0 errors, 0 warnings) and zip all exit 0 in round 1; typecheck,
  build, lint and the unit tests (409) exit 0 again in round 2.
- Chromium, popout chat coconutb, round 1 run (the limit was 100 then): "!" opened the popup with
  100 rows of 227 merged commands (Nightbot 75 + StreamElements 160 minus 8 shared names), "!b"
  narrowed to 20, ArrowDown selected row 2, Tab left `!brb ` in the input and closed the popup.
  Since round 2 the list shows all commands (limit 1000): "!" on coconutb lists 227 rows, ArrowUp
  from the first row selects row 227 and scrolls it into view (live check in Chromium).
- Chromium: Escape closes the popup and keeps "!" with the input focused; "abc!" does not open it.
- Chromium with 7TV (vendor/7tv-patched, local mode): the same path gives `!brb `, and afterwards
  7TV's ":ee" emote list opens and ArrowDown moves its selection while ours stays closed.
- Firefox (system Firefox, temporary add-on, no permission granted by hand), coconutb, round 2
  re-run on a cached profile: "!" -> 227 rows, "!b" -> 20 (ban, brb, burp), ArrowDown selects the
  second row, Tab -> `!brb ` and the popup closes. The round 1 run showed the same path with 100
  rows; its lirik screenshots showed the Chat Rules dialog, not the popup.
- Firefox action page for lirik: "nightbot ok 1", "moobot no commands" (the moo.bot request
  answered under the host permission), "fossabot ok 59".
- Recordings in both themes, found by the recorder through the popup's open shadow root.
- Console: both Firefox consoles were captured with a heartbeat (the extension's own debug line
  was seen in the content script console and in the background console; console API lines only)
  and carried no error or warning line from this extension; not covered: Firefox uncaught
  exceptions from the background. In the Chromium runs, page errors and service worker errors
  filtered to this extension were 0 (the one error in the 7TV run is 7TV's own, "Failed to fetch
  host manifest").

Tested by hand by the owner in a logged-in Firefox with 7TV installed, on the owner's own channel:
the list opened inside 7TV's input, a short query ranked prefix matches first, Tab inserted the
command, Enter sent it and the channel's bot answered; 7TV's emote list still opened afterwards.

Final check on the zipped builds: coconutb and twitch (Nightbot + Fossabot) in Chromium, Chromium
with 7TV and Firefox, the full path on each; 5 minute soaks with and without 7TV, 0 extension
errors.

Not verified: the hosted 7TV build in Chromium and logged-in sessions beyond the owner's one
Firefox session above, SPA navigation between channels (tried by hand once, worked), a headed
browser, the popup on nickmercs logged out (Twitch's chat-rules dialog kept the input from taking
text; lirik logged out was verified in Firefox by the final check).

## Evidence

- `docs/audit/SUMMARY.md`: the pre-publish audit (five reviews, a verification pass, the fix plan
  and what was left as recorded); the per-review reports are beside it.
- `docs/part3-notes.md` (chat input integration, the Firefox permission check, round 2 notes),
  `docs/gate-7tv.json` (the 7TV research gate data), `docs/integration-r1.md`,
  `docs/integration-r2.md` (round 2 fixes, checks and the owner's Firefox session).
- `test/fixtures` (recorded provider responses) and `test/unit` (the unit tests built on them).
- Not in the repository: the test-run screenshots, logs, DOM dumps and recordings under
  `docs/critics/` and `docs/recordings/` (ignored paths, kept on the development machine only).

## License

MIT, see `LICENSE`.
