export const meta = {
  name: '7tv-cmd-build-round',
  description: 'Build stages of the 7tv-cmd run. stage=spec: spec critic + scaffold in parallel. stage=build: parts 2/3/4 builders in parallel against docs/SPEC.md, then integration, then unit and browser test harness in parallel.',
  phases: [
    { title: 'Spec critic and scaffold', detail: 'stage=spec: one opus critic reads SPEC.md; sonnet scaffold writes build, manifest, stubs' },
    { title: 'Builders', detail: 'stage=build: p2 providers+cache (sonnet xhigh), p3 chat input (opus high), p4 popup+match (opus medium)' },
    { title: 'Integration', detail: 'one opus agent: build, lint, real-chat end-to-end, PROVIDERS.md, README' },
    { title: 'Test harness', detail: 'unit tests (sonnet) and browser tests (opus) in parallel, after integration' },
  ],
}

// args: { stage: 'spec' | 'build', root, agentsSoFar, round, briefs?: { p2?: string, p3?: string, p4?: string } }
const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const STAGE = A.stage || 'spec'
// root is REQUIRED in args: no machine path lives in the repo.
const ROOT = A.root
if (!ROOT) throw new Error('args.root is required')
const ROUND = A.round || 1
let agents = A.agentsSoFar || 0
const BRIEFS = A.briefs || {}

const PROJECT = `Project: 7tv-cmd, a cross-browser WebExtension (Manifest V3, Firefox first, Chrome second) that adds a popup to the Twitch chat input: when the user types "!" it lists the BOT commands available in THAT channel (fetched from the public command pages of Nightbot, StreamElements, Fossabot and the other providers recorded in docs/providers/), filters as they type, and inserts the chosen command on Tab or Enter, the way the 7TV extension autocompletes emotes after ":". No Twitch login, no Twitch API credentials, no user setup. It must coexist with 7TV.`

const PREAMBLE = `Repo: ${ROOT} (run every command from there; node 22; Playwright 1.62.1 with Chromium, web-ext, esbuild, vitest and typescript are in node_modules). The contract is ${ROOT}/docs/SPEC.md; decisions that override it are in ${ROOT}/docs/LEDGER.md (read both first, LEDGER wins). Every file you write is ASCII only: no emoji, no Unicode icons, no smart quotes, no arrows other than "->". Shell rules: search with the Grep and Glob tools, read with Read, write with Write and Edit (never heredocs for files); never grep -P; delete only with a literal path; single-quote Windows paths in bash. In an .mjs script import repo modules by RELATIVE path or a file:///C:/... URL (a bare C:/ path throws ERR_UNSUPPORTED_ESM_URL_SCHEME). Playwright profiles go under ${ROOT}/.pw-profiles/ (gitignored), never the owner's browser profile; the shared launcher is tools/pw/browser.mjs and tools/pw/seventv.mjs (7TV unpacked in vendor/7tv when present). Live sites are READ-ONLY: no login, no account, no chat message (press Enter in a real chat only while a popup row is visible, and clear the input with Control+A, Delete before leaving), no credentialed API; respect the one-request-per-provider-per-channel-per-hour rule in anything you run against live providers. Budget: about 40 tool calls, hard stop at 60 (every Read, Bash, Edit, Write and PNG view counts); past call 50 start nothing new, make typecheck and build pass with what you have, and list the rest under "deferred". Your final message is EXACTLY ONE JSON object (no prose around it) in the shape SPEC section 12 gives (critics: the shape given in their prompt); keep it under 3 KB and put detail in files.`

function parseJson(s) {
  if (s == null) return null
  if (typeof s === 'object') return s
  try { return JSON.parse(s) } catch (e) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)) } catch (e) {} }
  return { report: String(s).slice(0, 1500) }
}

function status(line) {
  log(`status: round ${ROUND} ${line} | cumulative agents ${agents} | output tokens ${budget.spent()}`)
}

// Keep the return small: the notification truncates past ~8 KB; detail lives in docs/critics/r<N>/*.json.
function clip(v, n) {
  if (v == null) return v
  if (typeof v === 'string') return v.length > 160 ? v.slice(0, 157) + '...' : v
  if (Array.isArray(v)) return v.slice(0, n || 4).map(x => clip(x, n))
  if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = clip(v[k], n); return o }
  return v
}

// ---------------------------------------------------------------- stage: spec
const specCriticPrompt = `You are the SPEC CRITIC, fresh context, harsh. ${PROJECT}

${PREAMBLE}

Three builders will shortly implement parts 2 (providers, cache, background), 3 (chat input integration) and 4 (popup UI, matching) IN PARALLEL from ${ROOT}/docs/SPEC.md without talking to each other, then an integration agent joins the result. Your one job: find everything in SPEC.md that would make them diverge, fail, or build the wrong thing, and hand back concrete fixes. Do NOT edit SPEC.md or any other file except your report.

Read, in this order: docs/SPEC.md (all); docs/gate-7tv.md (what already exists); docs/reference-7tv-popup.md and docs/recordings/ref-7tv-colon-dark/notes.md and dom.json (the recorded 7TV behaviour the spec defers to); docs/providers/_summary-A.json and _summary-B.json and one provider .md (what the adapters must consume: endpoint chains, CORS headers, response shapes); the original task statement below.

Original task statement (the owner's words, abridged): popup within 100 ms when cached, first fetch under 2 s warm; at most one request per provider per channel per hour, negative caching; zero uncaught or extension console errors over 5 minutes with and without 7TV; web-ext lint clean, manifest valid as a Firefox temporary add-on and unpacked in Chromium; no remote code; host permissions limited to twitch.tv and the provider API domains actually used; detect the channel from every twitch.tv URL shape (channel page, popout, moderator view, embed, dashboard); detect "!" at a word start in BOTH the native Slate contenteditable and 7TV's replaced input; insert in a way each input accepts (verify the message the input would send, not just the DOM text); never fight 7TV's ":" popup, Twitch's "/" popup or @-mention completion; Up/Down/Tab/Enter/Esc semantics match 7TV's; popup matches 7TV's emote popup visually (above the input, dark and light themes, highlighted matched substring, provider badge, description line, max rows then scroll), prefix matches before substring matches; MV3 manifest with browser_specific_settings for Firefox, esbuild, web-ext lint and run scripts, zip for both browsers, README with temporary add-on and unpacked install steps; unit tests for matching, ranking and each adapter against recorded fixtures; a deterministic local fixture page imitating both chat inputs; a Playwright run against a real twitch.tv popout chat that never sends a message; TypeScript, vanilla DOM in the content script, ASCII-only sources, no emoji or Unicode icons anywhere.

Check at least: (1) every type, function and file named in sections 2-8 is consistent (names, signatures, ownership rows, who replaces which stub); (2) a part 3 builder and a part 4 builder reading only their sections would produce a controller and a popup that fit together (open/update/close/pick/move semantics, who handles click-outside, who handles zero results, theme, positioning); (3) the part 2 contract matches the RECORDED provider facts (CORS headers vs host_permissions rule, endpoint chains, status mapping on the recorded negative cases, provider ids and labels); (4) feasibility of the stated rules in Firefox MV3 and Chrome MV3 (host permissions, event page vs service worker, activeTab in the action page, execCommand/beforeinput for Slate insertion, the 2.5 s background answer vs the 2 s first-fetch target, storage.local quotas); (5) anything the original task asks for that the spec drops or weakens, and anything the spec adds that the task did not ask for; (6) whether the keyboard rules in section 1.3 contradict the recorded 7TV keyboard model in docs/reference-7tv-popup.md; (7) the test hook and recording protocol are enough for the later blind A/B and the 100 ms metric; (8) silent assumptions (selectors, 7TV DOM) that should be named as "recorded in <file>" rather than asserted.

Write ${ROOT}/docs/critics/r${ROUND}/spec-critic.md: for each finding a heading with severity (critical = builders would diverge or the task's stated metric is unreachable; major = rework likely; minor), the SPEC section, the problem in two or three lines, and the exact replacement text or the exact added sentence (so the fix can be pasted). Then a list of things you checked and found fine (so nobody re-checks them).

Final JSON: {"findings":[{"id":"S1","severity":"critical|major|minor","section":"6.4","title":"<=80 chars","fix":"<=400 chars exact text"}],"critical":0,"major":0,"minor":0,"checkedOk":["..."],"report":"docs/critics/r${ROUND}/spec-critic.md","toolCalls":0,"deferred":[]}`

const scaffoldPrompt = `You are the SCAFFOLD builder. ${PROJECT}

${PREAMBLE}

Build exactly the SCAFFOLD rows of the ownership table in SPEC section 2, from SPEC sections 2, 3, 4, 9 and 11, so that the three part builders can start in parallel against compiling stubs:
1. tsconfig.json (strict, ES2022, DOM, moduleResolution bundler, types for chrome and firefox-webext-browser as the repo has them in node_modules/@types; noEmit), vitest.config.ts (environment node, include test/unit/**/*.test.ts), playwright.config.ts (testDir test/browser, one worker, retries 0, timeout 90 s).
2. src/shared/types.ts and src/shared/messages.ts copied from SPEC sections 3 and 4 (messages.ts implements sendRequest and onRequest over the browser/chrome runtime API, hiding the Firefox promise vs Chrome sendResponse difference), src/shared/log.ts.
3. src/manifest.json (base, SPEC section 9) and src/providers/hosts.json containing [] (part 2 fills it).
4. STUBS with the exact exported names and signatures from SPEC for every PART 2, PART 3 and PART 4 file in the table: providers/types.ts (real interfaces), providers/index.ts (ADAPTERS = [], fetchAll resolves []), providers/merge.ts (returns [] or a trivial concat), cache/cache.ts (in-memory only, no TTL yet), background/index.ts (answers every request with ok:true and an empty ChannelCommands), action/index.html + action/index.ts (static text "7tv-cmd"), channel/url.ts (returns null), content/input/types.ts (real interface), content/input/native.ts, seventv.ts, watch.ts (watchChatInput calls cb(null) once), content/token.ts, content/controller.ts, content/index.ts (logs debug "loaded" once and dispatches no events), content/popup/popup.ts (createPopup returning a no-op Popup), content/popup/styles.ts (empty string), match/match.ts (returns []). Each stub carries a top comment "STUB from scaffold: replaced by part N" so a leftover is visible.
5. scripts/build.mjs: runs tsc --noEmit, then esbuild (iife, ES2022, target firefox121 and chrome116, no splitting, no sourcemap in the output) for src/content/index.ts -> content.js, src/background/index.ts -> background.js, src/action/index.ts -> action/index.js; copies action/index.html; writes dist/firefox/manifest.json and dist/chrome/manifest.json exactly as SPEC 9 describes (Firefox: background.scripts + browser_specific_settings; Chrome: background.service_worker + minimum_chrome_version, no browser_specific_settings); host_permissions from src/providers/hosts.json. Exit code 1 on any failure. scripts/zip.mjs: zips dist/firefox and dist/chrome to web-ext-artifacts/7tv-cmd-firefox-<version>.zip and 7tv-cmd-chrome-<version>.zip using node's zlib or a tiny store-only zip writer you write (no new dependency); print the two paths and sizes.
6. package.json scripts exactly as SPEC section 9 lists (keep the existing devDependencies; add nothing unless a script cannot work without it, and say so).
7. README.md skeleton: what it is, status "under construction", install as a temporary add-on in Firefox (about:debugging#/runtime/this-firefox -> Load Temporary Add-on -> dist/firefox/manifest.json, and the host-permission note from SPEC 9), load unpacked in Chromium (chrome://extensions -> Developer mode -> Load unpacked -> dist/chrome), the npm scripts, a "What already exists" section that points at docs/gate-7tv.md (one paragraph summarising its verdict), and placeholders "(filled at integration)" for providers and behaviour.
8. Verify: npm run typecheck, npm run build, npm run zip, npm run lint all exit 0 (lint on dist/firefox: zero errors; list warnings in your JSON); load dist/chrome with tools/pw/browser.mjs on https://www.twitch.tv/popout/coconutb/chat (reject the cookie banner), confirm the service worker starts and the page console shows the content stub's debug line and no error from the extension; close the context. Also start Firefox once with web-ext run --source-dir dist/firefox --no-reload in the background for 30 s with a disposable profile under .pw-profiles/firefox-scaffold, confirm from its stdout that the add-on installed, then kill that process (you started it, you stop it; use --firefox "C:/Program Files/Mozilla Firefox/firefox.exe" if web-ext cannot find Firefox).

Final JSON per SPEC section 12 with "part":"scaffold"; add "lintWarnings":[...] and "firefoxLoaded":true|false.`

// ---------------------------------------------------------------- stage: build
function builderPrompt(part) {
  const brief = BRIEFS[part] ? `\n\nBrief for this round (findings to fix first, decided by the main loop):\n${BRIEFS[part]}\n` : ''
  const common = `${PREAMBLE}\n\nOwnership: SPEC section 2 lists your files; write ONLY those (replace the scaffold stubs at the same paths, keeping every exported name and signature from SPEC). Other builders are writing their parts right now against the same stubs; you cannot see their work. If you need a change in another part's public surface, code against the stub and put the request in "publicSurfaceRequests". Before you return: npm run typecheck and npm run build exit 0 with your files in place.${brief}`
  if (part === 'p2') return `You are the PART 2 builder: providers, merge, cache, background, action page. ${PROJECT}

${common}

Read SPEC sections 1, 3, 4, 5, 9, 11, 12, then docs/providers/_summary-A.json, _summary-B.json and every docs/providers/<provider>.md that reports a working provider, plus the fixtures under test/fixtures/<provider>/ (the recorded responses your parse functions must handle, including the _negative ones).

Build: one adapter per WORKING provider (file name = provider id) implementing ProviderAdapter plus the pure parseChannel/parseCommands exports, following the recorded endpoint chain exactly (never an endpoint the network capture did not show); corsOpen from the recorded Access-Control-Allow-Origin header; status mapping per SPEC 5.1 against the recorded negative cases; normalisation per SPEC 3 (lowercase names without "!", aliases deduped, response single-line and clipped at 300). Providers the research marked as per-user-URL only or not working get an entry in the registry with enabled:false and status 'unsupported' (no fetch). src/providers/hosts.json = the hosts of adapters with corsOpen:false (the manifest reads it). mergeCommands per 5.3. The cache per 5.4 with storage.local (browser.storage in Firefox, chrome.storage in Chrome: use the global that exists), in-flight dedupe, the 60 s refresh throttle, eviction at 50. background/index.ts answers the three requests per SPEC 4 within 2.5 s (per-request timeout 2000 ms through AdapterContext). The action page per 5.5.

Verify (write a small node script under tools/dev/p2-check.mjs, not a test): run fetchAll with real fetch for the three recorded channels of each provider ONCE (that is your one request per provider per channel; do not loop), print per provider the status and count, and compare the counts with docs/providers/*.md; run parseCommands on every fixture and print the counts; show that a second getCommands call within the hour performs zero fetches (inject a counting fetch). Load dist/chrome in Playwright on https://www.twitch.tv/popout/coconutb/chat and, from the page, send {type:'commands:get', login:'coconutb'} through the extension (chrome.runtime.sendMessage is not reachable from the page: instead evaluate in the service worker handle from Playwright, ctx.serviceWorkers()[0].evaluate) and print the merged count; then open the action page (chrome-extension://<id>/action/index.html) in a tab and screenshot it to docs/critics/r${ROUND}/p2-action.png.

Final JSON per SPEC section 12 with "part":"p2"; add "providers":[{"id":"","corsOpen":true,"liveCounts":{"login":0}}].`
  if (part === 'p3') return `You are the PART 3 builder: chat input integration and the controller. ${PROJECT}

${common}

Read SPEC sections 1, 3, 4, 6, 7.1, 8 (signature only), 10, 11, 12, then docs/reference-7tv-popup.md (how 7TV replaces the input, the recorded selectors, its keyboard model) and docs/recordings/ref-7tv-colon-dark/notes.md and docs/recordings/gate-7tv-bang/notes.md (what "/" and "@" do, which popups exist).

Build: channel/url.ts (every URL shape in 6.1, SPA navigation re-evaluation); input/native.ts for the Slate editor and input/seventv.ts for 7TV's replaced input, both implementing ChatInput (capture-phase keydown on root, getText/getCaret from the live selection, replaceRange through the editor's own input path per 6.4); input/watch.ts; token.ts; controller.ts; content/index.ts (requests through sendRequest, the 'tvcmd' CustomEvents of section 10, lifecycle on channel change, dispose on input replacement). The popup and the matcher are stubs right now: call them through their SPEC signatures only.

Verify in Playwright with dist/chrome loaded (tools/pw/browser.mjs), on https://www.twitch.tv/popout/coconutb/chat and on https://www.twitch.tv/coconutb (reject the cookie banner): (a) the 'tvcmd' events fire with the right query when typing "!", "!b", "!b " and after Backspace; (b) insertion: with the popup stubbed, trigger your controller's pick path directly from the page (expose nothing new in production code; a test-only path is acceptable only through a CustomEvent 'tvcmd:test-pick' that the content script handles ONLY when document.documentElement.dataset.tvcmdTest === '1', set by the test; document it in docs/part3-notes.md) and prove that after inserting "!discord " the Slate draft equals the DOM text: read the draft the way Slate keeps it (walk the editor element's React fiber for the editor value, or the data-slate-* nodes) and write the method into docs/part3-notes.md; (c) the same two checks with 7TV loaded (tools/pw/seventv.mjs) against 7TV's input; (d) keys with the popup closed are untouched (type ":" and confirm 7TV's popup still opens and ArrowDown moves inside it; type "/" and confirm Twitch's popup; type "@" likewise); (e) zero console errors from the extension across these runs. Save screenshots under docs/critics/r${ROUND}/p3-*.png. Record in docs/part3-notes.md: the selectors you rely on with the date, the insertion method per input, how the draft state was read, and every behaviour you could not verify.

Final JSON per SPEC section 12 with "part":"p3"; add "selectors":{"native":"","seventv":""} and "insertionVerified":{"native":true,"seventv":true}.`
  return `You are the PART 4 builder: the popup UI and the matcher. ${PROJECT}

${common}

Read SPEC sections 1, 3, 7, 8, 10, 11, 12, then docs/reference-7tv-popup.md and docs/recordings/ref-7tv-colon-dark/dom.json and notes.md (and the light recording when it exists): the popup must look and move like 7TV's emote popup, so every size, colour, radius, shadow and row count comes from those measured values (cite the field in a code comment next to each value).

Build: match/match.ts exactly per section 8 (pure, deterministic, highlight ranges); content/popup/popup.ts and styles.ts per section 7 (shadow root, fixed positioning above the anchor with fallback below, row reuse on update so filtering never flickers, selection kept on the same command across updates, wrap on move, scrollIntoView for the selected row, mouse hover and click, theme from the html class re-read on open, provider badge as 2-3 char text, response line clipped with an ellipsis, alias rows showing "-> !name", textContent only for third-party strings).

Verify: write tools/dev/popup-dev.html (and tools/dev/popup-dev.mjs if you need a bundle step through esbuild) that loads the built popup module with 120 fake commands over a fake chat input in a Twitch-like dark page and in a light page, and drive it in Playwright: open with query "", update with "b", "ba", move down 9 times (wrap), up once, pick; screenshot each state to docs/critics/r${ROUND}/p4-*.png at 1280x800, then Read your screenshots and compare them with docs/recordings/ref-7tv-colon-dark/frames/02-trigger.png and 03-filter1.png side by side: same position relative to the input, same row density, same highlight treatment, same selected-row treatment. Measure open and update time for 100 items (performance.now around the call) and keep both under 16 ms. Write a unit-style check script tools/dev/match-check.mjs that prints filterCommands results for 10 queries over a fixed list and shows prefix before substring, name before alias, exact first.

Final JSON per SPEC section 12 with "part":"p4"; add "measured":{"openMs":0,"updateMs":0} and "visualDiffs":["one line per difference you still see against the reference frames"].`
}

const integrationPrompt = `You are the INTEGRATION agent for round ${ROUND}. ${PROJECT}

${PREAMBLE}

Three builders have replaced the scaffold stubs: part 2 (src/providers, src/cache, src/background, src/action), part 3 (src/channel, src/content/input, src/content/token.ts, controller.ts, index.ts), part 4 (src/content/popup, src/match). Their result files are docs/critics/r${ROUND}/builder-p2.json, builder-p3.json, builder-p4.json (read them: publicSurfaceRequests and knownGaps tell you where the seams are). Your job: make the whole extension work end to end, touching any src file for GLUE only (interface mismatches, lifecycle, wiring), never redesigning a part; record every edit in docs/integration-r${ROUND}.md with the reason.

1. npm run typecheck, npm run build, npm run lint, npm run zip: all exit 0. Grep src for "STUB from scaffold" (a leftover means a builder did not deliver; wire the gap minimally and record it as a known gap, do not build the part yourself).
2. Chromium end to end with dist/chrome (tools/pw/browser.mjs) on https://www.twitch.tv/popout/coconutb/chat and on one more channel from docs/providers/_summary-A.json that has Nightbot or StreamElements commands: reject the cookie banner, focus the input, type "!" -> a popup with that channel's commands appears (count it, compare with the provider doc's count), type "b" -> narrowed, ArrowDown, Tab -> the input holds "!<name> " and nothing was sent; Escape path; "!" in the middle of a word must NOT open. Screenshot each state to docs/critics/r${ROUND}/int-*.png and Read them. Repeat the core path with 7TV loaded (tools/pw/seventv.mjs) and confirm 7TV's ":" popup still works afterwards. Collect console errors from the page and the service worker: zero from this extension.
3. Firefox, through tools/ff/marionette.mjs (SPEC section 10; read its header): launchFirefox with profileDir .pw-profiles/firefox-int, installAddon('dist/firefox') as a temporary add-on, navigate to the popout chat, reject the cookie banner, click the input, send "!" and read the input back, then "b", then ArrowDown, then Tab; read the input text and the popup rows (execute a script that returns the text of div#tvcmd-popup-host's shadow root rows); screenshot to docs/critics/r${ROUND}/int-firefox-*.png. Also confirm in Firefox (SPEC 9, S20/S21 in docs/LEDGER.md): a 'tvcmd' event with event 'fetch' arrives on the popout chat after the temporary install (content script and background ran without the user granting anything), the moo.bot request succeeds (the action page or a 'fetch' event with the moobot provider status, or the background's warn line if it failed), and api.nightbot.tv reflects the moz-extension:// origin (read the background's result for nightbot: status ok with a count). Write the three results into docs/part3-notes.md under "Firefox permission check (integration)". If the popup never opens in Firefox, find out why (about:debugging host-permission state: execute browser.permissions.getAll() from the background through the Marionette "chrome" context is hard; instead read the background's console through the extension's own warn lines, and test whether the content script ran at all by checking for the 'tvcmd' events) and record the cause; fix glue if it is ours. Record what you could and could not verify in Firefox.
4. Record ours with the round-0 recorder: npm run record -- --extensions dist/chrome --url https://www.twitch.tv/popout/coconutb/chat --trigger "!" --filter "b" --theme dark --out docs/recordings/ours-bang-dark and the same with --theme light --out docs/recordings/ours-bang-light. Read the frames; if the recorder fails on our popup (it polls for a popup element near the input; ours is a shadow host div#tvcmd-popup-host on body), fix the recorder so it also sees ours without special-casing the selector (for example: any new element whose text contains the first command name), re-run, and note the change in the recorder's header comment.
5. Assemble PROVIDERS.md at the repo root: first entry = the gate finding (summarise docs/gate-7tv.md with its links and the gate-7tv-bang recording path), then one section per provider from docs/providers/<provider>.md (public URL pattern, endpoint chain, login-to-id mapping, response shape, CORS and host permission consequence, limits and robots/ToS note, the three channels with counts, negative case, fixture paths) and a final section listing the providers found but not supported and why, plus docs/providers/_discovery.md content. Fill README.md: what it does, what already exists (from the gate), install steps for both browsers (temporary add-on; unpacked), the Firefox host-permission note only if the manifest has host_permissions, supported providers (names + badge labels), keyboard model, cache rule, privacy statement (public endpoints, no login, nothing sent), development scripts, and a "Verified" section that lists ONLY what you saw working in this round with the screenshot or recording path for each line.
6. Write docs/integration-r${ROUND}.md: edits made, what works, what does not, console error summary, the two channels and counts, Firefox result.

Final JSON per SPEC section 12 with "part":"integration"; add "e2e":{"chromium":{"coconutb":{"rows":0,"narrowed":0,"inserted":""},"second":{"login":"","rows":0}},"with7tv":true,"firefox":"installed|failed|unverified"},"consoleErrors":0,"recordings":["docs/recordings/ours-bang-dark"].`

const unitTestsPrompt = `You are the UNIT TEST writer. ${PROJECT}

${PREAMBLE}

The extension is integrated (read docs/integration-r${ROUND}.md first for what works). Write vitest tests under test/unit/ (and only there, plus test helpers under test/helpers/) for: match/match.ts (exact before prefix before substring, name before alias, shorter first, alphabetical, empty query lists everything, highlight ranges, limit, no mutation of the input); content/token.ts (activeToken and isTrigger at word start, mid-word, after space, second "!", caret -1); channel/url.ts (every URL shape in SPEC 6.1 and every reserved segment, plus garbage); providers/merge.ts (dedupe by name, alias union, alsoOn order, alias equal to another name dropped); every adapter's parseChannel and parseCommands against EVERY file in test/fixtures/<provider>/ (counts must equal the counts docs/providers/<provider>.md records; negative fixtures give [] or null; normalisation: lowercase, no "!", response clipped at 300, aliases never contain the name); each adapter's fetchCommands with an injected fetch that serves the fixtures (status ok / empty / error mapping, the whole-chain timeout path with a never-resolving fetch and fake timers plus the AbortController, request count, Moobot paging with _limit=100 up to 5 pages); src/providers/hosts.json equals ADAPTERS.filter(enabled && !corsOpen) hosts as https://<host>/* patterns (SPEC 9); the disabled botrix adapter resolves 'unsupported' with zero fetch calls; cache/cache.ts with a fake storage.local and vi.useFakeTimers (TTL: a second getCommands within 59 min performs zero fetches, at 61 min one; negative caching of empty and error; in-flight dedupe; refresh throttle 60 s; eviction at 50; the "at most one call per adapter per login per hour" assertion as its own test). Keep tests deterministic: no network, no real timers. npm test must exit 0; report the test count.

Final JSON per SPEC section 12 with "part":"tests-unit"; add "testCount":0,"failing":[].`

const browserTestsPrompt = `You are the BROWSER TEST writer. ${PROJECT}

${PREAMBLE}

The extension is integrated (read docs/integration-r${ROUND}.md, docs/part3-notes.md and SPEC sections 6, 7, 10 first). Write, under test/browser/ only:
1. test/fixture-page/ (SPEC section 2, TEST HARNESS row): index.html + fixture.ts, a deterministic local page with a REAL slate-react editor (npm i -D react react-dom slate slate-react slate-dom, pinned exact versions; bundle fixture.ts with esbuild into test/fixture-page/dist/ through a small script test/fixture-page/build.mjs, gitignore the dist) carrying Twitch's attributes (data-a-target="chat-input", data-slate-editor, class chat-wysiwyg-input__editor, role textbox, the same wrapper classes docs/part3-notes.md records for the native anchor), and in ?mode=seventv the same editor wrapped in seventv-container.seventv-chat-input-container > seventv-container.seventv-chat-input-textarea as docs/reference-7tv-popup.md records; theme with ?theme=dark|light (set html.tw-root--theme-*). The page exposes window.__fixture.draft() returning the Slate editor's current value as plain text (the message that would be sent) and window.__fixture.editor for the harness. Serve it to the extension by routing: context.route for https://www.twitch.tv/popout/coconutb/chat (and the bundle URL) fulfilling with these local files (the content script matches twitch.tv, so this is how it runs on the fixture without a network), and seed the command list deterministically by writing the cache entry cc:coconutb into storage.local from the service worker handle (ctx.serviceWorkers()[0].evaluate) using commands built from test/fixtures (no network at all in these tests).
2. test/browser/keyboard.spec.ts: for each input kind and theme: "!" opens with the full list, "!b" narrows to prefix-then-substring order (assert the row texts), ArrowDown twice and ArrowUp once move the selection (assert the selected row text), wrap at both ends, Tab inserts "!<name> " and closes, Shift+Tab inserts too, Enter inserts and closes and the fixture's draft() equals the DOM text (that is the "message that would be sent" check of SPEC 6.4; also the survive-a-re-render check: type one more character then Backspace and the text is unchanged), Escape closes and leaves "!b" in place, Space closes, Backspace past the "!" closes, "!" mid-word does not open, zero matches hides the popup, ":" and "/" and "@" never open ours, a row mousedown does not blur the input and a click inserts; with the popup closed, synthetic keydown Enter/Tab/ArrowDown are not defaultPrevented; and the 'tvcmd' open event (detail is a JSON string, SPEC 10) reports t - keyT under 100 ms.
3. test/browser/live.spec.ts: against the REAL https://www.twitch.tv/popout/coconutb/chat with dist/chrome (reject the cookie banner): type "!" -> popup rows > 0, type "b" -> rows narrowed and every row text contains "b", Tab -> input text starts with "!" and ends with a space, then Control+A and Delete; NEVER press Enter here; assert zero console errors from the extension. A second describe runs the same with 7TV loaded when vendor/7tv exists (tools/pw/seventv.mjs) and additionally checks that ":" opens 7TV's popup, not ours. One shared persistent profile per run so the live fetch happens once.
4. test/browser/soak.mjs: node script (not a spec) that loads dist/chrome (and 7TV when --seventv is given) on a channel, types "!" and "!b" then clears the input every 30 s, collects page and service-worker console errors and uncaught exceptions for --minutes N (default 1), prints a summary line and exits 1 on any error from this extension. Run it for 1 minute once, both with and without 7TV, and report the result; the final critic runs 5.
5. test/browser/firefox-live.mjs: node script using tools/ff/marionette.mjs (read its header; SPEC section 10): temporary-install dist/firefox, open the real popout chat, reject the cookie banner, send "!" (read it back first), "b", ArrowDown, Tab; print the popup row texts before Tab (read div#tvcmd-popup-host's shadow root) and the input text after; Control+a, Delete; exit 1 when no popup opened or the input does not start with "!" and end with a space. Run it once and report.
Run npm run test:browser; all specs must pass (list any you had to skip with the reason). Playwright config already exists: adjust it only for the testDir and the persistent-context fixture you need.

Final JSON per SPEC section 12 with "part":"tests-browser"; add "specs":{"keyboard":{"passed":0,"failed":0},"live":{"passed":0,"failed":0}},"soak":{"plain":"ok|errors","with7tv":"ok|errors|skipped"},"firefoxLive":"ok|failed|skipped","openLatencyMs":0.`

// ---------------------------------------------------------------- run
if (STAGE === 'spec') {
  phase('Spec critic and scaffold')
  agents += 2
  status('spec stage: launching spec critic + scaffold (2 agents)')
  const [critic, scaffold] = await parallel([
    () => agent(specCriticPrompt, { label: 'spec-critic', phase: 'Spec critic and scaffold', model: 'opus', effort: 'high' }).then(parseJson),
    () => agent(scaffoldPrompt, { label: 'scaffold', phase: 'Spec critic and scaffold', model: 'sonnet', effort: 'xhigh' }).then(parseJson),
  ])
  status('spec stage done')
  return {
    stage: 'spec', round: ROUND, cumulativeAgents: agents, spentOutputTokens: budget.spent(),
    critic: critic ? { critical: critic.critical, major: critic.major, minor: critic.minor, findings: (critic.findings || []).map(f => ({ id: f.id, severity: f.severity, section: f.section, title: f.title })), report: critic.report, deferred: critic.deferred } : null,
    scaffold: scaffold ? { done: scaffold.done, checks: scaffold.checks, lintWarnings: scaffold.lintWarnings, firefoxLoaded: scaffold.firefoxLoaded, knownGaps: scaffold.knownGaps, deferred: scaffold.deferred } : null,
  }
}

if (STAGE === 'build') {
  phase('Builders')
  const PARTS = A.parts || ['p2', 'p3', 'p4']
  const MODEL = { p2: ['sonnet', 'xhigh'], p3: ['opus', 'high'], p4: ['opus', 'medium'] }
  agents += PARTS.length
  status(`build stage: launching ${PARTS.length} builders (${PARTS.join(', ')})`)
  const built = await parallel(PARTS.map(p => () =>
    agent(builderPrompt(p) + `\n\nAlso Write your final JSON to ${ROOT}/docs/critics/r${ROUND}/builder-${p}.json before returning it.`, { label: `build:${p}`, phase: 'Builders', model: MODEL[p][0], effort: MODEL[p][1] })
      .then(r => ({ part: p, res: parseJson(r) }))))
  const results = built.filter(Boolean)
  const done = results.filter(b => b.res && b.res.done === true).map(b => b.part)
  const notDone = PARTS.filter(p => !done.includes(p))
  if (notDone.length) log(`builders not done (unfinished or died): ${notDone.join(', ')}`)

  phase('Integration')
  agents += 1
  status('integration: launching 1 agent')
  const integ = parseJson(await agent(integrationPrompt + (notDone.length ? `\n\nNOTE: builders reported not done: ${notDone.join(', ')} (their stubs may remain; see their JSON).` : ''), { label: 'integration', phase: 'Integration', model: 'opus', effort: 'high' }))

  phase('Test harness')
  agents += 2
  status('test harness: launching unit + browser test writers (2 agents)')
  const [unit, browser] = await parallel([
    () => agent(unitTestsPrompt, { label: 'tests-unit', phase: 'Test harness', model: 'sonnet', effort: 'xhigh' }).then(parseJson),
    () => agent(browserTestsPrompt, { label: 'tests-browser', phase: 'Test harness', model: 'opus', effort: 'medium' }).then(parseJson),
  ])
  status('build stage done')
  return clip({
    stage: 'build', round: ROUND, cumulativeAgents: agents, spentOutputTokens: budget.spent(),
    builders: results.map(b => ({ part: b.part, done: b.res ? b.res.done : null, checks: b.res ? b.res.checks : null, publicSurfaceRequests: b.res ? b.res.publicSurfaceRequests : null, knownGaps: b.res ? b.res.knownGaps : null, deferred: b.res ? b.res.deferred : null })),
    notDone,
    integration: integ ? { done: integ.done, checks: integ.checks, e2e: integ.e2e, consoleErrors: integ.consoleErrors, recordings: integ.recordings, knownGaps: integ.knownGaps, deferred: integ.deferred } : null,
    unit: unit ? { done: unit.done, testCount: unit.testCount, failing: unit.failing, knownGaps: unit.knownGaps, deferred: unit.deferred } : null,
    browser: browser ? { done: browser.done, specs: browser.specs, soak: browser.soak, firefoxLive: browser.firefoxLive, openLatencyMs: browser.openLatencyMs, knownGaps: browser.knownGaps, deferred: browser.deferred } : null,
  }, 4)
}

return { error: `unknown stage ${STAGE}` }
