export const meta = {
  name: '7tv-cmd-judge-round',
  description: 'Critic and fix rounds of the 7tv-cmd run. stage=critics: one fresh harsh critic per part (p2 live replay, p3 and p4 blind A/B against the 7TV recording, p5 packaging, truth = ground-truth critic). stage=fix: fixers per part from the main loop briefs, deterministic checks, then the re-critics. stage=final: the fresh integration critic.',
  phases: [
    { title: 'Fixers', detail: 'stage=fix: one fixer per part with a decided brief' },
    { title: 'Checks', detail: 'stage=fix: one sonnet agent runs typecheck, build, lint, unit, browser tests, zip; fixes nothing' },
    { title: 'Critics', detail: 'fresh critics in parallel; the script computes the gate from their counts' },
    { title: 'Final', detail: 'stage=final: fresh integration critic on the zipped builds' },
  ],
}

// args: { stage: 'critics' | 'fix' | 'final', root, agentsSoFar, round, parts?: ['p2','p3','p4','p5','truth'], fixes?: { p2: brief, ... }, recritic?: ['p3', ...] }
const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const STAGE = A.stage || 'critics'
// root is REQUIRED in args: no machine path lives in the repo. args.identity lists the owner's
// identity strings the hygiene checks grep for; they are passed in, never written into this file.
const ROOT = A.root
if (!ROOT) throw new Error('args.root is required')
const IDENTITY = (A.identity || []).map(s => '"' + s + '"').join(', ') || '(none passed in args.identity: check at least for a Windows user name inside absolute paths)'
const ROUND = A.round || 1
let agents = A.agentsSoFar || 0

const PROJECT = `Project: 7tv-cmd, a cross-browser WebExtension (Manifest V3, Firefox first, Chrome second) that adds a popup to the Twitch chat input: when the user types "!" it lists the BOT commands available in THAT channel (fetched from the public command pages of Nightbot, StreamElements, Fossabot and the other providers recorded in PROVIDERS.md), filters as they type, and inserts the chosen command on Tab or Enter, the way the 7TV extension autocompletes emotes after ":". No Twitch login, no Twitch API credentials, no user setup. It must coexist with 7TV. Quality bar: 7TV's own emote autocomplete.`

const PREAMBLE = `Repo: ${ROOT} (run every command from there; node 22; Playwright 1.62.1 with Chromium, web-ext, esbuild, vitest and typescript are in node_modules). The contract is docs/SPEC.md; docs/LEDGER.md records the decisions taken between rounds and WINS over the spec; its "Rejected" items are out of scope and must not be raised again. Every file you write is ASCII only: no emoji, no Unicode icons, no smart quotes, no arrows other than "->". Shell rules: search with the Grep and Glob tools, read with Read, write with Write and Edit (never heredocs for files); never grep -P; delete only with a literal path; single-quote Windows paths in bash. In an .mjs script import repo modules by RELATIVE path or a file:///C:/... URL. Browser profiles go under ${ROOT}/.pw-profiles/ (gitignored), never the owner's browser profile; other critics run in parallel with you, so use ONLY profile directories named after your part (${ROOT}/.pw-profiles/<part>-critic-r${ROUND}*), never rec-ext, rec-7tv, browser-live or another agent's folder (Chromium refuses a profile another instance holds open). Seed each of your Chromium profiles by copying ${ROOT}/.pw-profiles/browser-live to it (cp -r with two literal paths) BEFORE the first launch: it holds the extension's storage.local with coconutb's commands cached at 16:45 today (valid until about 17:45), so coconutb costs no provider request until then; a fresh profile or an expired cache means one live fetch cycle, which is your one allowed cycle for that channel. Pass the profile to record.mjs as --profile <name> and to launchChromium / launchWithSevenTv as profileDir. Chromium through tools/pw/browser.mjs and tools/pw/seventv.mjs (7TV unpacked in vendor/7tv), Firefox through tools/ff/marionette.mjs (read its header first; send the first character and read it back before typing more). Live sites are READ-ONLY: no login, no account, no chat message (press Enter in a real chat only while a popup row is visible; clear the input with Control+A, Delete before leaving), no credentialed API; one request per provider per channel per hour outside the explicit replay you are told to do. Budget: about 40 tool calls, hard stop at 60 (every Read, Bash, Edit, Write and PNG view counts); past call 50 start nothing new, write what you have, and list the rest under "deferred". Your final message is EXACTLY ONE JSON object (no prose around it) in the shape given at the end of your prompt; keep it under 3 KB and put detail in the report file.`

const CRITIC_RULES = `You are a CRITIC with fresh context and a harsh eye. Inspect the REAL output: the code, the built extension, the recordings and the live behaviour you drive yourself. Never trust a builder's summary, README sentence or JSON claim; a claim you could not reproduce is a finding. Score only against the checklist and the contract (SPEC + LEDGER); a complaint listed under "Rejected" in docs/LEDGER.md or under "Accepted" for an earlier round is already decided: do not raise it, and if it still shows in the output, report it as "regression of accepted item X" instead. Read docs/critics/r${ROUND - 1}/ (when it exists) to see what the previous critic found and what the fixer claimed, and re-check each previous finding: fixed or not. Severity: critical = the objective fails for a real user (no popup, wrong channel, insertion breaks the message, 7TV or Twitch feature broken, console errors, metric missed); major = clearly worse than the reference on a checklist item or a spec rule broken; minor = polish. Every finding carries evidence (a path, a frame, a measurement, a command and its output) and a concrete fix the builder can apply. Counts in your JSON must match your report.`

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

const CRITIC_JSON = (part) => `Final JSON: {"part":"${part}","wins":0,"ties":0,"losses":0,"critical":0,"major":0,"minor":0,"findings":[{"id":"${part.toUpperCase()}-1","severity":"critical|major|minor","item":"<checklist item or spec section>","title":"<=80 chars","evidence":"<=200 chars","fix":"<=300 chars"}],"previous":{"fixed":[],"notFixed":[]},"report":"docs/critics/r${ROUND}/${part}-critic.md","toolCalls":0,"deferred":[]}`

function criticPrompt(part) {
  if (part === 'p2') return `${CRITIC_RULES} ${PROJECT}

${PREAMBLE}

Your part: PART 2, providers, merge, cache, background (SPEC sections 3, 4, 5, 9) and the facts in PROVIDERS.md and docs/providers/. Method:
1. Replay: write tools/dev/p2-replay-r${ROUND}.mjs that, for EVERY enabled adapter in src/providers/index.ts, runs fetchCommands with real fetch (User-Agent 7tv-cmd-research/0.1) ONCE for each of the three channels PROVIDERS.md lists for that provider plus its negative case (this is the one explicit live replay you are allowed; no loops, no retries), and in the same run runs parseCommands over every fixture in test/fixtures/<provider>/. Count MISMATCHES: live status not matching the documented expectation; live count differing from the documented count by more than 20 percent (channels change; say so) or by any amount from the fixture count when the fixture is from today; a parse that drops enabled commands or keeps disabled ones; a name with "!", uppercase, or whitespace; an alias equal to the name; a response over 300 chars or with a newline; a fetch to a URL the network capture in docs/providers/<provider>.network.json never showed; a request count above the documented chain length. Each mismatch is one LOSS.
2. Cache rule: read src/cache/cache.ts and test/unit for the TTL, negative caching, in-flight dedupe, refresh throttle and eviction; then PROVE the one-request-per-provider-per-channel-per-hour rule at runtime: load dist/chrome in Playwright on the popout chat of one of those channels, type "!" (clear it), reload the page, type "!" again, navigate to the channel page and back, and count the background's provider requests through the service worker (wrap fetch in the service worker via ctx.serviceWorkers()[0].evaluate before the first "!", or read a request log the background keeps; if neither is possible, count with context.route on the provider hosts if routing sees service worker requests in this Playwright, and say which method you used). More than one request per provider is a critical finding.
3. Timeouts and errors: with the service worker's fetch replaced by a never-resolving promise (evaluate in the worker), send commands:get and confirm the answer arrives within 2.5 s with status error; with fetch throwing, confirm status error is cached and no retry happens for a second get.
4. Host permissions: compare dist/chrome/manifest.json host_permissions with the hosts the adapters fetch and the CORS facts in docs/providers/*.md: a host fetched without ACAO:* and without a host permission is critical; a host permission for a host nothing fetches is major.
5. Action page: open chrome-extension://<id>/action/index.html in a tab that has the popout chat active; it must show the channel, each provider's status and count, and the Refresh button must send commands:refresh (check the 60 s throttle on a second click).
Write docs/critics/r${ROUND}/p2-critic.md with the replay table (provider, channel, documented count, fixture count, live status, live count, mismatch?), the cache proof with the method, the findings. wins/ties are 0 for this part; losses = mismatches + failed checks.
${CRITIC_JSON('p2')}`

  if (part === 'p3') return `${CRITIC_RULES} ${PROJECT}

${PREAMBLE}

Your part: PART 3, chat input integration (SPEC sections 1, 6, 10) judged in a BLIND A/B against 7TV's emote autocomplete on the behaviour items of the checklist in docs/reference-7tv-popup.md (trigger latency, filter latency, Up/Down wrap, Tab inserts, Enter inserts, Esc behaviour, closes on space and click outside, no flicker on filter) plus the spec rules only we have (word-start trigger, "!" mid-word, channel detection on every URL shape, SPA navigation, 7TV input support, "/" "@" ":" untouched, insertion equals the message that would be sent, zero console errors). Method:
1. Record ours yourself: npm run build, then npm run record -- --extensions dist/chrome --url https://www.twitch.tv/popout/coconutb/chat --trigger "!" --filter "b" --theme dark --out docs/critics/r${ROUND}/rec-ours-native and the same with --extensions dist/chrome,vendor/7tv --out docs/critics/r${ROUND}/rec-ours-with7tv (ours on 7TV's input). The reference recordings are docs/recordings/ref-7tv-colon-dark (and -light). Score each behaviour item win/tie/loss for OURS by comparing frames, timings.json and notes.md of both sides; a tie needs equal behaviour, a win needs a measurable advantage. The reference recording was made by another agent; if a reference frame is missing or unclear, re-record it with npm run record -- --extensions vendor/7tv --trigger ":" --filter "b" --out docs/critics/r${ROUND}/rec-ref and say so.
2. Drive the rest in Playwright with dist/chrome (and with 7TV loaded for a second pass): "!" mid-word ("ab!c") must not open; "!" after a space must; typing a space closes; Escape leaves the text; after Tab the input text is "!<name> " and the Slate draft matches (use the method docs/part3-notes.md describes, and judge whether that method really proves the sent message: if the builder only read the DOM text, that is a major finding); with the popup closed, dispatch synthetic keydown events for Enter, Tab, ArrowDown on the input and assert defaultPrevented is false; ":" opens 7TV's popup and ArrowDown moves inside it; "/" opens Twitch's command popup; "@" completion still works; navigate within the SPA from the channel page to another channel and back (click a link or history.pushState) and confirm the commands shown belong to the new channel; URL shapes: run channelFromUrl from the bundle or a unit script over the list in SPEC 6.1 plus 10 nasty inputs.
3. Firefox: tools/ff/marionette.mjs, temporary add-on from dist/firefox, same core path ("!", "b", ArrowDown, Tab, read the input); a Firefox-only failure is critical.
4. Console: collect page and service worker errors during all of the above; any error from this extension is critical.
Write docs/critics/r${ROUND}/p3-critic.md with the A/B table (item, ours, reference, verdict, evidence frame), the spec-rule checks, the findings. Count wins, ties, losses over the behaviour items.
${CRITIC_JSON('p3')}`

  if (part === 'p4') return `${CRITIC_RULES} ${PROJECT}

${PREAMBLE}

Your part: PART 4, the popup's look and the matcher (SPEC sections 7, 8) judged in a BLIND A/B against 7TV's emote popup on the visual items of the checklist in docs/reference-7tv-popup.md (prefix-before-substring ranking, highlight of the match, row density, position relative to the input, theme fit dark and light, selection visibility, scroll with many rows, no flicker on filter) and the spec's own rules (badge, description line with ellipsis, alias rows, shadow root isolation, 16 ms open/update). Method:
1. Record ours yourself: npm run build, then npm run record -- --extensions dist/chrome --url https://www.twitch.tv/popout/coconutb/chat --trigger "!" --filter "b" --theme dark --out docs/critics/r${ROUND}/rec-ours-dark and --theme light --out docs/critics/r${ROUND}/rec-ours-light. Reference: docs/recordings/ref-7tv-colon-dark and -light (re-record the reference with npm run record -- --extensions vendor/7tv --trigger ":" --filter "b" --out docs/critics/r${ROUND}/rec-ref-<theme> if a frame you need is missing). Put the two "02-trigger" frames side by side (Read both) and likewise 03, 05 and 07; compare dom.json numbers: gap above the input, width vs input width, row height, font size, colours, radius, shadow, selected row contrast, highlight treatment, rows visible before scroll. Score each visual item win/tie/loss for ours.
2. Matching: run node tools/dev/match-check.mjs (or write your own over the built match module) with 15 queries over a list that has exact, prefix, substring, alias-only and mixed-case cases; assert the order rules of SPEC 8 and the highlight ranges; a wrong order is major, a missing highlight is major.
3. Live list sanity: on the popout chat with "!" open, count rows and compare with PROVIDERS.md's count for that channel (merged, deduped); scroll to the end with ArrowUp from the top (wrap) and confirm the selected row scrolls into view.
4. Isolation and robustness: with 7TV loaded, open ours and confirm no 7TV style bleeds in and ours does not change 7TV's input or popup styles (compare computed styles of 7TV's input before and after); open with 150 commands (seed the cache through the service worker with a synthetic list) and measure open and update time with performance.now around the tvcmd events; both under 16 ms or it is a finding.
Write docs/critics/r${ROUND}/p4-critic.md with the A/B table (item, ours, reference, verdict, evidence frames), the matcher check output, the measurements, the findings.
${CRITIC_JSON('p4')}`

  if (part === 'p5') return `${CRITIC_RULES} ${PROJECT}

${PREAMBLE}

Your part: PART 5, manifest, build, packaging, README and hygiene (SPEC sections 9, 11; the task's rules: web-ext lint clean, manifest valid as a Firefox temporary add-on and as an unpacked Chromium extension, no remote code, host permissions limited to twitch.tv and the provider API domains actually used, README with install steps, ASCII-only sources, no emoji or Unicode icons anywhere, Windows-friendly npm scripts). Method, each a pass/fail check (a fail is one LOSS):
1. rm -rf is not yours to run: use literal paths. Delete dist with a literal path (rm -r '${ROOT}/dist'), run npm run build, npm run lint (zero errors; list warnings), npm run zip; unzip each zip into ${ROOT}/.pw-profiles/zip-check/<browser> with tar or Expand-Archive and diff the listing against dist/<browser>: the zips must contain exactly the dist files.
2. Load the unzipped chrome build unpacked in Playwright Chromium (tools/pw/browser.mjs with that directory) on the popout chat: service worker starts, content script runs ("!" opens), no manifest warnings in chrome://extensions (open it in a tab and read the card's text for errors). Load the firefox zip as a temporary add-on through tools/ff/marionette.mjs installAddon('<zip path>'): installs, "!" opens; read what Firefox says about host permissions (execute browser.permissions.getAll is not reachable from a page; instead check whether the background's fetch to a provider succeeds by reading the popup rows, and note the manifest's host_permissions list).
3. Manifest audit on both dist manifests: permissions and host_permissions vs what the code uses (Grep dist/*/background.js and content.js for fetch( targets and runtime APIs); no content_security_policy loosening, no remote scripts, no web_accessible_resources, browser_specific_settings only in the Firefox manifest, minimum_chrome_version only in Chrome's, version equals package.json.
4. Hygiene: Grep the whole repo (excluding node_modules, vendor, .pw-profiles, dist, web-ext-artifacts, docs/recordings) for non-ASCII bytes with the Grep tool pattern [^\\x00-\\x7F]; any hit in src, test, scripts, tools, README, PROVIDERS, docs/*.md is a loss (fixtures under test/fixtures are third-party data and are exempt but listed). Grep for the owner's identity strings ${IDENTITY} anywhere outside .git, node_modules, .pw-profiles and vendor: a hit is critical. Grep src and scripts for eval(, new Function, innerHTML: a hit with third-party text is critical.
5. README: follow its install steps literally as written (Firefox temporary add-on path, Chromium unpacked path, the npm scripts): every step that does not work as written is a loss. The "Verified" section must cite a screenshot or recording path per line that exists on disk.
6. Scripts: every npm script runs on Windows from a plain cmd-less node call (no &&, no bash-only syntax in package.json scripts).
Write docs/critics/r${ROUND}/p5-critic.md with the check table and findings; wins/ties 0, losses = failed checks.
${CRITIC_JSON('p5')}`

  // truth
  return `${CRITIC_RULES} ${PROJECT}

${PREAMBLE}

Your part: the GROUND-TRUTH critic. For EVERY claim the deliverable asserts, find the recorded evidence or fail it. Fact sources (the only acceptable evidence): docs/gate-7tv.md and .json, docs/providers/*.md, *.network.json, _summary-*.json, _discovery.md, test/fixtures/**, docs/recordings/**, docs/reference-7tv-popup.md, docs/SPEC.md, docs/LEDGER.md, docs/part3-notes.md, docs/integration-r*.md, docs/critics/**, test/unit/**, test/browser/**, and the outputs you reproduce yourself. Method:
1. Enumerate every artifact this run produced that bears on the deliverable: list docs/, test/, tools/, scripts/, PROVIDERS.md, README.md with one line each (purpose, produced by which stage). Compare that list with the fact sources README and PROVIDERS.md point at: a fact base that names fewer files than exist, or a doc that says "do not re-read X" without naming a substitute that contains X, is a finding.
2. Extract claims: every sentence in README.md, PROVIDERS.md and docs/integration-r${ROUND}.md that asserts a fact (an endpoint, a URL pattern, a response shape, a count, a latency, "works with 7TV", "works in Firefox", "no console errors", "cached for an hour", "supports provider X", an install step). For each: the evidence file (fixture, recording frame, test, network capture, critic measurement) or FAIL. A FAIL is a loss; a FAIL on a claim about the core objective ("!" shows the channel's commands, insertion, 7TV coexistence, Firefox) is critical.
3. Spot-check 8 claims by reproduction (a fixture's count, an endpoint URL in the network capture, one recorded timing, one README install step, the Firefox claim through tools/ff/marionette.mjs, one provider's negative case, the lint claim, the ASCII claim).
4. For every FAIL propose the re-scope: the exact sentence that replaces the claim with what was actually observed, or "cut".
Write docs/critics/r${ROUND}/truth-critic.md: the artifact list, the claim table (claim, file, evidence, PASS/FAIL), the reproductions, the findings. wins/ties 0; losses = FAIL count.
${CRITIC_JSON('truth')}`
}

const CRITIC_MODEL = { p2: ['opus', 'high'], p3: ['opus', 'high'], p4: ['opus', 'high'], p5: ['sonnet', 'high'], truth: ['opus', 'high'] }

async function runCritics(parts) {
  phase('Critics')
  agents += parts.length
  status(`critics: launching ${parts.length} (${parts.join(', ')})`)
  const out = await parallel(parts.map(p => () =>
    agent(criticPrompt(p) + `\n\nAlso Write your final JSON to ${ROOT}/docs/critics/r${ROUND}/${p}-critic.json before returning it.`, { label: `critic:${p}`, phase: 'Critics', model: CRITIC_MODEL[p][0], effort: CRITIC_MODEL[p][1] })
      .then(r => ({ part: p, res: parseJson(r) }))))
  const results = out.filter(Boolean)
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)
  const summary = results.map(c => {
    const r = c.res || {}
    const losses = num(r.losses), critical = num(r.critical), major = num(r.major), minor = num(r.minor)
    return { part: c.part, wins: num(r.wins), ties: num(r.ties), losses, critical, major, minor, gate: losses === 0 && critical === 0, findings: (r.findings || []).map(f => ({ id: f.id, severity: f.severity, item: f.item, title: f.title })), previous: r.previous, report: r.report, deferred: r.deferred, dead: !c.res }
  })
  const missing = parts.filter(p => !results.find(c => c.part === p && c.res))
  return { summary, missing, allGate: missing.length === 0 && summary.every(s => s.gate) }
}

function fixerPrompt(part, brief) {
  const OWN = {
    p2: 'src/providers/**, src/cache/**, src/background/**, src/action/**, src/providers/hosts.json',
    p3: 'src/channel/**, src/content/input/**, src/content/token.ts, src/content/controller.ts, src/content/index.ts, docs/part3-notes.md',
    p4: 'src/content/popup/**, src/match/**, tools/dev/popup-dev.*, tools/dev/match-check.mjs',
    p5: 'src/manifest.json, scripts/build.mjs, scripts/zip.mjs, package.json scripts, tsconfig.json, README.md, PROVIDERS.md, docs/integration-r*.md',
    tests: 'test/unit/**, test/browser/**, test/helpers/**, playwright.config.ts, vitest.config.ts',
  }
  return `You are the ${part.toUpperCase()} FIXER for round ${ROUND}. ${PROJECT}

${PREAMBLE}

Your files: ${OWN[part] || part}. Other fixers are editing other parts at the same time; touch nothing outside your files (a cross-part change you need is listed in your brief if the main loop decided it; otherwise put it in "publicSurfaceRequests"). Read docs/SPEC.md (your sections), docs/LEDGER.md (the round ${ROUND} decisions: what is accepted to fix and what is rejected), the critic report named in the brief, and the current code.

Your brief (decided by the main loop; do these, in this order, nothing else):
${brief}

Work: fix each item, verify each fix against the critic's evidence (re-run the critic's command, re-record the frame, re-run the test), and before returning make npm run typecheck, npm run build and npm test exit 0 (and npm run lint when you touched the manifest or build). Do not re-architect; do not "improve" beyond the brief. Record in docs/critics/r${ROUND}/fix-${part}.md what you changed per item and how you verified it.

Final JSON per SPEC section 12 with "part":"${part}"; add "items":[{"id":"<finding id>","status":"fixed|partial|not-fixed","how":"<=120 chars"}].`
}

const checksPrompt = `You are the CHECKS runner for round ${ROUND}: mechanical, fix nothing. ${PROJECT}

${PREAMBLE}

Run, from ${ROOT}, each of these and record exit code and the key output lines (redirect each to ${ROOT}/docs/critics/r${ROUND}/checks-<name>.log and read the tail): npm run typecheck; npm run build; npm run lint; npm test; npm run test:browser (allow up to 8 minutes; use run_in_background and poll the log); npm run zip; node test/browser/soak.mjs --minutes 1; node test/browser/soak.mjs --minutes 1 --seventv (when vendor/7tv exists); node test/browser/firefox-live.mjs. Then Grep src, test, scripts, tools, README.md, PROVIDERS.md, docs (not docs/recordings) for non-ASCII with the pattern [^\\x00-\\x7F] and count hits per file. Write docs/critics/r${ROUND}/checks.md with a table (check, exit code, summary line, log path).

Final JSON: {"checks":{"typecheck":"pass|fail","build":"pass|fail","lint":"pass|fail","unit":"pass|fail","browser":"pass|fail","zip":"pass|fail","soak":"pass|fail","soak7tv":"pass|fail|skipped","firefoxLive":"pass|fail"},"unitCount":0,"browserCount":{"passed":0,"failed":0},"nonAscii":[{"file":"","hits":0}],"failing":["<test or step names>"],"toolCalls":0}`

const finalPrompt = `${CRITIC_RULES} ${PROJECT}

${PREAMBLE}

You are the FINAL INTEGRATION CRITIC: fresh eyes on the complete artifact as a user would receive it. Method:
1. Delete the dist folder with a literal path, npm run build, npm run zip. Unzip web-ext-artifacts/7tv-cmd-chrome-*.zip into ${ROOT}/.pw-profiles/final/chrome and load THAT directory unpacked in Playwright Chromium (tools/pw/browser.mjs). Install web-ext-artifacts/7tv-cmd-firefox-*.zip as a temporary add-on through tools/ff/marionette.mjs installAddon(<zip path>).
2. Pick two real channels from PROVIDERS.md (coconutb and one other with a different provider mix). For each, in Chromium without 7TV, Chromium with 7TV (tools/pw/seventv.mjs), and Firefox: reject the cookie banner, focus the input, "!" -> the popup shows THAT channel's commands (compare the row names with the fixtures or the live provider list you fetch once); "!b" -> narrowed, prefix matches before substring matches; ArrowDown; Tab -> the input holds "!<name> " and nothing was sent; Escape path; "!" mid-word does not open; with 7TV loaded, ":" still opens 7TV's popup and "/" still opens Twitch's. Screenshot every state to docs/critics/final/*.png and Read them. Compare the popup with docs/recordings/ref-7tv-colon-dark/frames/02-trigger.png for fit.
3. Nothing else changed: with the popup closed dispatch synthetic keydown Enter/Tab/ArrowDown/Escape on the input and assert none is defaultPrevented; compare the input's computed style and the chat DOM around it with and without our extension (same page, two profiles) for differences we caused.
4. Soak: node test/browser/soak.mjs --minutes 5 and --minutes 5 --seventv; both must report zero errors from this extension.
5. Artifact consistency: README claims vs what you saw (the README paragraph about the owner's own Firefox session is a main-loop record, docs/LEDGER.md "Owner session"; it is outside your reach and is not a finding); PROVIDERS.md provider list vs src/providers/index.ts vs manifest host_permissions; version in package.json, both manifests and the zip names; lint clean (npm run lint); ASCII clean (Grep [^\\x00-\\x7F] over src, test, scripts, tools, README.md, PROVIDERS.md, docs/*.md); no owner identity strings (${IDENTITY}) outside .git, node_modules, .pw-profiles and vendor; install steps in README work as written.
6. Fit with the objective: on a channel that uses at least one supported bot, "!" plus characters produces a correct, fast suggestion list, with no login, no credentials, no setup, coexisting with 7TV and with the native input. Say in one line per browser whether a user installing this today would get that.
Write docs/critics/final/final-critic.md with the per-browser per-channel table, measurements (open latency from timings or the tvcmd event), the soak results, the consistency checks, and the findings.
Final JSON: {"part":"final","critical":0,"major":0,"minor":0,"perBrowser":{"chromium":"pass|fail","chromiumWith7tv":"pass|fail","firefox":"pass|fail"},"soak":{"plain":"pass|fail","with7tv":"pass|fail"},"consistency":{"readme":"pass|fail","providers":"pass|fail","lint":"pass|fail","ascii":"pass|fail","identity":"pass|fail","install":"pass|fail"},"findings":[{"id":"F-1","severity":"critical|major|minor","title":"","evidence":"","fix":""}],"report":"docs/critics/final/final-critic.md","toolCalls":0,"deferred":[]}`

// ---------------------------------------------------------------- run
if (STAGE === 'critics') {
  const parts = A.parts || ['p2', 'p3', 'p4', 'p5', 'truth']
  const r = await runCritics(parts)
  status('critics done')
  return clip({ stage: 'critics', round: ROUND, cumulativeAgents: agents, spentOutputTokens: budget.spent(), allGate: r.allGate, missing: r.missing, parts: r.summary }, 12)
}

if (STAGE === 'fix') {
  const fixes = A.fixes || {}
  const fixParts = Object.keys(fixes)
  const FIX_MODEL = { p2: ['sonnet', 'xhigh'], p3: ['opus', 'high'], p4: ['opus', 'medium'], p5: ['sonnet', 'xhigh'], tests: ['sonnet', 'xhigh'] }
  phase('Fixers')
  agents += fixParts.length
  status(`fixers: launching ${fixParts.length} (${fixParts.join(', ')})`)
  const fixed = await parallel(fixParts.map(p => () =>
    agent(fixerPrompt(p, fixes[p]), { label: `fix:${p}`, phase: 'Fixers', model: (FIX_MODEL[p] || ['sonnet', 'xhigh'])[0], effort: (FIX_MODEL[p] || ['sonnet', 'xhigh'])[1] })
      .then(r => ({ part: p, res: parseJson(r) }))))
  const fixSummary = fixed.filter(Boolean).map(f => ({ part: f.part, done: f.res ? f.res.done : null, items: f.res ? f.res.items : null, publicSurfaceRequests: f.res ? f.res.publicSurfaceRequests : null, deferred: f.res ? f.res.deferred : null }))

  let checks = null
  if (A.checks !== false) {
    phase('Checks')
    agents += 1
    status('checks: launching 1 mechanical runner')
    checks = parseJson(await agent(checksPrompt, { label: 'checks', phase: 'Checks', model: 'sonnet', effort: 'medium' }))
  }

  let critics = null
  if (A.recritic && A.recritic.length) critics = await runCritics(A.recritic)
  status('fix stage done')
  return clip({ stage: 'fix', round: ROUND, cumulativeAgents: agents, spentOutputTokens: budget.spent(), fixers: fixSummary, checks: checks ? { checks: checks.checks, unitCount: checks.unitCount, browserCount: checks.browserCount, nonAscii: checks.nonAscii, failing: checks.failing } : null, critics: critics ? { allGate: critics.allGate, missing: critics.missing, parts: critics.summary } : null }, 10)
}

if (STAGE === 'final') {
  phase('Final')
  agents += 1
  status('final: launching the integration critic')
  const f = parseJson(await agent(finalPrompt, { label: 'final-critic', phase: 'Final', model: 'opus', effort: 'high' }))
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)
  const gate = !!f && num(f.critical) === 0 && f.perBrowser && Object.values(f.perBrowser).every(v => v === 'pass')
  status('final done')
  return { stage: 'final', round: ROUND, cumulativeAgents: agents, spentOutputTokens: budget.spent(), gate, result: f ? { critical: num(f.critical), major: num(f.major), minor: num(f.minor), perBrowser: f.perBrowser, soak: f.soak, consistency: f.consistency, findings: (f.findings || []).map(x => ({ id: x.id, severity: x.severity, title: x.title })), report: f.report, deferred: f.deferred } : null }
}

return { error: `unknown stage ${STAGE}` }
