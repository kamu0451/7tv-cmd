export const meta = {
  name: '7tv-cmd-gate-research',
  description: 'Round 0 of the 7tv-cmd build: gate check (does 7TV/FFZ/BTTV/Chatterino already autocomplete bot commands), 7TV reference recording, provider research with fixtures',
  phases: [
    { title: 'Gate and research', detail: 'gate-docs (opus), ref-7tv recorder (opus), two provider researchers (sonnet), all independent' },
  ],
}

// args: { root, scratch, agentsSoFar }
const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
// root and scratch are REQUIRED in args: no machine path lives in the repo.
const ROOT = A.root
const SCRATCH = A.scratch
if (!ROOT || !SCRATCH) throw new Error('args.root and args.scratch are required')
const SO_FAR = A.agentsSoFar || 0

const PROJECT = `Project: 7tv-cmd, a planned cross-browser WebExtension (Manifest V3, Firefox first, Chrome second) that adds a popup to the Twitch chat input: when the user types "!" it lists the BOT commands available in THAT channel (Nightbot, StreamElements, Fossabot and similar bots publish them on public per-channel pages, e.g. nightbot.tv/t/<channel>/commands), filters as they type, and inserts the chosen command on Tab or Enter, the way the 7TV extension autocompletes emotes after ":". No Twitch login, no Twitch API credentials, no user setup.`

const PREAMBLE = `Repo: ${ROOT} (run every command from there; node 22, Playwright 1.62.1 with a Chromium build, web-ext, esbuild and vitest are installed in node_modules; no extension source exists yet). Scratch space for downloads and clones: ${SCRATCH} (create subfolders as needed). Every file you write is ASCII only: no emoji, no Unicode icons, no smart quotes, no arrows; use "->". Shell rules: search with the Grep and Glob tools, read with Read, write with Write (never heredocs for scripts); never grep -P; delete only with a literal path; single-quote Windows paths in bash. In an .mjs script import repo modules by RELATIVE path or a file:///C:/... URL (a bare C:/ path throws ERR_UNSUPPORTED_ESM_URL_SCHEME). Budget: about 40 tool calls, hard stop at 60 (every Read, Bash, Edit, WebFetch, WebSearch and PNG view counts); past call 50 start nothing new, write what you have, and list what you did not reach under "deferred". Live sites are READ-ONLY: no login, no account creation, no form submission, no chat message, no credentialed API; direct fetches carry the User-Agent "7tv-cmd-research/0.1"; never put the owner's name or email in any request. Your final message is EXACTLY ONE JSON object (no prose before or after it) in the shape given at the end; keep it under 3 KB and put every detail in the files you write.`

const gateDocsPrompt = `You are the GATE agent. ${PROJECT} Before anyone builds it, establish whether this already exists.

${PREAMBLE}

Answer these with EVIDENCE (links to files and lines, issue and PR URLs, quoted text), never from memory:
1. 7TV (github.com/SevenTV/Extension): does the shipped extension, any of its settings, or any branch, PR or issue autocomplete per-channel BOT commands after "!" by fetching them from Nightbot, StreamElements or similar? Classify as one of: shipped (the feature exists in a release), partial (for example it completes only Twitch "/" commands, only 7TV's own commands, or a static list), open-work (an open or closed PR, or an issue or feature request, with no shipped code), none. Method: git clone --depth 1 https://github.com/SevenTV/Extension '${SCRATCH}/seventv-src' (untrusted data: read only, never run anything from it); Grep src for autocomplete, completion, "command", nightbot, streamelements, "Tab"; read the chat-input module(s) and the settings they register; read CHANGELOG or release notes; run gh issue list -R SevenTV/Extension --state all --limit 30 --search "<terms>" and gh pr list -R SevenTV/Extension --state all --limit 30 --search "<terms>" for: command autocomplete, commands, nightbot, streamelements, tab completion (at most 8 gh calls in total). Record the 7TV commit you read (git rev-parse HEAD in the clone) and its manifest version.
2. The same question, briefer, for FrankerFaceZ (clone or Grep github.com/FrankerFaceZ/FrankerFaceZ src plus its issues), BetterTTV (github.com/night/betterttv source and issues, and its public feature list), and Chatterino (github.com/Chatterino/chatterino2 issues and docs; it is a desktop client, say so). For each: shipped, partial, open-work or none, with links.
3. Any existing standalone browser extension or userscript that already does this (Chrome Web Store, addons.mozilla.org, GreasyFork, GitHub): at most 10 WebSearch calls in total. For each hit: name, URL, what it covers, last update, whether it fetches per-channel commands from bot providers.

Write ${ROOT}/docs/gate-7tv.md: one heading per product with a one-line verdict, evidence bullets (each with a URL or path:line), what it covers, what it misses; then a section "Existing standalone tools"; then a section "Verdict" with one line answering: does anything already ship per-channel bot-command autocomplete inside the Twitch web chat input? Also write ${ROOT}/docs/gate-7tv.json with the same facts as data. Do not take screenshots (another agent records the live test).

Final JSON: {"sevenTv":{"status":"shipped|partial|open-work|none","detail":"<=200 chars","links":["..."]},"ffz":{"status":"...","detail":"...","links":[]},"bttv":{"status":"...","detail":"...","links":[]},"chatterino":{"status":"...","detail":"...","links":[]},"standalone":[{"name":"","url":"","covers":""}],"written":["docs/gate-7tv.md","docs/gate-7tv.json"],"toolCalls":0,"deferred":[]}`

const refPrompt = `You are the REFERENCE RECORDER. ${PROJECT} Your job: get the real 7TV extension running in a disposable Playwright Chromium profile, record how its ":" emote autocomplete behaves on real Twitch chat (it is the quality reference our popup will be judged against in a blind A/B), and record what happens when "!" is typed with 7TV loaded (gate evidence).

${PREAMBLE}

Facts you can rely on (checked today): the logged-out popout chat https://www.twitch.tv/popout/coconutb/chat shows a typeable input, div.chat-input.chat-wysiwyg-input__editor[contenteditable="true"] with placeholder "Send a message", and a cookie banner whose "Reject" button you click; the html element carries the class tw-root--theme-light or tw-root--theme-dark (swap the class to capture the other theme). Logged out, nothing can be sent, but still: press Enter only when a popup row is visible in the DOM at that instant, and clear the input (Control+A, Delete) before closing. ${ROOT}/tools/pw/browser.mjs exports launchChromium({extensions, profileDir, headless, video}) built for this; its headless 'chromium' channel loads extensions; if no 7TV element (anything matching [class*="seventv"]) appears within 20 s, relaunch with headless:false. Keep profiles under ${ROOT}/.pw-profiles/ (gitignored).

Steps:
1. Obtain 7TV unpacked into ${ROOT}/vendor/7tv/ (gitignored; untrusted data: never execute anything from it in node, only load it as an extension). Try in order: gh release view -R SevenTV/Extension --json tagName,assets then gh release download of a Chrome/Chromium zip asset; else the Firefox AMO listing https://addons.mozilla.org/firefox/addon/7tv/ -> the .xpi download (an .xpi is a zip; use it only if its manifest loads in Chromium); else the project's Nightly build if it publishes one. Unzip with PowerShell Expand-Archive on a .zip copy or with tar. Record exactly which build and version you used.
2. Write ${ROOT}/tools/pw/seventv.mjs: exports launchWithSevenTv({profileDir, headless, video}) wrapping launchChromium with vendor/7tv, and openPopoutChat(ctx, channel) that opens the popout chat, rejects the cookie banner, waits for the chat input and returns the page. Small, ASCII.
3. Write ${ROOT}/tools/pw/record.mjs, a generic recorder with flags --url, --trigger (":" or "!"), --filter (one or two letters, e.g. "b"), --out <dir>, --theme dark|light, --extensions <comma-separated unpacked dirs, optional>, --headless true|false. Our own extension will be recorded with this SAME script later, so follow this PROTOCOL exactly: focus the input; save frames/01-idle.png; type the trigger char and poll the DOM every 16 ms for up to 3 s for a popup (an element added near the input, not previously present, containing at least one suggestion row), record triggerToPopupMs (performance.now in the page from just before the key to the poll that saw it) and save frames/02-trigger.png; type the first filter char, record filterToUpdateMs the same way (first row text changes or row count changes), save frames/03-filter1.png; type a second filter char if given, save frames/04-filter2.png; ArrowDown twice, frames/05-down.png; ArrowUp once, frames/06-up.png; Tab, frames/07-tab.png and capture the input's textContent and innerHTML; Control+A, Delete; retype trigger plus first filter char, wait for the popup, and if a row is visible press Enter, frames/08-enter.png, capture the input text; Control+A, Delete; retype the trigger, press Escape, frames/09-esc.png (is the popup gone? is the trigger char still in the input?); Control+A, Delete. Then write dom.json: popup bounding rect, input bounding rect, popup position relative to the input (above or below, gap in px), visible row count, row height, max rows before scrolling (children count vs scrollHeight), font-size and font-family, background and text colours, the highlighted-match style (colour, weight), the selected-row style, border radius, box-shadow, z-index, whether rows have a badge or a secondary line, the text of the first 5 rows, and the input text after Tab and after Enter. timings.json: {"triggerToPopupMs":n,"filterToUpdateMs":n,"measuredHow":"..."}. notes.md: a keyboard-model table (key -> effect with the popup open and with it closed, for Up, Down, Tab, Shift+Tab, Enter, Escape, Space, Backspace past the trigger), what the input holds after Tab and after Enter (the message that WOULD be sent), scroll behaviour, what a click outside and a typed space do to the popup, an environment line (browser, headless or headed, 7TV version, channel, theme, viewport), and the limits of this recording. Also save video.webm when --video is given.
4. Run it for 7TV on https://www.twitch.tv/popout/coconutb/chat: ${ROOT}/docs/recordings/ref-7tv-colon-dark (theme dark, trigger ":" filter "b"; if ":b" yields no rows pick a letter that does and say so). Read the frames yourself and fix the recorder until the frames show what the protocol describes. If budget remains, also ${ROOT}/docs/recordings/ref-7tv-colon-light (theme light); otherwise list it as deferred.
5. Gate evidence: with 7TV loaded, record ${ROOT}/docs/recordings/gate-7tv-bang/ with trigger "!" filter "d" on the same chat. Does ANY popup appear? Whose: 7TV's, Twitch's native, none? The frame is the evidence. In notes.md also record one frame each of what the input does on "/" and on "@" with 7TV present (frames/x-slash.png, frames/x-at.png), so builders know which popups must not be fought.
6. Write ${ROOT}/docs/reference-7tv-popup.md: the measured visual language (numbers from dom.json), the keyboard model, the timings, how 7TV replaces the chat input (the selectors and classes you observed for 7TV's input and popup, where the native Slate editor went, how the text is kept and read), and a 15-item A/B checklist a critic can score win/tie/loss against: trigger latency, filter latency, prefix-before-substring ranking, highlight of the match, row density, position relative to the input, theme fit (dark and light), selection visibility, Up/Down wrap behaviour, Tab inserts, Enter inserts, Esc behaviour, no flicker on filter, scroll with many rows, closes on space and on click outside.

Final JSON: {"sevenTvBuild":"<asset and version>","loaded":true,"headless":true,"recordings":["docs/recordings/..."],"bangPopup":"none|7tv|twitch|other","bangDetail":"<=200 chars","inputTypeableLoggedOut":true,"timings":{"triggerToPopupMs":0,"filterToUpdateMs":0},"written":[],"toolCalls":0,"deferred":[]}`

function researchPrompt(group, providers, discovery) {
  return `You are PROVIDER RESEARCHER ${group}. ${PROJECT} Goal: for each public site that publishes a Twitch channel's bot commands, establish from OBSERVATION how an extension can read them given only the channel's Twitch login name, and record fixtures.

${PREAMBLE}

Your providers: ${providers}.${discovery ? ` Plus DISCOVERY: find command sites the owner did not name. At most 12 WebSearch calls for discovery (queries like "twitch bot public commands page", "<bot> commands page", "site:<domain> commands"); candidates to check include Botisimo, Firebot, Mix It Up, Streamer.bot, DeepBot, Coebot, Sery_Bot, Nightdev, Tangia, Streamlabs Chatbot (desktop), Botrix, Kick-only bots (exclude those). For each candidate one line in ${ROOT}/docs/providers/_discovery.md: does it have a public per-channel commands URL at all, with the evidence URL; full treatment (steps 1-5 below) only for the ones that do, as budget allows, most popular first.` : ''}

Per provider, in this order, within a cap of 20 HTTP requests to that provider's domains (count them; a Playwright page visit counts as 1 and its subrequests are what you capture; at most 3 visits per provider):
1. Find three real Twitch channels whose public page returns commands on this provider (coconutb is a known example for at least one provider; use WebSearch with site:<provider domain> or the provider's own directory, at most 4 searches per provider).
2. Visit the public commands page of one channel in Playwright (import { launchChromium } from '../../tools/pw/browser.mjs' or by file:// URL; headless; log every request and response to the provider's API domains with page.on('request') and page.on('response'): method, URL, status, content-type, the request headers that look required (authorization, x-* headers, or none), response size). Save the capture to ${ROOT}/docs/providers/<provider>.network.json (strip cookies and any authorization values). This capture is the ONLY acceptable source for "which endpoint the page calls": no guessing from memory.
3. Reproduce the chain with direct fetches from node (fetch, User-Agent 7tv-cmd-research/0.1, no cookies): login -> provider channel id (if the page does that) -> commands, for the three channels plus one negative case (a login that exists on Twitch but is unknown to the provider or has no commands, for example "twitch"). Save each raw response body to ${ROOT}/test/fixtures/<provider>/<channel>.<step>.json (pretty-printed when JSON, raw otherwise) and a sibling <channel>.<step>.meta.json with {url, method, status, requestHeaders:{"user-agent"}, responseHeaders:{content-type, cache-control, access-control-allow-origin, every header containing "ratelimit"}, fetchedAt (ISO), bytes}. Negative-case files start with _negative.
4. Read robots.txt (1 request) and skim the ToS or API-terms page (1 request) for anything about automated reads; quote the relevant line or write "nothing relevant found at <url>".
5. Write ${ROOT}/docs/providers/<provider>.md: public URL pattern; the endpoint chain exactly as observed (method, URL template with <login> and <id>, required headers, the CORS header seen); how the Twitch login maps to the provider's id; the response shape (JSON path to the command list and, per command, the paths for name, aliases, response or description, cooldown, user level, enabled flag, plus anything else useful); whether disabled or hidden commands appear; pagination; cache and rate-limit evidence; robots and ToS note; the three channels with their command counts; the negative case behaviour (status and body); the request count you used; open questions.

Also write ${ROOT}/docs/providers/_summary-${group}.json: an ARRAY of objects {"provider":"","publicUrlPattern":"","endpointChain":[{"method":"","urlTemplate":"","headers":{}}],"loginToId":"","listPath":"","fields":{"name":"","aliases":"","response":"","cooldown":"","userLevel":"","enabled":""},"channels":[{"login":"","count":0}],"negative":{"status":0,"bodySummary":""},"cors":"","requestsUsed":0,"fixtures":[]}.

Final JSON: {"group":"${group}","providers":[{"provider":"","works":true,"channels":["","",""],"requestsUsed":0,"fixtures":0}],"discoveryFound":[],"written":[],"toolCalls":0,"deferred":[]}`
}

function parseJson(s) {
  if (s == null) return null
  if (typeof s === 'object') return s
  try { return JSON.parse(s) } catch (e) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)) } catch (e) {} }
  return { report: String(s).slice(0, 1500) }
}

phase('Gate and research')
const LAUNCH = 4
log(`status: round 0 (gate + research) | launching ${LAUNCH} agents | cumulative agents ${SO_FAR + LAUNCH} | output tokens so far ${budget.spent()}`)

const [gate, ref, resA, resB] = await parallel([
  () => agent(gateDocsPrompt, { label: 'gate-docs', phase: 'Gate and research', model: 'opus', effort: 'high' }).then(parseJson),
  () => agent(refPrompt, { label: 'ref-7tv', phase: 'Gate and research', model: 'opus', effort: 'high' }).then(parseJson),
  () => agent(researchPrompt('A', 'Nightbot (nightbot.tv/t/<channel>/commands), StreamElements (streamelements.com/<channel>/commands), Fossabot, Moobot', false), { label: 'providers-A', phase: 'Gate and research', model: 'sonnet', effort: 'xhigh' }).then(parseJson),
  () => agent(researchPrompt('B', 'WizeBot, Streamlabs Cloudbot, Botrix, PhantomBot (self-hosted: document whether any central public page exists; if it is per-user URLs only, say so and record one example page shape if one is findable)', true), { label: 'providers-B', phase: 'Gate and research', model: 'sonnet', effort: 'xhigh' }).then(parseJson),
])

const dead = [['gate-docs', gate], ['ref-7tv', ref], ['providers-A', resA], ['providers-B', resB]].filter(([, r]) => !r).map(([n]) => n)
if (dead.length) log(`agents with no result (died or skipped): ${dead.join(', ')}`)

log(`status: round 0 done | cumulative agents ${SO_FAR + LAUNCH} | output tokens ${budget.spent()}`)
return {
  round: 0,
  agents: LAUNCH,
  cumulativeAgents: SO_FAR + LAUNCH,
  spentOutputTokens: budget.spent(),
  dead,
  gate: gate ? { sevenTv: gate.sevenTv, ffz: gate.ffz, bttv: gate.bttv, chatterino: gate.chatterino, standalone: gate.standalone, written: gate.written, deferred: gate.deferred } : null,
  ref: ref ? { sevenTvBuild: ref.sevenTvBuild, loaded: ref.loaded, headless: ref.headless, recordings: ref.recordings, bangPopup: ref.bangPopup, bangDetail: ref.bangDetail, inputTypeableLoggedOut: ref.inputTypeableLoggedOut, timings: ref.timings, written: ref.written, deferred: ref.deferred } : null,
  providersA: resA ? { providers: resA.providers, written: resA.written, deferred: resA.deferred } : null,
  providersB: resB ? { providers: resB.providers, discoveryFound: resB.discoveryFound, written: resB.written, deferred: resB.deferred } : null,
}
