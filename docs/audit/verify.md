# Final audit: refutation pass

Scope: six findings from the five reports in this folder (correctness.md, security.md, policy.md,
hygiene.md). Each was re-derived from the source or from a fetched policy page; nothing was built,
run in a browser or sent to Twitch or a bot provider. Three pages fetched (URLs below). One
read-only node script counted fixture sizes (scratchpad, not in the repo).

### COR-1: confirmed with changes

Evidence:
- src/content/controller.ts:150-151: pick() calls `input.replaceRange(...)` and then
  `setClosed(true)` synchronously; the Tab/Enter keydown that picked is consumed
  (controller.ts:183-184, preventDefault + stopImmediatePropagation), so it produces no
  beforeinput of its own. The NEXT keydown sees `open === false` (controller.ts:159) and passes.
- src/content/input/native.ts:258-264: replaceRange selects the token synchronously (select(),
  :160-169) and starts `insert()` without awaiting it.
- native.ts:236-237: insert() first awaits nextFrame(), which is afterFrame (:141-150): the next
  requestAnimationFrame or a 50 ms timer, whichever comes first. The reason is in the comment at
  :237 and :213-219: Slate syncs its own selection from DOM selectionchange, so the DOM selection
  set by select() is given a frame to land before the synthetic beforeinput.
- native.ts:238-240: no check that `readText(root) === before` before the first attempt.
  fireBeforeInput returns false both when the event was not cancelled and when the range cannot be
  mapped (:224 `if (!a || !b) return false;`); :240 then runs execCommand('insertText') at whatever
  selection exists.
- pointAt (native.ts:92-104) returns null for an index past the end of the current text, so the
  unmappable branch is reached whenever the draft shrank below `end`.

Exact sequence (sequence 1): draft "!dis", caret at 4, popup open. Tab keydown -> pick ->
select(0,4) -> insert() waits for the frame. A letter keydown arrives before the next frame:
popup is closed, so the controller ignores it; the browser fires beforeinput for the letter over
the selected token; slate-react handles it and the draft becomes "h" (one text node of length 1).
The frame callback runs fireBeforeInput(0, 4, ...): pointAt(nodes, 4, false) -> null -> false ->
execCommand inserts "!discord " at the caret. Correction to the report: the visible DOM becomes
"h!discord ", but by the code's own measurement (native.ts:213-215) execCommand does not update
Slate's model, so the result is a DOM/model desync with the model still "h", not a clean wrong
draft. Either way the message is wrong.

Plausibility:
- In a visible foreground tab the window is the remainder of the current frame, 0 to about 17 ms
  at 60 Hz (less at higher refresh rates). The 50 ms bound applies only when rAF stalls; the
  stall is documented for headless Chromium with 7TV (native.ts:137-140), not for a headed tab.
- Sequence 1 needs a different key going down within one frame of Tab/Enter (key rollover). Fast
  typists do produce sub-20 ms keydown intervals on rollover, but rarely, and a pick usually
  follows a glance at the popup. Possible, uncommon.
- Sequence 2 as written (Enter, then Enter again inside the frame) needs the same physical key
  released and pressed again within about 17 ms; that is not a realistic human input, and key
  auto-repeat starts hundreds of ms later (that case is COR-11). The Tab-then-Enter variant (two
  different keys) is possible on rollover and would send the partial "!dis", then leave
  "!discord " typed into the emptied input (pointAt(nodes, 0, true) on an empty editor returns null,
  so execCommand runs).

Severity: minor (report: major). The bug is real and the consequence is a wrong or partial
message, but it needs a sub-frame second keydown in a headed browser.

Fix: in insert(), return before the first attempt when `readText(root) !== before`; make
fireBeforeInput tri-state and never call execCommand when the range is unmappable.

### DATA (SEC-1, POL-1, POL-2): confirmed

(a) Prefetch before typing: confirmed. src/content/index.ts:74-76 `prefetch()` fetches when an
input and a login exist and no copy is held; it is called from checkLocation (:87, run at script
start :90, on every watcher tick :91, popstate :92, visibilitychange :93) and from the
watchChatInput callback (:100). No keystroke is involved. The background answers commands:get
through the cache (src/background/index.ts:22-23), so a cold or stale channel (one cycle per
channel per hour) triggers the four adapters, each of which puts the login in the request:
src/providers/nightbot.ts:54, streamelements.ts:67, fossabot.ts:82 (URL path), moobot.ts:59
(POST body). botrix is registered but performs no request (src/providers/botrix.ts:3, :26).
`credentials: 'omit'` (src/providers/merge.ts:129) means no cookies, but the providers still see
the channel name, the time and the user's IP address.

(b) Mozilla category: browsingActivity fits best. Source:
https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- browsingActivity: "Information about the websites users visit, such as specific URLs, domains"
- transmission: "any data collected, used, transferred, shared, or handled outside the add-on"
- The fetched page lists no exception for public data or for data needed by the core feature.
The login is the path of the twitch.tv URL the user is on (channelFromUrl), sent to third parties:
a part of a specific visited URL. websiteActivity (scrolling, clicking, typing) and websiteContent
(what is visible on the page) do not fit: the value comes from the URL, not from page content or
interaction. technicalAndInteraction does not fit either.

(c) README.md:105-107, "sends nothing about you anywhere": false as written. Which channel a
person is watching, with their IP address, is information about them, and it goes to four
services that would not otherwise see it.

Severity: major for the manifest (a "collects no data" label on an add-on that sends visited-URL
data to third parties is the inaccuracy a reviewer can flag), major for the README sentence
(public, false claim). Both are one-line fixes.

Fix: scripts/build.mjs:82 -> `data_collection_permissions: { required: ["browsingActivity"] }`
(required, since the feature cannot work without it), and update docs/SPEC.md section 9 and the
LEDGER S20 wording. README: replace the sentence with the POL-2 text: when you open a channel's
chat, the extension asks Nightbot, StreamElements, Fossabot and Moobot for that channel's public
command list (at most once per channel per hour); those requests carry the channel name and your
IP address; no login, cookies or tokens; chat messages are never read or sent.

### POL-3: confirmed

- Chrome half, confirmed. https://developer.chrome.com/docs/webstore/program-policies/policies :
  "you must post an accurate and up to date privacy policy" (condition: the product handles any
  user data). The same page restricts web browsing activity, "except to the extent required for a
  user-facing feature", so browsing activity is treated as covered user data and this extension
  needs a policy before a Chrome Web Store submission.
- Mozilla half, confirmed as an absence only.
  https://extensionworkshop.com/documentation/publish/add-on-policies/ : "All add-ons are subject
  to these policies, regardless of how they are distributed." The fetched policy body (first
  100000 of 100159 characters) contains no privacy-policy requirement; the only hits are a
  navigation link and the table of contents of the separate Distribution Agreement ("3. Privacy
  Policy"), which was not fetched.

Severity: minor now (no Chrome submission is planned in this round; not a blocker for unlisted AMO
signing); major at the Chrome Web Store step.

Fix: before any Chrome submission add PRIVACY.md with the corrected README privacy text and link it
in the dashboard; optionally fetch the Mozilla Distribution Agreement section 3 before relying on
"not required" for AMO.

### SEC-2: confirmed with changes

Evidence: the quadratic loops exist where cited. src/providers/merge.ts:61
`!out.includes(a)` inside the per-item loop of normAliases; merge.ts:23
`!hit.aliases.includes(a)` when merging the same name across providers; src/match/match.ts:56
`command.aliases.indexOf(candidate) < i - 1` per alias, on every filter call.

Realistic input: a read-only count over the 90 fixture JSON files under test/fixtures gives at most
7 aliases on one command (fossabot) and at most 103 alias entries in a whole file
(streamelements). Nightbot carries one alias string per command (src/providers/nightbot.ts:20,
:33); Moobot none (src/providers/moobot.ts:36, :46). At n <= 7 the quadratic term is irrelevant.
The report's timings (20000 aliases on one command -> 130 to 180 ms) were not re-run here; they
need a single command with thousands of aliases, which only a compromised or malicious provider
response could supply.

Severity: note (report: minor). Availability only, compromised-provider precondition, no realistic
input comes near the sizes measured.

Fix: optional hardening: Set-based de-duplication in normAliases and match.ts, and caps on aliases
per command and on body size in the adapters.

### COR-3: confirmed

Trace: draft "!dis hello", caret 4. pick() (controller.ts:140-150): activeToken(text, 4)
(src/content/token.ts:9-16) walks start back to 0 and end forward while text[end] is not
whitespace; text[4] is " ", so end = 4 and token = {0, 4, "!dis"}; isTrigger is true.
replaceRange(0, 4, "!discord ") replaces "!dis" and keeps " hello", giving "!discord " + " hello" =
"!discord  hello". The same happens with the caret anywhere inside the token, since end always
stops at the following space.

Severity: minor (cosmetic; the command still works, the draft shows two spaces).

Fix: in pick(), append the trailing space only when `token.end === text.length` or
`text[token.end]` is not whitespace (or move the caret past the existing space instead).

### HYG-2: confirmed with changes

The commit author field already publishes the owner's GitHub handle and noreply address, and
commit timestamps already show the working day and time zone. What the paragraphs add beyond that
is a link from that GitHub identity to a specific Twitch channel, through details that fingerprint
the channel and the moment:
- Channel traits: "StreamElements only" and "26 commands" (README.md:175; docs/LEDGER.md:126;
  docs/integration-r2.md:32).
- The 12-name command sample (docs/LEDGER.md:129-130). This is the strongest fingerprint: anyone
  with a candidate channel can compare its public StreamElements command list.
- The session time window plus "Enter SENT it ... the bot answered" (docs/LEDGER.md:122, :131-133):
  a dated, timed chat message that public chat logs can be searched against once a candidate
  channel exists.
- Browser profile details: Firefox 158.0.1, "daily profile", 7TV Nightly, "six other add-ons"
  (docs/LEDGER.md:122-123; docs/integration-r2.md:31). Low identification value, but personal
  setup with no evidential value for a reader.
Not beyond the author field: that the owner tested by hand, in Firefox with 7TV, logged in, and
that list, filter, Tab insert, send and the 7TV emote list worked; the build sha; the console
result.

Severity: minor (report: major). Identification needs a candidate channel to compare against;
nothing names the channel directly.

Fix: generalize, not delete. The result is evidence README:182 relies on ("beyond the owner's one
Firefox session"), and the LEDGER paragraph is an owner-decision record. Keep "tested by hand in
Firefox with 7TV, logged in, on a channel with one bot provider: list, filter, Tab insert, send;
7TV emote list unaffected"; drop the time window, profile and add-on count, provider name, command
count and the command-name sample in all three files.

## Not checked

- COR-1 was not reproduced in a browser. Slate's handling of a native beforeinput over the
  selected token, and React's render timing before the next frame, are inferred from the code
  comments and slate-react's known behaviour, not from slate-react source read here. rAF timing in
  a headed browser with 7TV loaded was not measured.
- The policy quotes passed through the fetch tool's summarizer; they match the policy report's
  quotes but word-exactness against the raw HTML was not checked. The last 159 characters of the
  Mozilla Add-on Policies page and the Firefox Add-on Distribution Agreement were not read.
- SEC-2 timings were not re-run; only the loop structure and fixture sizes were checked.
- Whether Twitch collapses the COR-3 double space on send or display.
- Whether public chat-log archives actually cover the owner's channel (HYG-2 risk is argued from
  the details, not tested).
