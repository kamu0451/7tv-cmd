# Pre-publish audit: security and privacy of the shipped code

Scope: read docs/SPEC.md in full, docs/LEDGER.md (final, round 2, round 1 sections and the S8/S20
entries), every file under src/ (24 files), both built manifests (dist/firefox/manifest.json,
dist/chrome/manifest.json), scripts/build.mjs (header and manifest code), README.md "Cache rule" and
"Privacy", and the Firefox permission notes in docs/part3-notes.md. Ran: rg over src/ and dist/ for
HTML/code sinks (innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function,
string timers, postMessage, sendBeacon, XMLHttpRequest, WebSocket, importScripts, cookies,
localStorage) - zero hits in both; rg for every http(s) URL in dist/; the esbuild module markers in
each dist bundle; one read-only node script (node --experimental-strip-types, run from the session
scratchpad, no network, no writes) that imports src/providers/merge.ts, src/match/match.ts and
src/channel/url.ts and times hostile inputs. Nothing was built, tested, zipped or signed; no live
request was made.

## Findings

### SEC-1 (major): README "sends nothing about you anywhere" is not true; the viewed channel goes to four third parties on every channel visit

- Files: README.md:105-106 (the claim); src/content/index.ts:74-76 and 95-101 (prefetch); src/providers/nightbot.ts:54, src/providers/streamelements.ts:67, src/providers/fossabot.ts:82, src/providers/moobot.ts:59 (the login in each request); dist/firefox/manifest.json:38-42 (data_collection_permissions required ["none"]).
- Claim: as soon as a chat input is detected on a channel page, the content script sends 'commands:get' and the background sends the channel login to api.nightbot.tv, api.streamelements.com, fossabot.com and moo.bot from the user's IP (one cycle per channel per hour), before the user types anything. That is the user's viewing activity (which channel, when, from which IP) reaching four third parties. README's Privacy paragraph says the extension "sends nothing about you anywhere", and the Firefox manifest declares that it collects nothing.
- Evidence: src/content/index.ts:74-76 `function prefetch(): void { if (input && login && !copies.has(login)) fetchCommands(login); }`, called from the watchChatInput callback (line 100) and from checkLocation (line 87). Each adapter puts the login in the URL or body, e.g. src/providers/nightbot.ts:54 `http.get('https://api.nightbot.tv/1/channels/twitch/' + encodeURIComponent(login))`. README.md:105-106: "The extension never sends or reads chat messages, sends nothing about you anywhere, and stores only the command cache." The ledger (docs/LEDGER.md S20) records "the extension collects nothing" as the reason for required ["none"], with no discussion of the third-party transmission.
- Fix: say it plainly in README and in the AMO listing text, for example: "To list commands, the extension asks Nightbot, StreamElements, Fossabot and Moobot for the commands of the channel you open (the channel name only, no cookies, at most once per channel per hour). Those services see that request and your IP address. Nothing else is sent." Then decide (owner) whether data_collection_permissions should stay ["none"] or declare the matching category; see "Not checked".

### SEC-2 (minor): no size or count limits on provider data; a hostile response can hang the background and the Twitch tab (quadratic alias handling)

- Files: src/providers/merge.ts:47-53 (normName, no length cap), 56-64 (normAliases, `out.includes` per item), 23 (mergeCommands `hit.aliases.includes`), 129-130 (runChain reads `res.text()` with no byte cap); src/match/match.ts:56 (`command.aliases.indexOf(candidate) < i - 1` per alias, on every keystroke).
- Claim: a compromised or malicious provider can return one command with a very large alias array (or 100k commands, or a 1 MB name). The alias de-duplication is O(n^2) in the background at parse time and again O(n^2) in the content script on every keystroke in the chat input; nothing bounds the number of commands, aliases or the name length, and the body is read whole (only the 2 s chain deadline bounds it, which aborts the download but not the synchronous parse that follows). The result is cached for the hour, so the per-keystroke cost repeats.
- Evidence (node probe, scratchpad):
  - `normAliases n=5000 14 ms` / `normAliases n=20000 180 ms` (4x input -> 13x time, quadratic)
  - `filterCommands q=a, 1 cmd with n aliases=5000 11 ms` / `... n aliases=20000 130 ms`
  - `normName "xxxx..." -> len 1000000` (a 1 MB name is accepted)
  - `mergeCommands 100k 24 ms len=100000`, `filterCommands 100k q=c1 5 ms len=1000` (command count alone is linear and cheap; the alias path is the problem)
  - Extrapolated, not run: 200k aliases (about 2.4 MB of JSON) would be roughly 100x the 20k figures, i.e. seconds per keystroke in the Twitch tab.
- Exploitability: needs a compromised provider (semi-trusted public API). Impact is availability only (CPU hang of the extension background and of the Twitch tab while typing "!"); no code execution, no data exposure.
- Fix: in the adapters, cap the body (reject when Content-Length or the read text exceeds about 2 MB), cap commands per provider (for example 2000), aliases per command (for example 20) and name length (for example 64 code units, Twitch messages are 500); use a Set in normAliases and in match.ts's duplicate check.

### SEC-3 (minor): a failed storage write skips eviction, so a quota-full cache never heals and the hour rule silently degrades

- File: src/cache/cache.ts:116-124 (persist), 98-114 (enforceCap).
- Claim: persist() runs enforceCap() only after a successful `st.set`; when `set` throws (quota exceeded) the catch logs a warn and eviction is skipped. enforceCap also only evicts beyond 50 entries, and stale entries are never deleted. So if storage.local is full (for example after SEC-2-sized entries), every later write fails, other channels live only in the session memory map, and on Chrome (service worker unloads when idle) each revisit refetches: the "once per channel per hour" rule stops holding without any user-visible sign. It heals only when the oversized channel is refetched with a smaller result.
- Evidence: cache.ts:118-120 `if (st) await st.set({ [PREFIX + login]: entry }); await enforceCap(st);` inside one try whose catch (121-122) only warns; enforceCap line 107 `if (ages.size <= MAX_CHANNELS) return;`. The manifest requests no "unlimitedStorage" (dist/chrome/manifest.json:6-9). The Chrome storage.local quota value was not re-checked here.
- Fix: bound entry size (SEC-2 caps make a normal entry tens of KB); on a set failure, evict the oldest entry and retry once; optionally drop stale entries (older than TTL) during enforceCap.

### SEC-4 (minor): a test-only insertion hook ships in the production bundle and any page script can arm it

- Files: src/content/index.ts:103-121; dist/firefox/content.js:1090-1091 (same in dist/chrome/content.js).
- Claim: the shipped content script listens for a page-dispatched 'tvcmd:test-pick' event and inserts "!name " at the active "!" token when `document.documentElement.dataset.tvcmdTest === '1'`. That attribute lives in the shared DOM, so any script in the Twitch page can set it and drive the extension's insertion with an arbitrary non-whitespace name (pickByName falls back to the raw name when it is not a known command, controller.ts:234-237). No privilege is gained (the page can already edit its own input), so this is not an exploit, but it is dead test code in a store build: no file under test/ or tools/ references it (rg found it only in scripts/workflows/build-round.js, a workflow prompt), and a reviewer reading the unminified bundle will ask what it is.
- Evidence: rg 'tvcmd:test-pick|tvcmdTest' over dist -> `dist/firefox/content.js:1090: document.addEventListener("tvcmd:test-pick", (ev) => {` and `1091: if (document.documentElement.dataset.tvcmdTest !== "1") return;`; rg over test/ tools/ scripts/ -> only scripts/workflows/build-round.js.
- Fix: delete the listener (nothing uses it), or compile it only into a test build through an esbuild `define` flag so dist/ never contains it.

### SEC-5 (minor): the per-channel hour budget is not bounded across channels; a page script (or a busy user) can drive unlimited provider fetch cycles

- Files: src/cache/cache.ts:17 and 98-114 (50-entry cap, oldest evicted); src/content/index.ts:78-88 (checkLocation on every watcher tick), 74-76 (prefetch per new login); README.md:97-99.
- Claim: the content script re-reads location.href on every DOM-mutation tick and prefetches each newly seen valid login while a chat input exists. A script in the Twitch page can call history.pushState through any number of /<login> paths; each new login costs one full fetch cycle (up to 2 + 2 + 2 + 6 = 12 HTTP requests across the four providers) from the user's IP, using the extension's moo.bot host permission. Past 50 channels the oldest entries are evicted, so revisiting them inside the hour refetches; README's "Each provider is asked at most once per channel per hour" holds only for the 50 most recent channels.
- Evidence: code read: index.ts:79-88 `const href = location.href; ... const next = channelFromUrl(href); ... prefetch();` (no global rate limit); cache.ts:108-113 evicts the oldest fetchedAt beyond MAX_CHANNELS = 50 from memory and storage. The content-side `copies` map (index.ts:25) is never pruned, which is what keeps a single page from refetching the same login, not the background.
- Exploitability: low. A hostile Twitch page could call three of the four providers itself (they are CORS-open); the only gain is moo.bot requests and evicting the user's real cache.
- Fix: a global background limit (for example at most N new channels fetched per minute) and README wording "at most once per channel per hour (for the 50 most recently used channels)".

### SEC-6 (minor): command names keep control, zero-width and bidi-override characters, and those go into the chat input

- File: src/providers/merge.ts:47-53 (normName); compare normResponse at 69-71, which strips C0 controls.
- Claim: normName rejects only whitespace (JS \s). A provider name may contain NUL and other C0 controls, U+200B (zero-width space) or U+202E (right-to-left override); those names are shown in the popup and inserted verbatim as "!name " into the message the user then sends. A bidi override can make the row text read differently from the logical text the user will send (the inserted text renders the same way in the input, so this is a spoofing nuisance rather than a hidden send).
- Evidence (node probe): `normName "a<NUL>b" -> len 3`, `normName "a<U+200B>b" -> len 3`, `normName "dis<U+202E>cord" -> len 8` (all accepted; the special characters are written here as <...> placeholders).
- Fix: in normName, drop names containing C0/C1 controls, U+200B-U+200F, U+202A-U+202E, U+2066-U+2069 and U+FEFF (or restrict names to printable characters), with the SEC-2 length cap.

### SEC-7 (note): fetch hygiene - credentials omitted and cache bypassed, but redirects are followed and Content-Type is not checked

- File: src/providers/merge.ts:126-140.
- Observation: every request goes through one runner with `credentials: 'omit', cache: 'no-store'` and an AbortController deadline (merge.ts:129, 116-124), so no cookies and no cached cross-site state; the only custom headers are Nightbot-Channel (a provider id) and Moobot's form Content-Type/Accept (moobot.ts:16-19), none identifying. `redirect` is left at the default 'follow' and the body is JSON.parse'd whatever its Content-Type. A redirect to another host still needs CORS approval from that host (only moo.bot is a host permission), and the provider already controls the body, so there is no gain for an attacker today.
- Fix (optional): `redirect: 'error'` makes a provider-side redirect an explicit error rather than a silent cross-host read.

### SEC-8 (note): the page can see the extension and the typed command query

- Files: src/content/index.ts:32-34 (emit), src/content/controller.ts:80-93 and 152; src/content/popup/popup.ts:74-76 (open shadow root on div#tvcmd-popup-host).
- Observation: by design (SPEC 10, 7.2) the content script dispatches 'tvcmd' CustomEvents on document, readable by any page script, carrying the query after "!", the login, command counts, fromCache and timings, and mounts a host with an OPEN shadow root on every page with a chat input. Twitch (or any script it loads) can therefore detect that the extension is installed and see which channels it has cached. The query text is already in the page's own input, so nothing new leaks about the message. Kept because the recorder and tests depend on it.
- Fix: none required; if wanted later, emit 'tvcmd' events only in a test build.

### SEC-9 (note): checks that came back clean

- Message passing: no externally_connectable in either manifest (dist/*/manifest.json read in full), so only the extension's own contexts reach runtime.onMessage; onRequest ignores the sender but validates the shape (src/shared/messages.ts:39-43: known type, string login), and the background re-validates the login (src/background/index.ts:34-35, /^[a-z0-9_]{1,25}$/ after trim+lowercase). The content script only ever sends 'commands:get'; the throttled 'commands:refresh' is sent only by the action page. No message lets a sender choose a URL or a provider; the 2.5 s answer budget is enforced (background/index.ts:36-40).
- URL construction: logins come from channelFromUrl (src/channel/url.ts) and pass /^[a-z0-9_]{1,25}$/; the probe returned null for percent-encoded segments (`/%63oconutb -> null`, `/coconutb%2F..%2Ftwitch -> null`), lookalike hosts (`evil.twitch.tv.example.com -> null`, `www.twitch.tv@example.com -> null`) and 26-char segments; query strings and hashes are ignored (`/coconutb#/lirik -> coconutb`, `/embed/coconutb/chat?parent=example.com -> coconutb`). Every login and every provider-supplied id is passed through encodeURIComponent in URL paths and the Moobot form body (nightbot.ts:54, streamelements.ts:67,72, fossabot.ts:82,87, moobot.ts:59,67).
- DOM: rg found no HTML sinks in src/ or dist/; the popup and the action page write third-party strings with textContent, Text nodes and the title property only (popup.ts:143-159, action/index.ts:55-86). Styles are a static string inside the shadow root (styles.ts), no external fonts or images.
- Prototype pollution: provider JSON is read through asRecord field access; per-login state uses Map; storage keys are prefixed "cc:"; a "__proto__" login (accepted by the regex) is harmless there.
- Keys and page interaction: the single window capture keydown listener acts only while our popup is open and only on ArrowUp/ArrowDown/Tab/Enter/Escape without modifiers or IME composition (controller.ts:156-185); the document capture mousedown listener only closes the popup and never prevents default (controller.ts:194-201). The extension never dispatches a submit, never clicks the send button and never calls fetch from the content script; the only text it writes is "!name " over the active "!" token (controller.ts:150). With the popup open, Enter and Escape are consumed by design (SPEC 1.5).
- Bundles: the esbuild module markers show only src/ modules in each bundle (background 11 modules, content 12, action 3; no node_modules). The only URLs in dist/ are the eight provider endpoints in background.js (api.nightbot.tv x2, api.streamelements.com x2, fossabot.com x2, moo.bot x2) and "https://moo.bot/*" in each manifest; no twitch.tv URL, no analytics or error-reporting endpoint.
- Storage shape from an older version: parseEntry (cache.ts:52-59) rejects anything without v === 1, so a future format change refetches instead of misreading.

## Not checked

- Whether AMO counts the channel-name lookups (SEC-1) as "browsingActivity" under data_collection_permissions; the policy text was not fetched (no web access in this audit).
- Whether Firefox sends `Origin: moz-extension://<per-install UUID>` on these background requests. docs/part3-notes.md:125-127 shows api.nightbot.tv succeeded from Firefox, and docs/providers/nightbot.md:20 records that Nightbot sends no ACAO without an Origin, so some Origin was sent; if it is the per-install UUID it is a stable pseudonymous identifier seen by the CORS-open providers. Not observed directly.
- The Chrome storage.local quota figure behind SEC-3, and whether Firefox enforces any quota on storage.local.
- Insertion race: native.ts:236-240 fires the first beforeinput one frame after selecting the token without re-checking that the draft is unchanged; a key typed inside that frame could be overwritten. Not reproduced.
- Whether activeTab is needed at all in Chrome given the twitch.tv content-script match (tab.url access); not tested.
- dist/ freshness was inferred from file times (bundles 17:44:49, last src commit 17:42:44) and from the module markers, not by rebuilding and diffing.
- test/, tools/ and docs/providers/*.md were not audited beyond the lines cited.
