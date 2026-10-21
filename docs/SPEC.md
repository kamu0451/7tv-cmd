# 7tv-cmd build contract (SPEC)

Status: round 1 contract. Every builder, critic and test in this repo works against this file.
Where a number is "from the reference", the value lives in docs/reference-7tv-popup.md and
docs/recordings/ref-7tv-colon-dark/dom.json (recorded from the real 7TV extension); the builder
copies the measured value and names the field it came from in a code comment.
Decisions taken between rounds are recorded in docs/LEDGER.md and win over older text here.
Revised after the round 1 spec critic (docs/critics/r1/spec-critic.md, all 26 findings applied per docs/LEDGER.md).

## 0. What this is

A Manifest V3 WebExtension (Firefox first, Chrome second) that adds a command autocomplete popup
to the Twitch chat input. When the user types "!" at the start of a word, a popup lists the bot
commands available in THAT channel (fetched from the public command pages of Nightbot,
StreamElements, Fossabot and the other providers in docs/providers/), filters as they type,
is driven by Up/Down/Tab/Enter/Esc, and inserts the chosen command into the input. It coexists
with the 7TV extension (its ":" emote popup and its replaced chat input) and works with the
native Twitch input when 7TV is absent. No Twitch login, no Twitch API credentials, no setup.

Reading guide:
- Part 2 builder (providers, cache, background): sections 1, 3, 4, 5, 6.1 (API only, for the action page), 9, 11, 12.
- Part 3 builder (chat input integration, controller): sections 1, 3, 4, 6, 7 (API only), 8 (API only), 10, 11, 12.
- Part 4 builder (popup UI, matching): sections 1, 3, 7, 8, 10, 11, 12 plus docs/reference-7tv-popup.md.
- Scaffold: sections 2, 3, 4, 9, 11.
- Critics: everything, plus the checklist in docs/reference-7tv-popup.md.

## 1. Product rules

1. Trigger: the popup opens when the token under the caret starts with "!" and the "!" is at a
   word start (offset 0, or preceded by whitespace). It never opens for ":", "/" or "@" tokens;
   those belong to 7TV and Twitch.
2. Filtering: the text after "!" is the query. "!b" lists every command whose name or alias
   starts with "b", then every command containing "b" (section 8). "!" alone lists everything.
3. Keyboard, with the popup open (matches the recorded 7TV model in docs/reference-7tv-popup.md
   for Tab, Shift+Tab, Enter, Escape, Space and row click; wrap at both ends is our choice,
   checklist item 9): the first row is pre-selected; ArrowDown and ArrowUp move the selection and
   wrap; Tab, Shift+Tab and Enter insert the selected command; Escape closes the popup and leaves
   the text as typed; Space (or any whitespace) closes it and the space is typed; Backspace past
   the "!" closes it. After a pick the popup closes (7TV's post-Enter popup state was not reliably
   recorded). With the popup closed the extension touches no key (7TV's own Tab carousel and
   Twitch's handlers keep working).
4. Insertion replaces the whole "!partial" token with "!name " (one trailing space). The text
   the input WOULD SEND must equal the visible text: this is verified against the editor's own
   state, not only the DOM text (section 6.4).
5. Enter with the popup open never sends the message. Esc with the popup open never clears or
   blurs the input.
6. Performance: with the channel's commands cached, the popup is visible within 100 ms of the
   keystroke; the first fetch for a channel completes within 2 s on a warm network (the adapter
   chain deadline, section 4). A fetch never blocks typing: the popup appears when data arrives
   if the token is still a trigger.
7. Network: at most ONE automatic fetch cycle per provider per channel per hour, where a fetch
   cycle is that provider's recorded endpoint chain (login lookup plus commands call, plus
   Moobot pages); ProviderResult.requests reports the HTTP count. This is the ledger's reading
   of the owner's rule "at most one request per provider per channel per hour" (docs/LEDGER.md,
   round 1 spec critic). Results, empty results and errors are all cached for one hour. A manual
   refresh (section 5.5) bypasses the hour but is throttled to one per channel per minute.
8. Coexistence: when 7TV is installed its ":" popup, its replaced input and its own key handling
   keep working; when 7TV is absent the native Slate input keeps working. Twitch's "/" command
   popup and "@" mention completion keep working in both cases. While our popup is closed, no
   listener of ours calls preventDefault or stops propagation.
9. Console: zero uncaught errors and zero console.error lines from this extension during a
   5 minute session on twitch.tv, with and without 7TV. Expected failures (a provider down, a
   channel with no bot) are console.warn at most, prefixed "[7tv-cmd]".
10. Privacy and safety: public, unauthenticated endpoints only; no cookies, no tokens, no
    Twitch Helix; the extension never sends a chat message, never reads chat messages, never
    stores anything but the command cache; no remote code, no eval, no fetched scripts.
11. Themes: dark and light Twitch themes (html.tw-root--theme-dark / html.tw-root--theme-light).

## 2. Architecture and file ownership

One content script, one background script, one small action page. Vanilla DOM in the content
script (no framework), TypeScript everywhere, esbuild bundles, web-ext lints and runs Firefox.

```
src/
  shared/types.ts           SCAFFOLD   the types in section 3 (copied verbatim)
  shared/messages.ts        SCAFFOLD   the messaging contract in section 4 (types + sendMessage helper)
  shared/log.ts             SCAFFOLD   warn(msg, ...) and debug(msg, ...) prefixed "[7tv-cmd]"
  manifest.json             SCAFFOLD   base manifest (section 9); build.mjs derives per-browser variants
  providers/types.ts        SCAFFOLD   ProviderAdapter and AdapterContext (section 5.1), stub only
  providers/index.ts        PART 2     registry in priority order, fetchAll()
  providers/<id>.ts         PART 2     one adapter per provider (section 5.2)
  providers/merge.ts        PART 2     mergeCommands() (section 5.3)
  providers/hosts.json      PART 2     match patterns for host_permissions (section 9); SCAFFOLD ships "[]"
  cache/cache.ts            PART 2     storage.local cache with TTL, negative caching, in-flight dedupe (5.4)
  background/index.ts       PART 2     message handler (section 4), uses cache + providers
  action/index.html         PART 2     manual refresh page (section 5.5), ASCII, no framework
  action/index.ts           PART 2
  channel/url.ts            PART 3     channelFromUrl() (section 6.1); SCAFFOLD writes a stub returning null
  content/input/types.ts    SCAFFOLD   ChatInput interface (section 6.2), stub only
  content/input/native.ts   PART 3     native Twitch Slate input adapter
  content/input/seventv.ts  PART 3     7TV replaced input adapter
  content/input/watch.ts    PART 3     watchChatInput() (section 6.3)
  content/token.ts          PART 3     activeToken() (section 6.5)
  content/controller.ts     PART 3     wires input -> token -> commands -> match -> popup -> insert
  content/index.ts          PART 3     entry: channel detection, background requests, controller lifecycle, test hook events (section 10)
  content/popup/popup.ts    PART 4     createPopup() (section 7); SCAFFOLD writes a stub whose methods are no-ops and isOpen() returns false
  content/popup/styles.ts   PART 4     CSS string for the shadow root (section 7.3)
  match/match.ts            PART 4     filterCommands() (section 8); SCAFFOLD writes a stub returning []
scripts/build.mjs           SCAFFOLD   typecheck + esbuild + manifest variants -> dist/firefox, dist/chrome
scripts/zip.mjs             SCAFFOLD   zips -> web-ext-artifacts/
tsconfig.json, vitest.config.ts, playwright.config.ts   SCAFFOLD
README.md                   SCAFFOLD (skeleton) then INTEGRATION (filled)
PROVIDERS.md                INTEGRATION (assembled from docs/gate-7tv.md and docs/providers/*.md)
docs/part3-notes.md         PART 3     verification method and results (6.4), selectors recorded (6.5), anchor choice (7.2); INTEGRATION appends its Firefox result (section 9)
test/unit/**                TEST HARNESS (after integration)
test/browser/**             TEST HARNESS (after integration)
test/fixture-page/**        TEST HARNESS (tests-browser)  index.html + fixture.ts: a real slate-react editor with
                            Twitch's attributes (native mode) and the same editor wrapped in
                            seventv-container.seventv-chat-input-container > seventv-container.seventv-chat-input-textarea
                            (7TV mode, ?mode=seventv); bundled by esbuild; slate, slate-react, react, react-dom pinned
                            as devDependencies added by that agent
test/fixtures/**            RESEARCH (read-only for builders)
tools/pw/**                 RESEARCH / shared (builders may read, not change)
docs/LEDGER.md              MAIN LOOP (decisions between rounds)
```

Ownership rules: a builder writes ONLY the files its part owns; the scaffold's stubs for a
part are replaced by that part's builder (same path, same exported names and signatures). A
builder who needs a change in another part's public surface does not make it: it writes the
need into its result JSON under "publicSurfaceRequests" and codes against the stub. Every
exported name and signature in sections 3 to 8 is frozen for the round; adding exports is
allowed, changing or removing them is not. Every module one part imports from another part
exists as a scaffold stub with the frozen signature before the builders start; a builder never
creates a file another part owns. The fixture page is served from file:// or a local static
server started by the test; it never contacts the network.

## 3. Shared types (src/shared/types.ts, verbatim)

```ts
export type ProviderId = string; // 'nightbot' | 'streamelements' | 'fossabot' | 'moobot' | ... per docs/providers/

export type UserLevel = 'everyone' | 'subscriber' | 'regular' | 'vip' | 'moderator' | 'owner' | 'unknown';

export interface Command {
  name: string;          // without the leading "!", lowercased, trimmed, no whitespace; e.g. "discord"
  aliases: string[];     // same normalisation; [] when none; never contains name
  response: string;      // the bot's reply template or the provider's description; single line, trimmed, max 300 chars; '' when unknown
  provider: ProviderId;  // the provider that won the merge
  alsoOn: ProviderId[];  // other providers that publish the same name; [] when none
  cooldownSec?: number;  // omitted when the provider does not publish it
  userLevel?: UserLevel; // omitted when unknown
}

export type ProviderStatus = 'ok' | 'empty' | 'error' | 'unsupported';

export interface ProviderResult {
  provider: ProviderId;
  status: ProviderStatus; // ok: commands.length > 0; empty: provider knows no commands for this login (cached as empty); error: network/HTTP/parse failure; unsupported: adapter disabled by design
  commands: Command[];    // [] unless status is ok
  fetchedAt: number;      // epoch ms
  requests: number;       // HTTP requests this result cost
  error?: string;         // one line, no stack, for error
}

export interface ChannelCommands {
  login: string;              // Twitch login, lowercased
  commands: Command[];        // merged across providers (section 5.3)
  providers: ProviderResult[];
  fetchedAt: number;          // oldest fetchedAt among providers
  fromCache: boolean;
}

export type MatchKind = 'exact' | 'prefix' | 'substring';

export interface Suggestion {
  command: Command;
  matched: string;            // the name or alias that matched (equals command.name when the name matched)
  viaAlias: boolean;
  kind: MatchKind;
  range: [number, number];    // [start, end) inside `matched` to highlight; [0, 0] for an empty query
}
```

## 4. Messaging contract (src/shared/messages.ts)

```ts
export type Request =
  | { type: 'commands:get'; login: string }      // cache first; fetches when stale or missing
  | { type: 'commands:refresh'; login: string }  // bypasses TTL; throttled 1/login/60 s (returns the cached value with ok:true and refreshed:false when throttled)
  | { type: 'commands:status'; login: string };  // cache only, never fetches; data.providers may be []

export type Response =
  | { ok: true; data: ChannelCommands; refreshed?: boolean }
  | { ok: false; error: string };

export function sendRequest(req: Request): Promise<Response>;   // wraps browser/chrome runtime.sendMessage; rejects only on messaging failure
```

The background answers every request within 2.5 s. An adapter that has not finished at its
2000 ms chain deadline aborts its requests and resolves status 'error', error 'timeout'; that
result is cached for the hour like any error. No late result ever overwrites it. Message
handling returns a Promise (Firefox) or uses sendResponse with `return true` (Chrome); the
scaffold's helper hides the difference behind `onRequest(handler)` in messages.ts.

## 5. Providers, merge, cache, refresh (part 2)

### 5.1 Adapter contract (src/providers/types.ts)

```ts
export interface AdapterContext {
  fetch: typeof fetch;    // injectable for tests
  now: () => number;
  timeoutMs: number;      // deadline for the WHOLE chain, default 2000; one AbortController per fetchCommands call
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;          // 2-3 ASCII chars for the popup badge: NB, SE, FB, MB, WB, CB, BX, ...
  hosts: string[];        // API hosts this adapter fetches, bare host names such as 'moo.bot' (feeds the manifest and the request-budget test)
  corsOpen: boolean;      // true when every endpoint (including the preflight for custom headers) admits the extension origin: ACAO * or a reflected Origin, as recorded in docs/providers/<id>.md; false means a host_permission is required
  enabled: boolean;       // false: never fetched, fetchCommands resolves status 'unsupported' without a request
  fetchCommands(login: string, ctx: AdapterContext): Promise<ProviderResult>;
}
```

Every adapter file also exports pure functions the unit tests run against test/fixtures/<id>/:
`parseChannel(raw: unknown): string | null` returns the provider's channel id from the login
lookup body, or null when the body says the login is unknown (Moobot: no channel key;
Nightbot/StreamElements/Fossabot: their recorded 404 bodies) -> status 'empty'. Every enabled v1
adapter has a lookup step; botrix (disabled) exports a parseChannel that returns null.
`parseCommands(raw: unknown): Command[]` is the normalised, enabled commands from the commands
response. fetchCommands composes them with the endpoint chain exactly as docs/providers/<id>.md
records it; it never fetches anything the recorded network capture did not show (Moobot's
paging, section 5.2, is the recorded behaviour).

Status mapping: HTTP 404 or an "unknown channel" body on the login lookup -> 'empty'; a
commands response with zero enabled commands -> 'empty'; non-2xx other than 404, network error,
timeout, JSON parse failure -> 'error' with a one-line error. 'unsupported' only for adapters
with enabled:false (for example a provider whose public page needs a per-user URL).
Per-provider rules (from docs/providers/*.md): nightbot keeps every command, userLevel from the
string field when it is a UserLevel value else 'unknown'; streamelements keeps enabled === true
&& hidden !== true, uses /bot/commands/<id> only (not /default), userLevel 100 -> everyone, 500
-> moderator, any other number -> 'unknown'; fossabot keeps enabled_online || enabled_offline,
includes type 'default', userLevel from role names Broadcaster -> owner, Moderator -> moderator,
other -> 'unknown', no role -> everyone; moobot keeps every listed command, no userLevel. Any
provider: a name that still contains whitespace after trimming and stripping one leading '!' is
dropped.

### 5.2 Registry (src/providers/index.ts)

`export const ADAPTERS: ProviderAdapter[]` in priority order: nightbot (label NB, corsOpen true:
api.nightbot.tv reflects any request Origin including chrome-extension://, checked 2026-10-21;
the reflection was checked for chrome-extension:// only, integration repeats it for
moz-extension://), streamelements (SE, corsOpen true, ACAO *), fossabot (FB, corsOpen true, ACAO
*), moobot (MB, corsOpen false: ACAO is the fixed value https://moo.bot, so the background
fetch needs the host permission https://moo.bot/*; its chain is two POSTs, see
docs/providers/moobot.md; Moobot pages with _limit=100, accepted by the server per
docs/providers/moobot.md, and follows _offset until _offset >= _total, at most 5 pages). botrix
is registered with enabled:false and status 'unsupported' (docs/LEDGER.md round 0: no populated
response was ever observed, its API path is under robots.txt Disallow, no CORS header). WizeBot,
Streamlabs Cloudbot and PhantomBot have no public per-channel endpoint and are not registered
(PROVIDERS.md explains). Every chain, header and field path comes from docs/providers/<id>.md.
`export function fetchAll(login, ctx): Promise<ProviderResult[]>` runs all adapters
concurrently with Promise.allSettled and never throws.

### 5.3 Merge (src/providers/merge.ts)

`export function mergeCommands(results: ProviderResult[]): Command[]`: concatenate in registry
order; two commands are the same when their names are equal; the first keeps `provider`, gains
the union of aliases (minus its own name), and lists every later provider in `alsoOn`; an
alias equal to another command's name is dropped from the alias list. Output sorted by name.

### 5.4 Cache (src/cache/cache.ts)

- storage.local key `cc:<login>` -> `{ v: 1, fetchedAt: number, lastManualRefresh?: number, providers: Record<ProviderId, ProviderResult> }`.
- TTL 3 600 000 ms for every status. A stale or missing entry triggers one fetchAll; results
  are stored whatever their status (negative caching).
- In-flight dedupe: concurrent 'commands:get' for the same login share one fetch.
- Session memory cache in front of storage.local.
- At most 50 channels; when full, evict the oldest fetchedAt.
- `getCommands(login, ctx): Promise<ChannelCommands>`, `refresh(login, ctx)`, `peek(login)`.
- Exact budget rule the test asserts: for one login, over any 60 minute window, each adapter's
  fetchCommands is called at most once by the automatic path.

### 5.5 Manual refresh (src/action/*)

The toolbar action page shows the current tab's channel (from the active tab URL through
`activeTab`), each provider's status, command count and age, and a "Refresh" button that sends
'commands:refresh'. Plain HTML and TypeScript, ASCII text only, dark and light via
prefers-color-scheme. Nothing else is configurable in v1. The refresh throttle timestamp is
stored per login in the cache entry (lastManualRefresh) in storage.local, so it survives the
background worker unloading.

## 6. Chat input integration (part 3)

### 6.1 Channel detection (src/channel/url.ts)

`export function channelFromUrl(url: string): string | null` handles, lowercased:
`https://www.twitch.tv/<login>`, `/<login>/...` (about, schedule, videos tab: `/<login>/videos`
is still the channel; `/videos/<id>` is not), `/popout/<login>/chat`, `/popout/<login>/...`,
`/moderator/<login>`, `/embed/<login>/chat`, `https://dashboard.twitch.tv/u/<login>/...`,
`/<login>/dashboard`, `m.twitch.tv/<login>`. Returns null for reserved first segments:
directory, videos, settings, downloads, p, search, friends, inventory, drops, subscriptions,
wallet, turbo, jobs, store, prime, popout (without a login), embed (without a login), moderator
(without a login), u, team, following, messages, privacy, collections, and any segment not
matching /^[a-z0-9_]{1,25}$/i. `/popout/moderator/<login>/chat` is handled like
`/moderator/<login>` (unverified shape; null is acceptable). Twitch is a single-page app: the
content script re-evaluates the channel when location.href differs from the last value, checked
in the watchChatInput mutation callback, on popstate, and on visibilitychange. It does not patch
history methods (that has no effect from an isolated world). Prefetch is gated on a chat input
(section 6.5), so a false positive costs nothing.

### 6.2 ChatInput interface (src/content/input/types.ts)

```ts
export type InputKind = 'native' | 'seventv';

export interface ChatInput {
  kind: InputKind;
  root: HTMLElement;      // the element that receives key events (contenteditable)
  anchor: HTMLElement;    // the visible input box the popup is positioned against
  getText(): string;      // the current draft as plain text (emotes as their text); U+FEFF zero-width characters Slate renders are removed; getCaret() returns an offset in that cleaned text (recorded: docs/recordings/ref-7tv-colon-dark/dom.json, probes 'Backspace past trigger' inputAfter)
  getCaret(): number;     // caret offset within getText(), -1 when unknown or the selection is not collapsed
  replaceRange(start: number, end: number, text: string): boolean; // replaces [start,end) of the draft, puts the caret after the new text; false when impossible
  on(event: 'input' | 'keydown' | 'blur', cb: (e: Event) => void): () => void; // keydown is delivered from ONE listener added with { capture: true } on window at content-script start, filtered to events whose composedPath() contains root; it runs before any page listener registered on document, the React root or 7TV's containers
  dispose(): void;
}
```

### 6.3 Detection (src/content/input/watch.ts)

Recorded fact (docs/reference-7tv-popup.md, "How 7TV hooks the chat input"): 7TV does NOT
replace the Slate editor. It re-parents the same `div.chat-wysiwyg-input__editor` inside
`seventv-container.seventv-chat-input-textarea` within
`seventv-container.seventv-chat-input-container`, writes through Slate operations and reads the
text from Slate. So both kinds share the Slate logic: native.ts implements the Slate adapter;
seventv.ts reuses it and differs only in `kind: 'seventv'` and in the anchor (the 7TV
container) and in any 7TV-specific key handling the builder observes and records.

`export function watchChatInput(cb: (input: ChatInput | null) => void): () => void` watches the
document with one MutationObserver (subtree, childList), evaluated at most once per animation
frame, and reports the current input: the 7TV-wrapped editor when a seventv-container ancestor
is present (7TV mounts late and may re-mount on navigation), else the native Slate editor
(`div[data-a-target="chat-input"][data-slate-editor="true"][contenteditable="true"]`, observed
2026-10-21 in both Chromium and Firefox; its class is `chat-wysiwyg-input__editor`, and the
attributes `data-test-selector="chat-input"`, `role="textbox"`, `aria-label="Send a message"` are
also present; the selector lives in one constant with a comment dating it), else null. The
callback fires only when the detected editor element or its kind changes (compare root identity
and kind with the last report); then it reports a fresh ChatInput and the caller disposes the
previous one. Mutations that leave the same editor and kind in place produce no callback. The
same mutation callback compares location.href with the last value and triggers channel
re-detection when it changed (see 6.1). The 7TV selectors come from
docs/reference-7tv-popup.md (recorded), never from memory.

### 6.4 Insertion and the message that would be sent

Native (Slate): select [start, end) with Selection.setBaseAndExtent, wait one
requestAnimationFrame so Slate's selection sync runs, then ONE
document.execCommand('insertText', false, '!name ') (it replaces the selection; no separate
delete). If getText() afterwards does not equal the expected draft, fall back to synthetic
InputEvent('beforeinput', { inputType: 'insertText', data, cancelable: true, bubbles: true })
after the same selection wait. The content script never reads React or Slate internals. The
draft Slate holds is verified by the TEST HARNESS in the page world (Playwright page.evaluate /
Marionette execute), by reading the Slate editor through the editor element's React fiber, and
by the survive-a-re-render check (type one more character, then Backspace, and the text is
unchanged); the harness replays that verification on the fixture page (test/fixture-page/**,
section 2), a real slate-react editor in native and 7TV wrapping. Until the harness exists,
part 3 runs the same verification on the live popout chat (page-world evaluate) and writes the
method and its result in Chromium and Firefox to docs/part3-notes.md. 7TV: the same rule
against 7TV's input; the method is recorded.

### 6.5 Token and controller (src/content/token.ts, controller.ts)

```ts
export interface Token { start: number; end: number; text: string } // text includes the "!"
export function activeToken(text: string, caret: number): Token | null; // the whitespace-delimited token containing the caret (caret at end counts); null when caret < 0
export function isTrigger(token: Token | null, text: string): boolean; // token starts with "!", has no second "!", and start === 0 or /\s/.test(text[start - 1])
```

Controller rules: on every 'input' event compute the token; when it is a trigger, request
commands for the current channel (cached: synchronous open; else open when the response arrives
if the token is still a trigger), run filterCommands(commands, query) and open or update the
popup; when it is not a trigger, close the popup. Capture-phase keydown while open:
ArrowUp/ArrowDown -> move; Tab/Enter -> pick (insert, close); Escape -> close; all five call
preventDefault() and stopImmediatePropagation(). Keys with ctrlKey, altKey or metaKey, and
events with isComposing true, are passed through untouched. Close on blur (a blur whose
relatedTarget is inside the popup host is ignored), on a mousedown outside the popup and the
input, on channel change, and on dispose; the "mousedown outside" test uses
event.composedPath(): a path containing the popup host or input.root is inside. When zero
suggestions match, the popup is closed (hidden), not shown empty. The controller never opens
when a 7TV popup or a Twitch autocomplete popup is open: Twitch's native tray (which 7TV also
fills) is div.autocomplete-match-list (docs/reference-7tv-popup.md, "How 7TV hooks the chat
input"); the controller does not open while one is visible. Further selectors part 3 adds are
recorded in docs/part3-notes.md.

Cached copy for the 100 ms open: content/index.ts sends 'commands:get' as soon as
watchChatInput reports a non-null input for a detected channel, and again on channel change, and
keeps the last ChannelCommands in memory; the controller reads that copy synchronously. When a
trigger opens the popup and the copy is older than 60 s, the controller also sends
'commands:get' and updates the list when it answers. No request is sent on pages without a chat
input.

Part 3 verifies on the live popout chat with 7TV (and on the fixture page once the harness has
written it) that Tab, Shift+Tab and Enter with our popup open produce our insertion only (no 7TV
carousel word, no message sent).

## 7. Popup (part 4)

### 7.1 Public API (src/content/popup/popup.ts)

```ts
export interface PopupOptions {
  maxRows: number;                       // visible rows before scrolling; from the reference
  getEditorRect(): DOMRect;              // bounding rect of input.root (the editor); the popup sits 4 px above its top edge (section 7.2)
  onPick(s: Suggestion): void;
  onClose(): void;                       // called only when the popup hides itself (open()/update() with an empty list); close() never calls it, click outside is the controller's job
}
export interface Popup {
  open(anchor: HTMLElement, items: Suggestion[], query: string): void;   // mounts once, shows, selects index 0
  update(items: Suggestion[], query: string): void;                     // keeps the selection on the same command when still present, else index 0; no unmount, no flicker
  move(delta: 1 | -1): void;                                            // wraps at both ends; scrolls the selected row into view
  current(): Suggestion | null;
  isOpen(): boolean;
  close(): void;
  reposition(): void;                                                   // repositions now; the popup also repositions itself on window resize and scroll
  destroy(): void;
}
export function createPopup(opts: PopupOptions): Popup;
```

Edge rules: close() never calls onClose; onClose fires only when the popup hides itself, which
in v1 happens only when open()/update() receive an empty list. open() and update() with []
hide the popup and fire onClose. open() and update() reposition. While open, the popup listens
to window resize and scroll (capture) and repositions itself; the controller does not call
reposition(). destroy() removes the host.

### 7.2 Behaviour

- One host element `div#tvcmd-popup-host` appended to document.body with an open shadow root;
  all styles inside the shadow root; nothing leaks into Twitch or 7TV.
- Accessibility and recorder contract: the list element has role="listbox"; every row is a
  direct child element with role="option"; the selected row has aria-selected="true", every
  other row aria-selected="false"; the host carries data-tvcmd-open="1" while visible.
- The visual reference is Twitch's native autocomplete tray, which 7TV injects its emote rows
  into (docs/reference-7tv-popup.md, "Visual language"): above the input, full input width,
  4 px gap, 42 px rows, 13 rows visible then scroll, 14 px Inter / Twitch font stack, dark
  rgb(24,24,27) on rgb(239,239,241) text, light white on rgb(14,14,16), grey full-width selected
  bar, no radius, no shadow. Ours copies those values (maxRows 13, capped by the space above the
  input) and adds what the task asks for and 7TV lacks: the highlighted matched substring, a
  provider badge, a description line.
- Positioned with position: fixed. Horizontal: left and width from anchor.getBoundingClientRect()
  (min 280 px). Vertical: bottom edge 4 px above the top of input.root (the editor), as recorded
  (tray bottom 707, editor top 711 in docs/recordings/ref-7tv-colon-dark/dom.json). open() and
  update() therefore read both rects: open(anchor, ...) plus PopupOptions.getEditorRect():
  DOMRect. Part 3 chooses as anchor the element whose rect in the 1280x800 popout is x13 w1254
  (7TV: the seventv-chat-input-container; native: recorded by part 3 in docs/part3-notes.md).
  Max height = min(maxRows rows, the space above the input minus 8 px). When fewer than 3 rows
  fit above, the popup opens below (top edge 4 px below the bottom of the editor).
- Row content: the matched text with a leading "!" and the matched range highlighted; a provider
  badge (adapter label, 2-3 chars, text only); the response or description on a second line,
  single line, clipped with an ellipsis (CSS text-overflow). When viaAlias, the row's primary
  text is the alias and the name follows as "-> !name". No icons, no images.
- Values: row height 42 px; line 1 = 14px Inter stack, 19.6px line-height (dom.json font); line
  2 = 12px / 16px, colour rgb(173,173,184) dark, rgb(83,83,95) light (Twitch palette, unrecorded,
  recorded in docs/LEDGER.md); padding 3px 10px; background rgb(24,24,27) / rgb(255,255,255),
  text rgb(239,239,241) / rgb(14,14,16) (dom.json colors, both themes); selected bar
  rgb(53,53,58) dark (docs/reference-7tv-popup.md visual estimate) and, for light, the value
  part 4 samples from docs/recordings/ref-7tv-colon-light/frames/05-down.png (the selected
  row's bar in that frame); both selected-bar values are recorded in docs/LEDGER.md by the main
  loop after round 1; badge text rgb(41,182,246) (dom.json highlight.color, the 7TV provider
  label); matched range font-weight 700, same colour; radius 0, no shadow; host z-index 10000
  (above Twitch's chat column; part 3 confirms it is visible in the popout and on a channel
  page).
- Theme follows html.tw-root--theme-light / html.tw-root--theme-dark, re-read on open.
- Mouse: hover selects (on mousemove, not mouseenter, so a popup that opens under a resting
  pointer does not move the selection), click picks. Rows call preventDefault() on mousedown
  (the input keeps focus and its selection, no blur fires) and pick on click. Keyboard selection
  and mouse selection are one state.
- Rendering budget: open or update completes within 16 ms for 100 items (reuse row nodes).

### 7.3 Styles

Inline CSS string in styles.ts, ASCII only, no external fonts, no images, no @import.

## 8. Matching (part 4, src/match/match.ts)

```ts
export function filterCommands(commands: Command[], query: string, limit?: number): Suggestion[]; // limit default 100
```

q = query.trim().toLowerCase(). For each command the candidates are [name, ...aliases]. The
candidate's kind is exact when candidate === q, prefix when candidate.startsWith(q), substring
when candidate.includes(q); the command's best candidate wins (exact < prefix < substring; at
equal kind the name beats an alias; then the shorter candidate; then alphabetical). Commands
with no matching candidate are dropped. Empty q: every command, kind 'prefix', range [0, 0],
in name order. Sort: kind, then name-match before alias-match, then shorter matched text, then
name alphabetical. Deterministic; pure; no allocation beyond the result.

The controller's query = token.text.slice(1) (the whole token, not up to the caret). range =
[i, i + q.length) where i = matched.indexOf(q) (0 for prefix and exact). Alphabetical
comparisons use plain code-unit order (a < b), never localeCompare. Duplicate aliases are
compared once.

## 9. Manifest, build, packaging, CLI contract (scaffold)

Base manifest src/manifest.json:
- manifest_version 3; name "7tv-cmd: Twitch command autocomplete"; version from package.json;
  description one ASCII sentence; icons: none in v1 (web-ext lint accepts it; a plain SVG may be
  added later, never an emoji).
- permissions: ["storage", "activeTab"].
- host_permissions: the content of src/providers/hosts.json, a JSON array of match patterns
  written by part 2 by hand, equal to ADAPTERS.filter(a => a.enabled && !a.corsOpen).flatMap(a
  => a.hosts.map(h => 'https://' + h + '/*')) - today exactly ["https://moo.bot/*"]. A part 2
  unit test asserts that equality. hosts entries in ProviderAdapter are bare host names (e.g.
  'moo.bot'). The scaffold ships hosts.json as "[]". Content scripts need the twitch.tv match
  only.
- content_scripts: matches ["*://*.twitch.tv/*"], js ["content.js"], run_at "document_idle",
  all_frames true (popout and embed chats run in frames).
- action: default_title "7tv-cmd", default_popup "action/index.html".
- background: Firefox variant `{"scripts": ["background.js"]}` (event page); Chrome variant
  `{"service_worker": "background.js"}`. build.mjs writes dist/firefox/manifest.json with
  browser_specific_settings.gecko { id: "7tv-cmd@example.com", strict_min_version: "140.0",
  data_collection_permissions: { required: ["browsingActivity"] } } plus gecko_android
  { strict_min_version: "142.0" }, and dist/chrome/manifest.json with minimum_chrome_version
  "116" and no browser_specific_settings.
- Firefox MV3: content-script matches and host_permissions are host permissions. The Firefox
  manifest sets strict_min_version "140.0" (ESR; the version that introduced
  data_collection_permissions, so web-ext lint is clean; Firefox grants MV3 host permissions at
  install from 127, unverified here) and carries gecko.data_collection_permissions
  { required: ["browsingActivity"] } (the channel login from the page URL is sent to the bot
  providers; was "none" until the pre-publish audit, docs/audit/SUMMARY.md). The
  integration agent confirms with
  tools/ff/marionette.mjs that a temporary install runs the content script (a tvcmd 'fetch'
  event on a popout chat) and that the moo.bot request succeeds, and records the result in
  docs/part3-notes.md. README explains how to grant the permissions in about:addons if the user
  revoked them. Part 2 prefers CORS-open endpoints, so the common path needs no host permission
  beyond twitch.tv.
- No content_security_policy override, no remote code, no web_accessible_resources in v1.

npm scripts (Windows-friendly: node scripts, no shell operators):

```
npm run typecheck     tsc --noEmit (exit 1 on any error)
npm run build         node scripts/build.mjs   -> typecheck, esbuild (ES2022, firefox121/chrome116, iife, no splitting), copy manifest variants and action page into dist/firefox and dist/chrome
npm run zip           node scripts/zip.mjs     -> web-ext-artifacts/7tv-cmd-firefox-<version>.zip and 7tv-cmd-chrome-<version>.zip
npm run lint          web-ext lint --source-dir dist/firefox (exit 1 on errors; warnings printed)
npm test              vitest run
npm run test:browser  playwright test (test/browser)
npm run start:firefox web-ext run --source-dir dist/firefox --start-url https://www.twitch.tv/popout/coconutb/chat
npm run record        node tools/pw/record.mjs (pass flags after --)
```

## 10. Test hooks and recording protocol

The content script dispatches `document.dispatchEvent(new CustomEvent('tvcmd', { detail:
JSON.stringify(d) }))`: detail is always a JSON STRING (an object detail does not cross from the
isolated world to the page world in Chrome or Firefox). d = `{ event: 'open' | 'update' |
'close' | 'insert' | 'fetch', query?: string, count?: number, t: number, keyT?: number, login?:
string, fromCache?: boolean }`, where t is performance.now() taken in the first
requestAnimationFrame after the popup DOM was shown or changed (for 'open'/'update'), and keyT
is the timeStamp of the input or keydown event that caused it. Latency = t - keyT. 'fetch' is
emitted when a commands response arrives, with count = commands.length and fromCache. Listeners
JSON.parse the detail. It is the test harness's and the recorder's hook; it carries no user data
beyond the query text.

Firefox checks go through tools/ff/marionette.mjs (launchFirefox -> installAddon(dist/firefox,
temporary) -> navigate -> find/click/sendKeys/pressKey/execute/screenshot; headless by default;
checked 2026-10-21 on the system Firefox: typing into the Slate input and reading it back works,
send the first character and read it back before typing more, since Slate attaches late).
Playwright's Firefox cannot load extensions and web-ext run cannot type, so this driver is the
Firefox path for integration, browser tests and critics; it needs no new binary.

Recordings follow tools/pw/record.mjs (written in round 0): frames 01-09, dom.json,
timings.json, notes.md, under docs/recordings/<id>/. Ours is recorded as
docs/recordings/ours-bang-dark and ours-bang-light with `--extensions dist/chrome --trigger "!"
--filter "b"` on the same channel as the reference. The A/B checklist is section "checklist"
of docs/reference-7tv-popup.md. tools/pw/record.mjs walks the document and every OPEN shadow
root recursively when it looks for the popup rows and the selected row (extended after round 1
and checked against the 7TV reference), so the popup in the open shadow root of
div#tvcmd-popup-host is found without special-casing its id; the host must keep an OPEN shadow
root and the role and aria-selected contract of section 7.2. A recording made without that
detection is invalid and must not be scored.

## 11. Hard rules for every file

- ASCII only: no emoji, no Unicode icons, no smart quotes, no box drawing; "->" for arrows.
- No UI framework, no runtime dependency; devDependencies only. No eval, no Function(), no
  innerHTML with untrusted text (command names and responses come from third parties:
  textContent only).
- The owner's name, email, handles never appear in code, manifest, UA, docs or tests.
- Nothing logs in, nothing sends chat, nothing creates accounts, nothing writes outside the repo
  and .pw-profiles/. Tests against live sites fetch at most what section 1.7 allows.
- TypeScript strict; `npm run typecheck` and `npm run build` pass before a builder returns.
- Commit messages describe the change only.

## 12. Builder result format

The final message of every builder is EXACTLY ONE JSON object:

```
{"part":"p2|p3|p4|scaffold|integration|tests-unit|tests-browser","done":true,
 "filesWritten":["src/..."],"publicSurfaceChanged":[],"publicSurfaceRequests":[],
 "checks":{"typecheck":"pass|fail|n/a","build":"pass|fail|n/a","lint":"pass|fail|n/a","unit":"pass|fail|n/a"},
 "verified":["one line per thing you saw working, with the file or recording that shows it"],
 "knownGaps":[],"toolCalls":0,"deferred":[]}
```

"done" is true only when the part's owned files exist, typecheck and build pass, and every
public name in this spec for that part is exported with the given signature.
