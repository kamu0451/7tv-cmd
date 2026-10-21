# Decision ledger

Decisions taken by the main loop between rounds. Newest section first. An entry here wins over
docs/SPEC.md where they differ. "Rejected" items are out of scope for this run and must not be
raised again by a critic.

## Evidence folders, 2026-10-22

The owner's call after the audit: screenshots, recordings, logs and DOM dumps are not published.
docs/critics/ and docs/recordings/ were removed from the public tree and are now ignored paths,
kept on the development machine only; the audit reports moved from docs/critics/final/audit/ to
docs/audit/. Paths under docs/critics/ or docs/recordings/ cited below and in the round notes
(docs/integration-r1.md, docs/integration-r2.md, docs/part3-notes.md, docs/SPEC.md) name those
local files. Supersedes HYG-3 below.

## Pre-publish audit (docs/audit/SUMMARY.md), 2026-10-22

Five reviewers plus a verifier on commit 8d91d98: 1 critical (the git history carries the
account name, machine paths and the e-mail local part; HEAD is clean), 1 major (data collection
declared "none" while the channel login goes to four providers), 21 minor, 22 notes. Decisions:

- DATA (SEC-1, POL-1, POL-2): data_collection_permissions.required becomes ["browsingActivity"];
  the README Privacy section and PRIVACY.md state what is sent; SPEC 9 and S20 corrected.
  Supersedes the "none" in S20.
- POL-6: the name "7tv-cmd" and the id stay; README carries an "unofficial, not affiliated" line.
- HYG-1: before the first push a fresh orphan root commit of the clean tree becomes main; the old
  history stays local as local-history and is never pushed. Commit ids cited anywhere in these
  docs (c62a881, 8d91d98 and the like) belong to that local history, not to the public one.
- HYG-2: the owner-session records in README, this ledger and integration-r2 are generalized
  (result kept; time window, profile details, provider, command count and command names dropped).
- HYG-3: screenshots and recordings stay as test evidence; trimming is open to the owner.
- Code fixes applied in the same pass: COR-1, COR-3, SEC-3, SEC-4/COR-13, POL-8
  (docs/audit/fix-code.md). Left as recorded: COR-2, COR-4 to COR-7, SEC-5, SEC-6,
  TST-3 to TST-7, HYG-5, POL-7.

## Final (docs/critics/final/final-critic.md), 2026-10-21

Gate passed: 0 critical, 0 major, 2 minor; Chromium, Chromium with 7TV and Firefox pass on the
zipped builds for coconutb and twitch; 5 minute soaks pass with and without 7TV (0 extension
errors); README, providers, lint, ASCII, identity and install checks pass. Agents used: 26 of 30.

- F-1 (minor): README "Not verified" paragraph was stale; rewritten by the main loop (the final
  check and the soaks are now under Verified).
- F-2 (minor, deferred): test/browser/soak.mjs hardcodes the shared browser-live profile and
  dist/chrome; a --profile and --extensions flag is the fix, left for a later change.

Known differences from the 7TV reference, by decision: rows inset horizontally only (P4-1 r2),
two-line rows with a response preview and a provider badge (ours shows more than an emote list),
bold match range (7TV has none), 42 px rows (7TV about 40.6 px).

## Round 2 (fix waves and re-critics, docs/critics/r2/), decisions 2026-10-21

Round 2 result: part 4 passed its gate (3 wins, 5 ties, 0 losses, 2 minor). Part 5 (1 critical,
1 major, 1 minor) and truth (1 major, 3 minor) did not; every loss traced to two causes fixed by
the main loop, plus pointers.

Accepted and done by the main loop (agents 26 to 30 are reserved for the final critic):
- P5-2 r2 / TRUTH-1 r2: test/browser/keyboard.spec.ts asserted the old 100-row cap; now 1000.
  The suite was re-run after the fix (docs/critics/r2/logs/test-browser-r3.log).
- P5-1 r2 (critical, regression of P5-1): the part 5 fixer's report spelled the identity strings
  it was told to grep for. Scrubbed. Rule for every later agent prompt: the identity strings are
  never written into any file, including reports; say "the identity strings passed in args".
- P4-2 r2: .alias:empty { display: none } so a badge sits 6 px after the name on alias-less rows.
- TRUTH-2 r2: docs/integration-r2.md written; README's evidence list names it and the round 2
  checks and logs. TRUTH-3 r2: the vendor/7tv-patched pointer names docs/reference-7tv-popup.md
  for the guard and the LEDGER for the decision. TRUTH-4 r2: the 7TV Tab sentence cites
  docs/part3-notes.md "Round 2" and the PNGs.
- The fixer's request: .gitignore re-includes docs/critics/**/*.log so the evidence logs are
  tracked.

Rejected (cosmetic, not worth a geometry change without a re-critic budget):
- P4-1 r2: rows are inset horizontally only; the first and last row touch the frame top and
  bottom (the reference insets about 9 px vertically). Recorded as a known difference.
- P5-3 r2: gitignored on-disk logs under .pw-profiles and tools/dev/out hold the machine path.
  They are never committed; nothing to change in the repo.

LICENSE: MIT with the holder "the 7tv-cmd authors" (package.json already said MIT). The owner can
change it before the first push.

## Round 1 critics (docs/critics/r1/{p2,p3,p4,p5,truth}-critic.md), decisions 2026-10-21

Round 1 result: part 3 passed its gate (2 wins, 6 ties, 0 losses). Parts 2, 4, 5 and the
ground-truth critic did not (p2 1 loss, p4 1 loss, p5 1 critical, truth 7 losses).

Accepted for round 2:
- P5-1 (critical, fixed by the main loop): the three workflow scripts carried the owner's
  account name in default paths; root and scratch are now REQUIRED in args and the hygiene
  grep takes its identity strings from args.identity, never from the file. The critic report
  that quoted the path was scrubbed. SPEC 11 stands: no owner identity string anywhere in the
  repo, including critic reports and screenshot file names.
- P2-1 / TRUTH-8 (main loop): the S20 ledger line now says 140.0, matching build and SPEC 9.
- P2-2 (main loop): action page Status column no longer wraps (white-space: nowrap).
- P4-1 (part 4): SPEC 8 limit is raised from 100 to 1000 for every query; the popup must show
  the whole channel list ("!" on coconutb lists 227 rows); re-measure open and update with 227
  rows against the 16 ms update budget and the owner's 100 ms visible-when-cached metric.
- P4-2 (part 4, amends SPEC 7.2): the popup gets the reference's outer frame: 1 px solid border
  in the selected-bar colour (dark rgb(53,53,59), light rgb(226,226,230)), the corner radius
  measured from the reference frames (about 4 to 6 px), rows inset as in the reference; no
  shadow. docs/recordings/ours-bang-dark and -light are re-recorded afterwards.
- P4-3 (part 4, minor): createPopup() mounts the host, shadow root, stylesheet and a pool of
  13 row nodes immediately rather than on the first open; if the cold first open on a real
  channel still exceeds 16 ms but stays under the owner's 100 ms metric, that is recorded as
  an accepted deviation, not re-fixed.
- P3-1 (part 3 files extended to tools/pw/record.mjs): the "click outside" probe clicks a
  point outside the popup (the chat message area above the popup's top edge) and the
  placeholder is not counted as a popup; notes.md labels follow.
- P3-2 / TRUTH-3 (part 3 files extended to tools/dev/int-firefox.mjs and
  test/browser/firefox-live.mjs): the Firefox console capture gets a heartbeat (the extension's
  own debug line must appear in the captured output, else the capture is reported as not
  working, never as "zero errors"); the background console is captured where the Marionette
  session allows it, and the README claim is limited to what was captured.
- TRUTH-1 (part 3): the Firefox evidence is re-taken on coconutb with per-channel file names
  (docs/critics/r2/ff-coconutb-NN-<step>.png) and the event log copied as text into
  docs/critics/r2/logs/; the lirik PNGs are relabelled, not deleted.
- TRUTH-6 (part 3): with 7TV loaded and our popup closed, the 7TV Tab carousel is tried once
  ("ee" then Tab); the result goes into docs/part3-notes.md and the README says exactly that.
- TRUTH-2 / TRUTH-9 (part 5): the text evidence (Firefox events, console-error counts, lint,
  e2e logs) is copied from .pw-profiles/*.log into docs/critics/r1/logs/ with the absolute
  repo path replaced by "<repo>", and README's evidence list names part3-notes, gate-7tv.json,
  test/fixtures, test/unit and those logs.
- TRUTH-4 (part 5): the Moobot host-permission sentence in README becomes: "If you revoke it,
  Moobot's request fails and that error is cached for the hour; the other providers are
  unaffected (unit-tested, not tried in about:addons). After switching it back on, press
  Refresh on the toolbar page."
- TRUTH-5 (part 5): README says "click inserts (tested); hover moves the selection (not
  covered by the browser tests)".
- TRUTH-7 (part 5): README describes npm run start:firefox as web-ext run with a throwaway
  profile and says it was not exercised by the test run.
- P5-2 (part 5, files extended to scripts/test-browser.mjs and test/browser/harness.ts for the
  skip only): npm run test:browser runs a node script that builds the fixture page first and
  then runs Playwright (no shell operators); the 7TV setups skip with a printed reason when
  vendor/7tv-patched is absent; README says live.spec.ts touches live Twitch.
- P5-3 (part 5): an ASCII MIT LICENSE file with the holder "the 7tv-cmd authors" (no owner
  name) and one README line; the licence choice is reported to the owner, who can change it
  before the first push.

Sequencing: wave 1 = part 3 and part 4 fixers (code and evidence); wave 2 = part 5 docs fixer
(reads wave 1's docs/part3-notes.md and docs/critics/r2/fix-*.md first), then the checks runner
and the re-critics for parts 4, 5 and truth. Part 3 is not re-judged (minor findings only,
verified by the truth critic's evidence check and the checks runner). Part 2 is not re-judged
(its two findings were ledger text and a CSS wrap, both fixed by the main loop; a second live
replay within the hour is not allowed).

Owner's words received during round 1 (2026-10-21 evening): the extension may be tested on the
owner's own channel, logged in, in the owner's own browser, and commands may be SENT in that
channel's chat. This lifts, for that channel only, the "no chat message" rule and the "no
install into the owner's profile" rule for a temporary (unpacked) load used for the test. The
evidence from that session (screenshots naming the channel) is kept OUTSIDE the repo; the
docs record only "the owner's channel, logged in, hosted 7TV if present".

Owner session, 2026-10-21 (round 1 build c62a881, the owner's own logged-in Firefox with hosted
7TV installed): the round-1 dist/firefox was loaded through about:debugging as a temporary
add-on (background script "Running", no permission prompt). On the owner's own channel page
(chat column open):
- "!" opened the popup above the input inside 7TV's wrapped input, with the channel's commands,
  a provider badge and a response preview on each row, first row selected.
- a short query ranked prefix matches first, then substring matches.
- Tab inserted the command and closed the popup; Enter SENT it; the channel's bot answered in
  chat within a second. First real message ever sent by this project, with the owner's words.
- ":" plus two letters afterwards opened 7TV's own emote list (hosted 7TV, logged in): unaffected.
- Browser Console (parent-process mode, filtered by our add-on's internal UUID): no entry. A few
  "uncaught exception: Object { message }" entries without a source were present and could not
  be attributed to any add-on; content-process messages were not in that view.
Evidence: screenshots in the session scratchpad (they show the owner's channel name and stay out
of the repo). This is the first test of the hosted 7TV build and of a logged-in session; the
README says so in general terms (details dropped by the pre-publish audit, HYG-2).

Rejected: none. Deferred as recorded (not findings): below-input fallback, resize/scroll
reposition, hover on mousemove, headed browsers, Moobot paging past 100 live.

## Round 1 build (docs/critics/r1/builder-*.json, docs/integration-r1.md), decisions 2026-10-21

Accepted (these amend docs/SPEC.md where they differ):
- B1 (part 3, SPEC 6.4): insertion order is REVERSED: a synthetic beforeinput with targetRanges
  first, execCommand("insertText") only when that event was not cancelled. Measured: the
  execCommand-first order desyncs Slate (DOM "!discord ", Slate draft "!dis").
- B2 (part 3, SPEC 7.2): the popup anchor is div.chat-wysiwyg-input-box in both input kinds
  (measured x8 w1264 on both; the 7TV container is x0 w1280). "x13 w1254" in the spec was a
  reference-recording figure, not a selector rule.
- B3 (part 4, SPEC 7.1): update() keeps the selection on the same command only after the user
  moved it (keys or mouse) since open(); an untouched selection stays on row 0 when the list
  changes (the literal reading left "abacus" selected deep in the list after "!" -> "!b").
- B4 (part 4, S18): selected-bar colours sampled from the reference frames/05-down.png at
  (700,279): dark rgb(53,53,59), light rgb(226,226,230).
- B5: added exports are fine as long as the frozen ones are unchanged: popup.ts providerBadge(),
  styles.ts ROW_HEIGHT and GAP_PX, native.ts installKeyHub / createSlateInput / afterFrame /
  SLATE_EDITOR_SELECTOR / NATIVE_ANCHOR_SELECTORS, watch.ts onWatchTick, controller.ts
  commandsChanged() / pickByName().
- B6: tools/dev/out/ is gitignored; test/fixture-page/dist/ too. The fixture page pins react
  19.3.1, react-dom 19.3.1, slate 0.146.0, slate-react 0.147.1, slate-dom 0.147.0 as exact
  devDependencies.
- B7: tools/pw/record.mjs takes --profile <name> so parallel recorders do not share a Chromium
  profile; the default (rec-ext / rec-7tv) is unchanged.

Open for the round 1 critics (not decided here): the 100-row cap on "!" alone (coconutb has 227
commands, SPEC 8 default limit 100); the part 4 visual diffs against the reference (no outer
1 px frame or radius, 42 px vs about 40.6 px rows, two-line rows, bold match, badge style);
the with-7TV insertion landing after the popup closed; click-outside and row hover untested;
the second-channel popup not seen in Chromium because Twitch's logged-out "Chat Rules" dialog
blocks the editor on nickmercs, twitch and lirik (an e2e-driver gap, not an extension bug);
Firefox background console not captured.

Process record (request budget, "one fetch cycle per provider per channel per hour"): the
rule held per browser profile (that is what the cache enforces). Across profiles it was
exceeded for coconutb three times today: integration's Firefox cycle at 15:52 (16 min after
part 2's), and the browser-test agent's Chromium cycle at 16:45 and Firefox cycle at 16:49 in
the same hour. Mitigation from the critic round on: every Chromium profile is seeded by copying
.pw-profiles/browser-live (coconutb cached 16:45) and parallel agents use their own profile
names. The browser-test agent also edited two files with sed -i / printf instead of the Edit
tool (repo-local, content checked); recorded, nothing to revert.

Rejected: none.

## Round 1 spec critic (docs/critics/r1/spec-critic.md), decisions 2026-10-21

Accepted, applied to docs/SPEC.md as the report's paste-ready text: S1 to S26, all of them,
with these modifications:
- S15: the part 3 notes file is docs/part3-notes.md everywhere (not docs/integration-notes.md).
- S16: the fixture page (test/fixture-page/**, a real slate-react editor in native and 7TV
  wrapping) is owned by the TEST HARNESS (tests-browser agent, written after integration, as the
  task orders it), not part 3; slate, slate-react, react and react-dom are pinned devDependencies
  added by that agent. Part 3 verifies on the live chat until then.
- S8: the owner's "at most one request per provider per channel per hour" is read as one fetch
  CYCLE per provider per channel per hour (the provider's recorded chain: lookup + commands, plus
  Moobot pages with _limit=100, at most 5 pages); ProviderResult.requests reports the HTTP count.
- S20: strict_min_version "140.0" (the critic proposed 128.0; web-ext lint rejects
  data_collection_permissions below 140 on desktop and 142 on Android, so the build ships 140.0
  with gecko_android 142.0), and the Firefox manifest also carries
  browser_specific_settings.gecko.data_collection_permissions { required: ["none"] } (superseded
  by the pre-publish audit section above: ["browsingActivity"]) (web-ext
  lint flags its absence; the extension collects nothing). Integration confirms with the
  Marionette driver that a temporary install runs the content script and the moo.bot fetch.
- S18: the light-theme selected-bar colour is sampled by part 4 from
  docs/recordings/ref-7tv-colon-light/frames/05-down.png and recorded here by the main loop
  after round 1.
Scaffold stubs updated to the amended contract in the same pass: ProviderAdapter.enabled,
PopupOptions.getEditorRect, manifest strict_min_version and data_collection_permissions.
tools/pw/record.mjs extended to see open shadow roots (S3), checked against the 7TV reference.

Rejected: none.

## Round 0 -> 1 (gate decision and contract facts, 2026-10-21)

Gate: BUILD. 7TV (v3.1.26, commit 69eaa09) completes emotes, chatter names and its own "/"
commands; it has no "!" bot-command completion, no provider code, no issue or PR for it
(docs/gate-7tv.md). What already exists elsewhere: FrankerFaceZ ships an official add-on
"Custom Commands Auto Completer" (StreamElements, Fossabot, Nightbot, Moobot; not tested live)
and BetterTTV has "Command Autocomplete" for paid BTTV Pro users from BTTV's own backend.
Chatterino (desktop) has none. README states all three.

Accepted:
- Providers in v1: nightbot, streamelements, fossabot (all CORS-open, no host permission),
  moobot (fixed ACAO https://moo.bot: host permission https://moo.bot/*). botrix registered as
  unsupported: no populated response observed in 14 channels, API under robots.txt Disallow,
  no CORS header. WizeBot, Streamlabs Cloudbot, PhantomBot: no public per-channel endpoint.
- The 7TV reference and all 7TV coexistence tests use vendor/7tv-patched (GitHub release v3.1.6
  mv3 zip, local mode, one guard added so the chat input survives logged out); the stock build
  and the hosted v3.1.10 break the logged-out input. Real users are logged in and run the
  hosted build: that path is untested and README says so.
- 7TV does not replace the Slate editor; it re-parents it. Both input kinds share the Slate
  adapter (SPEC 6.3). The native Slate selector is
  div[data-a-target="chat-input"][data-slate-editor="true"] in Chromium and Firefox.
- The visual reference is Twitch's native autocomplete tray (7TV injects into it): full input
  width, 4 px gap, 42 px rows, 13 visible, Twitch tray colours (SPEC 7.2).
- Keyboard: first row pre-selected; Tab, Shift+Tab and Enter insert; Esc keeps the text; Space
  closes and types the space (SPEC 1.3).
- Ours opens on "!" alone (the task's words); 7TV's two-character minimum is not copied.

Rejected (out of scope for this run):
- Emulating 7TV's Tab carousel or Twitch's "/" tray for "!" when our popup is closed.
- A content-script fetch path as a fallback for a denied Firefox host permission (only Moobot
  needs one; a denied permission yields a cached error and the other providers still work).
- Testing the hosted 7TV build or a logged-in session (needs the owner's login).

## Round 0 (gate and research)

Accepted:
- Repo layout, toolchain pins (Playwright 1.62.1 so the cached Chromium 1234 is reused), the
  shared launcher tools/pw/browser.mjs, the recording protocol in SPEC section 10.
- The extension is standalone and coexists with 7TV; no 7TV fork, no 7TV addon API.

Rejected (out of scope for this run):
- Signing, store submission, installing into the owner's own browser profiles.
- Any settings UI beyond the manual refresh action page.
- Twitch Helix or any credentialed API.
