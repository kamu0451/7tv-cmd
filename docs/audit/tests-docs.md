# Pre-publish audit: tests and documentation truthfulness

## Scope

Ran `npm run typecheck` (exit 0, `tsc --noEmit`, no output lines) and `npm test` (`vitest run`, exit 0):
"Test Files  7 passed (7)", "Tests  409 passed (409)", no failed and no skipped line, "Duration  369ms".
Did not run `test:browser`, build, zip, sign, start:firefox or record (no network, per the brief).
Read: docs/SPEC.md in full; README.md and PROVIDERS.md (lines 1-400 in full, 400-571 skimmed by
heading); src/content/controller.ts, src/match/match.ts, src/content/token.ts, src/cache/cache.ts,
src/providers/*.ts, src/manifest.json, scripts/build.mjs, tsconfig.json, vitest.config.ts,
package.json; every test file title in test/unit (bodies read for adapters-parse, merge, cache budget,
registry), test/browser/harness.ts, keyboard.spec.ts, live.spec.ts, test/fixture-page/fixture.ts,
scripts/test-browser.mjs. Scripted a check of every backticked path in README.md and PROVIDERS.md
(all README paths exist or are documented as generated or ignored: dist/, web-ext-artifacts/,
.pw-profiles/, vendor/; every short log and PNG name resolves in docs/critics/r1, r2, final). Read the
cited logs and viewed two cited PNGs (the Firefox action page and the Firefox lirik popup). Compared
fixture JSON field names and counts with the parsers by script, and scanned test/fixtures with rg for
emails, tokens, cookies, IPs and Discord invites. Result files are in the session scratchpad
(tst/typecheck.txt, tst/test.txt, tst/paths.txt, tst/fx.txt). No major findings.

## Coverage map

Fixture page (test/fixture-page) = a real slate-react editor with Twitch's chat-input attributes,
native or wrapped in a 7TV-shaped DOM (`?mode=seventv`, no 7TV code), dark or light class, the
command cache seeded into storage.local from the coconutb Nightbot and StreamElements fixtures,
every other request aborted. It has NO `div.autocomplete-match-list`, no Twitch "/" or "@" tray, no
7TV code, and its Enter handler only records into `__fixture.sent`. "live.spec" = the real popout
chat (network, one test needs vendor/7tv-patched).

| SPEC behaviour | Covering test | Notes |
| --- | --- | --- |
| 1.1 trigger at word start, never for : / @ | unit token.test.ts "isTrigger" (6 its: mid-word, second "!", ":", "/", "@"); browser keyboard.spec "\"!\" mid-word does not open", "\":\" never opens ours" (also "/", "@") | fixture only proves ours stays closed, not that Twitch's own lists open |
| 1.2 / 8 filtering, ranking, ranges, limit | unit match.test.ts (all 4 describes: ordering, query handling, highlight ranges, limit "defaults to 1000", purity); browser "\"!b\" narrows to prefix-then-substring order" | controller's query = whole token (slice(1)) only covered via token.test "returns the whole token" |
| 1.3 first row selected, Down/Up wrap | keyboard.spec "ArrowDown x2, ArrowUp x1 ... wraps at both ends" | |
| 1.3 Tab, Shift+Tab, Enter insert | keyboard.spec "${key} inserts \"!<name> \", closes, and the Slate draft equals the DOM" (3 keys x 4 setups) | |
| 1.3 Escape / Space / Backspace past "!" | keyboard.spec "Escape closes and leaves \"!b\" in place", "Space closes and the space is typed", "Backspace past the \"!\" closes" | |
| 1.3 closed popup touches no key | keyboard.spec "with the popup closed, Enter/Tab/ArrowDown keydowns are not defaultPrevented" | stopPropagation not checked; no Escape case |
| 1.3/6.5 Ctrl/Alt/Meta and isComposing pass through | uncovered | |
| 1.3 Escape then same text does not reopen (dismissedState) | uncovered | |
| 1.4 insertion equals Slate draft, survives re-render | keyboard.spec Tab/Shift+Tab/Enter test (`draft()` from Slate state, then "x", Backspace) | fixture editor, not Twitch's; real-page check only in live.spec (weak, TST-5) |
| 1.5 Enter never sends, Esc never clears or blurs | keyboard.spec Enter test (`__fixture.sent` length 0), Escape test (focus kept, text kept) | |
| 1.6 popup within 100 ms with cache | keyboard.spec "\"!\" opens ... within 100 ms" (real clock, tvcmd event t - keyT) | headless fixture; see TST-4 |
| 1.6 fetch never blocks typing, popup opens when data arrives | live.spec bangFlow (15 s poll on first fetch); no fixture test | commandsChanged path uncovered in fixture |
| 1.6 first fetch within 2 s | unit adapters-fetch "the deadline is ctx.timeoutMs", "timeout covers the WHOLE chain" | |
| 1.7 / 5.4 one fetch cycle per hour, negative caching, dedupe, 50 cap, throttle | unit cache.test (TTL, negative caching, in-flight dedupe, "manual refresh throttle", "at most 50 channels", "request budget" sliding window over 3 h with worker unloads) | fake clock throughout |
| 1.8 no listener of ours preventDefault while closed | keyboard.spec closed-popup test (above) | |
| 1.8 7TV ":" popup and replaced input keep working | live.spec "same flow with 7TV, and \":\" opens 7TV's tray" | skipped when vendor/7tv-patched is absent (always, in a fresh clone) |
| 1.8 Twitch "/" and "@" keep working | uncovered by tests; evidence docs/part3-notes.md:79 and docs/critics/final/final-critic.md table ("/" only) | |
| 1.9 zero console errors, 5 min | live.spec `errs` equals [] (about 25 s); test/browser/soak.mjs (script, not a spec); logs docs/critics/final/logs/soak-*.log | |
| 1.10 no credentials | unit adapters-fetch "sends no credentials, uses one AbortSignal ..." | "never reads chat", "stores only the cache", "no eval": uncovered |
| 1.11 dark and light themes | keyboard.spec runs every test under both theme classes | no test asserts a colour or style; recordings only |
| 3 / 5.1 normalisation, per-provider rules | unit adapters-parse.test (every fixture file against hand-written counts, hand-built bodies per provider, garbage input) | |
| 5.1 status mapping, timeout | unit adapters-fetch (404/500/invalid JSON/shape/network/timeout, `describe.each` over 4 providers) | |
| 5.2 registry order, labels, corsOpen, enabled, botrix disabled, fetchAll never throws | unit adapters-fetch "registry (SPEC 5.2)", "botrix is registered but disabled", "fetchAll" | |
| 5.2 Moobot paging (_limit=100, max 5 pages) | unit adapters-fetch "moobot paging" (7 its) | |
| 5.3 merge | unit merge.test (15 its incl. the 75 + 160 - 8 = 227 fixture merge) | |
| 4 background answers within 2.5 s, message types | uncovered (src/background/index.ts has no test; live/browser runs exercise it indirectly) | |
| 5.5 manual refresh throttle | unit cache.test "manual refresh throttle (60 s)" | action page UI uncovered; evidence docs/critics/r1/int-firefox-05-action.png, docs/critics/r2/ff-coconutb-05-action.png |
| 6.1 channel detection URL shapes, reserved segments | unit url.test.ts (24 shapes, 24 reserved segments, garbage) | |
| 6.1 SPA re-evaluation (href change, popstate, visibilitychange) | uncovered; README "Not verified" says so; docs/part3-notes.md:100 | |
| 6.2/6.3 watchChatInput, native vs 7TV detection, fires only on change | keyboard.spec beforeAll asserts the 7TV container wraps the editor (`toHaveCount(1)`) and that a fetch event arrives | "no callback when nothing changed" uncovered |
| 6.5 close on blur, mousedown outside, channel change, tray gate | uncovered in the fixture (no tray); mouse click path covered by "row mousedown keeps focus, click inserts" | |
| 7.1/7.2 popup API, roles, aria-selected, data-tvcmd-open | used as selectors by harness popupState, so implicitly asserted | |
| 7.2 hover selects (mousemove), 13 rows then scroll, position 4 px above editor, badge, "-> !name", highlight, onClose edge rules, reposition on resize and scroll, destroy | uncovered by tests; README says hover is not covered; evidence docs/recordings/ours-bang-dark, ours-bang-light, docs/critics/r2/p4-*.png | no jsdom/DOM unit tests exist (vitest environment node) |
| 9 manifest: permissions, content_scripts, all_frames, action, gecko id and min version, data_collection_permissions, chrome min version | only unit "hosts.json equals ... (SPEC 9)"; remainder by scripts/build.mjs code and docs/critics/r1/logs/int-lint.log (0 errors, 0 warnings) | no test reads dist manifests (TST-7) |
| 10 tvcmd test-hook events | indirectly: harness `events()` used by keyboard.spec (open, fetch) | |

## Findings

### TST-1 (minor): README "Not verified" still lists lirik logged out as unverified
README.md:182-184 ("... the popup on <two channels, one of them lirik> logged out (Twitch's chat-rules dialog kept
the input from taking text)"). The final check verified lirik in Firefox: docs/critics/final/final-critic.md
table note ("lirik showed 60 rows live", mid-word re-probe on lirik) and the screenshot
docs/critics/final/firefox-lirik-01-bang.png (popup open, "!" in the input, Fossabot rows). The same
stale sentence is in docs/part3-notes.md:130. The README's "Final check" paragraph (lines 177-180)
does not mention lirik. Understatement, not overclaim. Fix: remove lirik from "Not verified" and add
it (Firefox, logged out, 60 rows, final-critic.md) to the "Final check" paragraph.

### TST-2 (minor): "no public per-channel endpoint" is stated as fact, the research says "not found"
README.md:75-76 and PROVIDERS.md "Found but not supported" (wizebot, streamlabs, phantombot: "no
public per-channel command endpoint"). The PROVIDERS research sections say WizeBot "NO public
per-channel commands page or endpoint found. Result is negative-but-incomplete" and Streamlabs
"Observed for ONE channel (coconutb), so this is a negative result, not a proof". Code comment
src/providers/index.ts:2-3 repeats the strong form. Fix: "none found in the research (WizeBot and
Streamlabs checked on one channel)" in README and the summary list.

### TST-3 (minor): large untested surface behind the browser-suite happy paths
Rows marked "uncovered" in the table: popup.ts (hover, scroll, placement, onClose, reposition,
destroy), controller close paths (blur, outside mousedown, channel change, stale re-request,
modifier-key and isComposing pass-through, Escape not reopening), the native-tray gate
(NATIVE_TRAY_SELECTOR; the fixture page has no tray, so it is covered only by the live 7TV test),
watch.ts "no callback when unchanged", background handler and its 2.5 s budget, action page,
shared/messages. vitest runs `environment: 'node'` (vitest.config.ts), so none of the DOM code can
be unit tested as is. Fix, cheapest first: add a fixture-page browser test per untested controller
path (an Escape-then-same-state case, a modifier-key case, an injected `div.autocomplete-match-list`
case) to test/browser/keyboard.spec.ts; the 4 setups already exist.

### TST-4 (minor): browser expectations come from the shipped code; one time-based assertion
test/browser/harness.ts:46-53: `expectedRows()` and `fixtureCommands()` are built from the production
parsers, `mergeCommands` and `filterCommands`, so the keyboard.spec row-order assertions (lines 179,
191, 208) check that the popup renders what the matcher returns, not that the matcher is right (the
matcher is separately and independently tested in match.test.ts, so this is acceptable, but it
cannot catch a matcher bug). keyboard.spec.ts:195-196 guards the ordering check with
`if (firstSub >= 0)`, so with a fixture where no substring row exists the check silently asserts
nothing. keyboard.spec.ts:186 asserts `lat < 100` ms on the real clock in a headless browser, the
only wall-clock assertion in the suite (SPEC 1.6 budget); a loaded CI machine can fail it without a
regression. Fix: assert two or three literal row names for "!b" from the recorded fixtures; keep the
latency check but record it as an annotation with a looser CI bound.

### TST-5 (minor): live.spec Tab check would pass on a bare space
test/browser/live.spec.ts:76-81. `expect.poll(...).toMatch(/^!\S+ $/).catch(() => undefined)` swallows
its own failure, then the assertions are only `startsWith('!')`, `endsWith(' ')`, `length > 2`.
Input "!b" followed by a typed space ("!b ") satisfies all three, and the test never compares the
inserted name with the selected row. The fixture tests (keyboard.spec) do compare, so the weakness
is limited to the live path. Fix: read the selected row's name before pressing Tab and
`expect(txt).toBe(name + ' ')`; drop the `.catch`.

### TST-6 (minor): `npm run typecheck` does not cover the tests or tools
tsconfig.json:14 `"include": ["src/**/*.ts"]`. test/unit, test/browser, test/helpers and test/fixture-page
are only transpiled by vitest and Playwright, so type errors in them (and a drifted public signature
they call) are not caught by the gate the README advertises. Fix: add `test/**/*.ts` to include, or a
second `tsc -p test/tsconfig.json --noEmit` in the typecheck script. (Not run: whether it would pass.)

### TST-7 (minor): the manifest that gets signed is not asserted by any test
Spec section 9 manifest facts (permissions storage + activeTab, content script match and all_frames,
`gecko.id` `7tv-cmd@example.com`, strict_min_version 140.0, data_collection_permissions none, Chrome
minimum 116, exactly one host permission) are produced by scripts/build.mjs:74-90 and checked only
by `web-ext lint` output (docs/critics/r1/logs/int-lint.log: errors 0, warnings 0) and a "host_permissions
1" build line (docs/critics/r1/logs/build.log). README.md:48 says the id becomes permanent at the first
signing. Fix: a unit test that runs the build's `manifestFor` equivalent, or reads dist/firefox/manifest.json
after build, and asserts those fields before `npm run sign`.

### TST-8 (minor): README Cache rule sentence is looser than the code
README.md:98-100 "Each provider is asked at most once per channel per hour (one fetch cycle: the login
lookup plus the commands call)". Code and tests: a manual Refresh bypasses the hour (cache.ts:161,
cache.test "refresh bypasses the hour"); Moobot's cycle is the lookup plus up to 5 list pages (6
requests; moobot.ts:14, adapters-fetch "stops at 5 pages"); a channel evicted by the 51st entry is
fetched again inside its hour (cache.ts:98-114). The next sentence of the README does disclose the
Refresh button and its minute throttle, which is why this is minor and not major; the Moobot paging
and eviction are not disclosed anywhere in README. Fix: "at most once per hour automatically (a manual
Refresh can repeat it once a minute; Moobot's cycle can be up to 6 requests; the 50-channel cap evicts
the oldest)".

### TST-9 (note): fixtures carry third-party content; nothing credential-like found
test/fixtures (90 tracked files). No hit for an email address, token, cookie, Bearer, API key, secret or
password (rg over every fixture and .meta.json; meta files hold only the test user agent
`7tv-cmd-research/0.1`, a Nightbot channel id header and a fetch timestamp). Third-party material that
is on the streamers' public command pages but is now republished in a public repo:
- Game server IP addresses with ports: test/fixtures/streamelements/coconutb.commands.json lines 842,
  1124, 1402, 3006, 3734 (8 distinct public IPv4 addresses).
- Discord invite links: the same file lines 678, 842, 1052, 1402, 2794, 3148; test/fixtures/nightbot/coconutb.commands.json:310;
  and one to three each in the fixtures of five other channels (Nightbot lines 579 and 799 of one
  channel, StreamElements line 317 of one, Fossabot line 345 of one and lines 122 and 155 of another).
- Social handles (TikTok, YouTube, Twitter) in the same response bodies.
None is a personal message, and all of it is public by design, so this is not a blocker. Suggestion:
a one-line statement in README or PROVIDERS that test/fixtures are recorded public responses of
third-party services (not covered by the MIT licence of the code), and optionally replace the IP
addresses and invite codes with placeholders (the unit tests assert counts and field mapping, not
those strings; run `npm test` after).

### TST-10 (note): PROVIDERS.md details the code or fixtures do not bear out exactly
- PROVIDERS.md (Nightbot "Disabled/hidden" paragraph): "One element contains a space in its name
  (coconutb), so do not assume single-token names." In the fixture the space is a trailing one
  ("!rustmagic "); no fixture name has an internal space. normName trims it (merge.ts:236-242), which the
  final critic also noted. The advice stands but the claim is stronger than the data.
- PROVIDERS.md StreamElements: "meaning of each [accessLevel] value is not stated"; the code maps 100 to
  everyone, 500 to moderator, everything else to unknown (streamelements.ts:84-89, SPEC 5.1). Consistent
  as a decision, but the table row reads as undecided.
- Counts checked against the fixtures by script and all match: Nightbot 75/102/1/4 with "!" on 74/97/0/4,
  alias key on 19/75 and always empty; StreamElements 176/19/75 elements, enabled 160/14/6, aliases
  9/1/4, 270 elements none with "!"; Fossabot 32/72/51/1, default type 4/18/26/1, aliases 5/15/21, 156
  commands none with "!", enabled_online false 1, enabled_offline false 2 and 1; Moobot's one populated channel has a list of 1,
  the others empty, no-channel body for the unknown login.

### TST-11 (note): SPEC.md still carries two superseded values
docs/SPEC.md:479 `filterCommands(..., limit?: number): Suggestion[]; // limit default 100` while
src/match/match.ts:37 and docs/LEDGER.md:64 say 1000; docs/SPEC.md:537 describes `test:browser` as
"playwright test (test/browser)" while package.json runs `node scripts/test-browser.mjs`. The SPEC
header (line 7) says LEDGER wins, so this is documented drift, but README.md:9-10 calls SPEC "the
contract" for a public reader. Fix: edit the two lines or add "superseded, see LEDGER" markers.

### TST-12 (note): two Verified citations point at evidence that does not show the claim
- README.md:141-143: "typecheck, build, web-ext lint (0 errors, 0 warnings) and zip all exit 0 in round
  1 (build.log, int-lint.log)". build.log and int-lint.log confirm build and lint (build.log "[build] ok,
  version 0.1.0"; int-lint.log errors 0, notices 0, warnings 0); neither covers zip. Zip evidence is
  docs/critics/r2/checks-zip.log and docs/critics/final/final-critic.md (round 3). Fix: cite those.
- README.md:152-155 "7TV's ':ee' emote list opens and ArrowDown moves its selection": the cited
  int-e2e-2.log records only `colon: {tray:true, rows:1, oursOpen:false}`; the ArrowDown claim is
  supported by docs/part3-notes.md:77-78 instead. Fix: cite part3-notes there.
- Confirmed as stated: ff-coconutb.log (227 rows, "!b" 20 with ban/brb/burp, down sel 1, Tab "!brb ",
  extErrorLines 0, 3 of 48 stdout lines naming the extension, all console.debug); int-e2e-1.log (100 rows,
  escape keeps "!" focused, midword "abc!" closed, consoleErrors []); int-e2e-2.log (the one 7TV
  error is "Failed to fetch host manifest"); soak-plain.log and soak-7tv.log in docs/critics/final/logs
  (minutes 5, extensionErrors 0); test-browser-r3.log and tb-all.log ("66 passed"); the Firefox lirik
  action-page PNG (nightbot ok 1, moobot no commands, fossabot ok 59).

### TST-13 (note): README states the 7TV coexistence test is skipped without vendor; a fresh clone never runs it
README.md:127-129 discloses it. Consequence worth knowing at publish time: `npm run test:browser` on a
clone passes with the 7TV case skipped, so the claim "coexists with 7TV" in line 7 rests on logged
runs in docs/critics, not on a test a reader can re-run (the fixture "seventv" mode is a DOM
wrapper only, as README line 124-125 says).

## What was checked and held

- Keyboard section sentences (README.md:79-94) against controller.ts/match.ts/token.ts: trigger at
  offset 0 or after whitespace, whole token as query, ArrowUp/Down with wrap (popup.move), Tab/Shift+Tab/Enter
  pick `command.name` (alias rows insert the canonical name), Escape closes and keeps text, Space closes
  through the next input evaluation, no preventDefault when closed. All true. "Mouse: click inserts
  (tested)" is the keyboard.spec mousedown/click test; hover is mousemove-driven (popup.ts:86) and
  README says it is untested.
- Supported providers table (README.md:68-73, PROVIDERS.md first section): badges NB, SE, FB, MB, BX
  match ADAPTERS; StreamElements keeps `enabled === true && hidden !== true` from `/bot/commands/<id>`
  only; Fossabot keeps `enabled_online || enabled_offline` and `type: default`; only Moobot is
  corsOpen false and hosts.json is exactly `["https://moo.bot/*"]` (unit-asserted); botrix disabled with
  zero requests.
- Cache numbers: TTL 3 600 000 ms, 50 channels, 60 000 ms throttle (cache.ts:16-18).
- npm scripts table (README.md:111-121) against package.json: all 9 scripts present with the described
  commands; `--upload-source-code` is a real web-ext sign option (node_modules/web-ext/lib/program.js:465);
  zip output name matches scripts/zip.mjs:119.
- Every backticked path in README.md exists (or is a documented generated or ignored location); the
  short log and PNG names under the r1/r2/final folders all exist; tools/pw, tools/ff and tools/dev files
  the scripts reference are tracked. Nine of the README "Verified" log or PNG claims were read, see TST-12.
- Fixture field names read by the parsers (Nightbot `channel._id`, `name`, `alias`, `message`, `coolDown`,
  `userLevel`; StreamElements `_id`, `command`, `aliases`, `reply`, `cooldown.user/global`, `accessLevel`,
  `enabled`, `hidden`; Fossabot `channel.id/provider`, `commands[].name/aliases/response/role_ids/enabled_*`,
  `roles[].id/name`; Moobot `channel.userid`, `list[].identifier/response`, `_total`) all occur in the recorded
  fixtures with the expected types. The fixtures are the shapes the code parses today. The tests carry an
  independent oracle for name and alias normalisation (adapters-parse.test.ts:107-131).
- Weak-test sweep: no test without an assertion found in the unit files (assertion counts per file:
  url 21, cache 99, token 39, adapters-parse 126, merge 36, adapters-fetch 103, match 61); every
  time-dependent unit test uses `vi.useFakeTimers()` and `vi.setSystemTime`; the budget test would fail
  if the TTL logic were deleted (it asserts the exact call times 0, 60, 120, 180 minutes).

## Not checked

- Whether the browser suite is green today: `npm run test:browser` was not run (live twitch.tv). Its last
  recorded result is 66 passed in docs/critics/r2/logs/test-browser-r3.log, against the code at that time.
- Whether `tsc` passes over test/**/*.ts (TST-6); `npm run lint` and `npm run build` on the current tree.
- Any live provider endpoint: fixtures are recordings from 2026-10-21; I did not check that the responses
  are unchanged.
- External claims in README.md and PROVIDERS.md that need the network: the FrankerFaceZ, BetterTTV and
  Chatterino findings and their GitHub links, Mozilla's "signed automatically, usually within minutes",
  the 7TV commit hashes, the ToS quotes.
- The round 1 PNGs README.md:161-162 says show the chat-rules dialog for lirik (not opened); the rest of the
  PNG evidence (recordings, r2 p4 images) was not viewed.
- Do `tools/dev/*.mjs` and `test/browser/soak.mjs`, `firefox-live.mjs` run clean from a fresh clone?
  (Not run.) Does `npm run record` (tools/pw/record.mjs) work without local state?
- Whether any test in docs/critics or tools is meant to be part of the public suite; I treated only
  test/unit and test/browser as the suite.
- PROVIDERS.md lines 400-571 (Botrix, WizeBot, Streamlabs, PhantomBot, discovery notes) were read by
  heading and a keyword filter only, not line by line.
