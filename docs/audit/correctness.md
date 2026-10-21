# Pre-publish audit: correctness and robustness of the runtime code

Scope: read every file under src/ (content, input adapters, watcher, controller, popup, styles,
match, providers, merge, cache, background, messages, log, action, manifest), test/browser/harness.ts,
the insertion and pass-through tests in test/browser/keyboard.spec.ts, the Enter handler of
test/fixture-page/fixture.ts, docs/SPEC.md and docs/LEDGER.md; listed the describe/it names of
test/unit and test/browser. Ran `npm run typecheck` (tsc --noEmit): exit 0, no diagnostics.
Nothing was built, run in a browser or sent to a network; every finding below comes from reading
the code, and every timing in it is the code's own constant, not a measurement.

LEDGER decisions respected and not re-opened: the beforeinput-first insertion order (B1), the
1000-row limit (P4-1), the deferred resize/scroll reposition and hover items, Enter/Tab inserting
instead of sending while the popup is open (SPEC 1.3, 1.5).

## Findings

### COR-1 (major): a key pressed before the deferred insertion runs replaces the token, and a failed range mapping falls through to execCommand at an unrelated caret

- Where: src/content/input/native.ts:220-250 (fireBeforeInput, insert), :258-264 (replaceRange);
  src/content/controller.ts:150-151 (pick closes the popup before the insertion has happened).
- Claim: replaceRange selects the "!partial" token synchronously and returns true; the actual
  insertion waits for nextFrame() (one requestAnimationFrame, or the 50 ms afterFrame fallback,
  native.ts:141-154). The controller closes the popup at once (open = false), so the very next
  keydown is no longer consumed. insert() does not check that the draft still equals `before`
  before its first attempt, and fireBeforeInput returns false for two different reasons: "the
  event was not cancelled" and "the token range could not be mapped" (line 224
  `if (!a || !b) return false;`). Line 240 treats both as "not Slate" and runs
  `document.execCommand('insertText', false, text)` on whatever selection exists at that moment.
- Trigger and wrong result:
  1. "!dis", Tab (or Enter), then a character typed inside that frame (key rollover): the
     browser's own beforeinput replaces the still-selected token "!dis" with the typed "h"; our
     deferred attempt maps start 0 / end 4 against the new text "h", pointAt returns null for
     end 4, fireBeforeInput returns false, and execCommand inserts "!discord " at the caret.
     Draft: "h!discord " instead of "!discord h".
  2. "!dis", Enter (pick), Enter again inside the frame: the second keydown passes through
     (popup closed) and Twitch sends Slate's draft, still "!dis" (a message the user did not
     choose); then the deferred insertion finds no text, fireBeforeInput returns false, and
     execCommand types "!discord " into the now empty input.
  The window is one frame (up to the 50 ms fallback, which the code comment says is what
  happens with 7TV loaded when rAF stalls); it is short, so this is rated major rather than
  critical, but its consequence is an altered or sent message.
- Evidence: `async function insert(...) { await nextFrame(); if (disposed) return; const taken =
  fireBeforeInput(start, end, text, true); if (!taken) document.execCommand('insertText', false,
  text); ...` (native.ts:236-241); `const ok = input.replaceRange(...); setClosed(true);`
  (controller.ts:150-151); `if (!open || ...) return;` (controller.ts:159).
- Fix: in insert(), before the first attempt, return when `readText(root) !== before` (and when
  the DOM selection is no longer the token); make fireBeforeInput return a tri-state
  (cancelled / not cancelled / unmappable) and never call execCommand on "unmappable". Optionally
  keep consuming Enter/Tab in the controller until the insertion promise settles (a short
  "inserting" flag), so a fast second Enter cannot send the partial token.

### COR-2 (minor): a background answer that hits the 2.5 s budget leaves the "!" popup closed until the next keystroke

- Where: src/background/index.ts:33-41; src/content/index.ts:49-53; src/cache/cache.ts:134-143.
- Claim: handle() races the answer against a 2500 ms timer and answers `{ ok: false, error:
  'timeout' }` when it loses. The answer for a cold channel is loadEntry + loadEntry + fetchAll
  (every chain up to its 2000 ms deadline) + persist (storage.set, then enforceCap's
  storage.get(null) of the whole store), all awaited before getCommands resolves. On ok:false
  the content script only warns: it stores nothing and does not call controller.commandsChanged,
  so the popup does not open for the "!" the user already typed. The fetch keeps running and
  lands in the cache, so the next keystroke opens the popup.
- Trigger: first "!" on a channel where one provider runs to its 2000 ms deadline and the
  storage reads/writes take more than about 500 ms in total. Wrong result: no popup for that "!"
  (SPEC 1.6 "the popup appears when data arrives if the token is still a trigger"). The toolbar
  Refresh shows "Refresh failed: timeout" in the same case although the refresh landed and the
  throttle was stamped.
- Evidence: `timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), ANSWER_BUDGET_MS)`
  (background/index.ts:38); `if (!resp.ok) { warn(...); return; }` (content/index.ts:50-53);
  `memory.set(login, entry); await persist(login, entry); return { entry, fetched: true };`
  (cache.ts:141-143).
- Fix: resolve the waiting callers as soon as memory.set() has run and persist in the
  background (do not await persist inside startFetch's returned promise), and/or in the content
  script retry once after an `error: 'timeout'` answer (the cache dedupes, so this costs no
  provider request).

### COR-3 (minor): inserting into a token that is followed by text leaves a double space

- Where: src/content/controller.ts:149-150; src/content/token.ts:9-16.
- Claim: the token ends at the first whitespace, and the insertion always appends one space.
- Trigger: draft "!dis hello" with the caret after "!dis" (the user went back to add a command),
  Tab. Wrong result: "!discord  hello" (two spaces).
- Evidence: `while (end < text.length && !SPACE.test(text[end])) end++;` (token.ts:14);
  `input.replaceRange(token.start, token.end, '!' + name + ' ')` (controller.ts:150).
- Fix: append the space only when `token.end === text.length` or `text[token.end]` is not
  whitespace.

### COR-4 (minor): the toolbar Refresh does not reach an open chat tab

- Where: src/content/index.ts:74-76; src/content/controller.ts:116-120.
- Claim: the content script keeps its first ChannelCommands copy per login and re-asks only
  when the popup opens and the copy is older than 60 s; nothing notifies tabs after a
  'commands:refresh'.
- Trigger: the streamer adds a command, the user presses Refresh on the toolbar page, then types
  "!" within 60 s of the tab's last copy. Wrong result: the new command is missing; after 60 s the
  first open still shows the old list and only the late answer updates it.
- Evidence: `if (input && login && !copies.has(login)) fetchCommands(login);` (index.ts:75);
  `if (!staleAsked && Date.now() - opts.receivedAt() > STALE_MS)` (controller.ts:117).
- Fix: after a successful refresh, broadcast a small 'commands:changed' message to Twitch tabs
  (tabs.sendMessage needs no new permission for tabs the content script runs in), or have the
  content script re-ask on window focus / visibilitychange when its copy is older than 60 s.

### COR-5 (minor): a manual refresh that joins an automatic in-flight fetch is reported as refreshed and does not stamp the throttle

- Where: src/cache/cache.ts:128-130, 139-140, 170-181.
- Claim: startFetch returns any running promise regardless of `manual`; the joined automatic
  cycle does not set lastManualRefresh, while refreshThrottled still answers `refreshed: true`.
- Trigger: open the toolbar page and press Refresh while a tab's first 'commands:get' for that
  channel is still fetching, then press Refresh again within 60 s. Wrong result: the second press
  is not throttled and runs a full manual fetch cycle (all providers again) seconds after the
  first; the first press reported "refreshed" though no manual cycle ran.
- Evidence: `const running = inflight.get(login); if (running) return running;` (cache.ts:129-130);
  `if (manual) entry.lastManualRefresh = now;` (cache.ts:139).
- Fix: when a manual call joins a running cycle, stamp lastManualRefresh on the resulting entry
  (or write it when the joined promise resolves) so the throttle holds.

### COR-6 (minor): the controller recognises its popup by a global id lookup

- Where: src/content/controller.ts:189-190, 197-198.
- Claim: "inside the popup" is decided with `document.getElementById('tvcmd-popup-host')`, which
  returns the FIRST element with that id in the document, not the host this controller created.
- Trigger: a second `#tvcmd-popup-host` earlier in the body, for example the host left behind by a
  previous instance of the content script after the extension is updated or reloaded under an
  open tab (whether Firefox re-injects into open tabs is listed under Not checked). Wrong result:
  a mousedown on one of our rows is judged "outside" by the capture-phase handler and closes the
  popup before the click, so mouse picking stops working in that tab.
- Evidence: `const host = document.getElementById(POPUP_HOST_ID); if (path.includes(input.root)
  || (host && path.includes(host))) return; setClosed(true);` (controller.ts:197-199).
- Fix: expose the host element (or a `contains(node)`) from createPopup and compare against the
  popup instance's own host; on mount, remove any stale `#tvcmd-popup-host` first.

### COR-7 (minor): every fetch cycle reads the whole storage.local, and every answer carries the commands twice

- Where: src/cache/cache.ts:98-114 (enforceCap), :116-124 (persist), :67-76 (toChannel).
- Claim: persist() calls `st.get(null)` after each write only to read fetchedAt for the 50-entry
  cap, deserialising every cached channel (each entry holds every provider's full command list);
  the work sits inside the 2.5 s answer budget (COR-2). Each Response sends the merged
  `commands` plus `providers[].commands`, roughly doubling every message, though the content
  script only reads `commands`.
- Trigger: a profile with many cached channels; every cold channel pays a whole-store read. Size
  not measured (the raw StreamElements fixture for coconutb alone is 114 KB before normalisation).
- Fix: keep a small index key (`cc:index` -> { login: fetchedAt }) for eviction, and strip
  providers[].commands from 'commands:get' answers (the action page uses 'commands:status').

### COR-8 (note): while the popup is open, every scroll event in the page repositions it

- Where: src/content/popup/popup.ts:247-248, 209-236.
- Claim: the window scroll listener is in the capture phase, so it receives scroll events of
  every scroller in the document, including Twitch's chat list, which scrolls on each new
  message. Each event runs two getBoundingClientRect calls and four style writes.
- Fix (optional): coalesce to one reposition per animation frame, or ignore scroll events whose
  target does not contain the anchor.

### COR-9 (note): the document-wide watcher is never disconnected and costs a selector query plus a layout read per mutated frame

- Where: src/content/input/watch.ts:23-31, 58-65; src/content/index.ts:95.
- Claim: throttling is correct (one evaluation per frame, pending flag), but each evaluation
  runs `querySelectorAll(SLATE_EDITOR_SELECTOR)`, `closest()` and `getClientRects()` (a layout
  read right after chat mutations), plus every tick listener. index.ts discards the stop function,
  so it runs for the page's life in every Twitch frame (all_frames: true); in background tabs the
  100 ms timer fallback keeps it going at the browser's timer throttle. Acceptable for a content
  script; listed so the cost is known.

### COR-10 (note): clock jumps

- Where: src/cache/cache.ts:61-64, 176-178; src/content/controller.ts:117.
- Claim: a fetchedAt in the future counts as stale, so after the clock moves back each channel
  is fetched once more (then fresh again); the refresh throttle treats a negative age as not
  throttled; the content stale check (`Date.now() - receivedAt > 60 s`) never fires after a
  backward jump until the clock catches up. No loop, at most one extra cycle per channel.

### COR-11 (note): key repeat is not filtered

- Where: src/content/controller.ts:156-185.
- Claim: `e.repeat` is not checked. Holding Enter on a row inserts on the first keydown, closes
  the popup, and the first auto-repeat (after the OS repeat delay) passes through and sends
  "!name ". Holding Tab inserts, then moves focus or reaches 7TV. Probably acceptable (the key
  was held); consuming repeats of Tab/Enter for a short time after a pick would avoid it.

### COR-12 (note): no virtualisation and a silent cut at 1000

- Where: src/content/popup/popup.ts:161-178; src/match/match.ts:37, 79.
- Claim: every suggestion gets a live row (8 nodes each; the pool only grows), and render()
  walks all rows on every update. A channel with more than 1000 merged commands loses the rest
  without a hint. Within LEDGER P4-1; no change asked.

### COR-13 (note): test-only pick hook ships in the store build

- Where: src/content/index.ts:103-121. Already reported by the security lens
  (docs/audit/security.md); the correctness side: it inserts the raw name even
  when no such command exists (controller.ts:234-237). No new capability for the page.

Checked and found correct (no finding): token and trigger rules; match ranking, ranges, limit and
duplicate-alias handling (no regex is built from the query, so regex characters are inert);
merge alias/alsoOn rules; adapter field validation and shape errors (cached as 'error');
Moobot paging stop conditions; the runChain deadline (late results discarded, no unhandled
rejection); in-flight dedupe for concurrent gets from two tabs inside one background instance
(inflight is set synchronously, and a later caller re-reads freshness); the refresh throttle
surviving a worker restart (stored in the entry); "Extension context invalidated" from
chrome.runtime.sendMessage (a synchronous throw inside the Promise executor becomes a rejection,
caught in content/index.ts:64-69); popup closed => no preventDefault anywhere (onKeydown returns
early, the tray is display:none); isComposing and Ctrl/Alt/Meta pass-through; Escape dismissal
memory; blur and outside-mousedown closing; channel change via the watcher tick, popstate and
visibilitychange; the action page on a non-Twitch tab (message shown, Refresh stays disabled).

## Coverage

Behaviours above that no test exercises (from the file and describe/it names; nothing was run):
- No unit or browser test imports src/content/index.ts, controller.ts, watch.ts, native.ts,
  popup.ts, messages.ts, background/index.ts or action/index.ts directly; the content path is
  covered only end to end by test/browser/keyboard.spec.ts (fixture page) and live.spec.ts.
- Keystrokes during the deferred insertion, or Enter right after a pick (COR-1): every
  insertion test waits for the DOM to settle before the next key.
- SPA channel change without reload, popstate, visibilitychange, editor re-mount, the
  native -> 7TV kind switch at runtime, two editors on one page, popout vs channel page vs
  /moderator vs /embed in a frame (url.test.ts covers only the pure URL parser).
- IME composition (isComposing), key repeat, Ctrl/Alt/Meta pass-through while open, Shift+Enter.
- Blur closing, mousedown-outside closing, row hover (mousemove) selection; only "row mousedown
  keeps focus, click inserts" is tested.
- Popup placement below the input, a small window, resize/scroll repositioning, and rendering
  near 1000 rows (the match limit is unit-tested, the DOM is not).
- Messaging: sendRequest/onRequest on both runtimes, the 2.5 s answer budget, 'invalid login',
  extension-context invalidation; the action page status and Refresh flow.
- Cache: fetchedAt in the future / clock changes, a manual refresh joining an automatic
  in-flight fetch (COR-5), concurrent persists of two logins against the 50-entry cap, storage
  quota failure on write (only a generic storage failure is tested).
- Insertion when the draft already holds emotes, mentions or text after the token (COR-3).

## Not checked

Questions, not findings:
- Firefox after an extension update or reload with a Twitch tab open: are content scripts
  re-injected into the tab, are the old instance's listeners cut, and what error text does a
  dead runtime give (the contextGone regex matches only "context invalidated" and "no extension
  runtime")? This decides whether COR-6 and a repeated warn per "!" happen in practice.
- Does Twitch render emotes inside the Slate editor as contenteditable="false" voids? If so,
  getText() drops their text (native.ts:52-60), so "Kappa!cmd" would read as "!cmd" and open the
  popup mid-word.
- Does Chromium's synthetic mousemove after a scroll (keyboard navigation scrolling the tray
  under a resting pointer) move the selection to the row under the pointer?
- Do Twitch or 7TV register a window capture keydown listener before document_idle (it would run
  before ours, and stopImmediatePropagation cannot stop it), or act on keyup for Enter/Tab?
- Chrome storage.local quota (10 MB) against 50 large channels: entry sizes were not measured.
- m.twitch.tv and /moderator pages: whether their chat input matches SLATE_EDITOR_SELECTOR and
  whether a page can hold two visible editors.
