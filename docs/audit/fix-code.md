# Pre-publish audit, row 2: code fixes

## Fixes

1. COR-1, src/content/input/native.ts:247-250 (helper at :220-241): insert() re-reads the draft after the frame wait and returns without inserting when it no longer equals the text captured at pick time; fireBeforeInput returns 'handled' / 'unhandled' / 'unmapped' and execCommand runs only on 'unhandled', never on an unmappable range. Happy path unchanged (same event, same execCommand, same retry). Test: test/unit/native.test.ts (new, fake DOM in node): 3 happy-path tests (pass before and after) and 3 race tests (draft became "h", draft emptied, draft changed to "!dix" inside the frame) that fail on the old code.
2. COR-3, src/content/controller.ts:150-152: pick() appends the trailing space only when the token ends the draft or the next character is not whitespace, so "!dis| hello" becomes "!discord hello". Test: test/unit/controller.test.ts (new, popup module stubbed): 4 tests; the two "whitespace follows the token" cases fail on the old code.
3. SEC-3, src/cache/cache.ts:116-130: persist() logs a failed storage.set as before ("cache write failed: ...") and then runs enforceCap in its own try (logged as "cache eviction failed: ..."). Test: test/unit/cache.test.ts:402, 50 stored entries plus a quota-failing set: the oldest entry is evicted and the warning is logged; fails on the old code.
4. SEC-4 / COR-13, src/content/index.ts (former :5-8 header and :103-121): the 'tvcmd:test-pick' listener and its comment are removed. rg over test/, tools/ and scripts/ (with --no-ignore) found the name only in the prose of scripts/workflows/build-round.js (a workflow prompt), no code. The rebuilt dist/ contains neither "tvcmd:test-pick" nor "tvcmdTest". Controller.pickByName stays (its comment now says unit tests; controller.test.ts uses it).
5. POL-8, src/manifest.json:8: content script matches "https://*.twitch.tv/*". scripts/build.mjs does not set matches (it spreads the base manifest); both dist manifests carry the https match. test/browser/harness.ts serves the fixture page through context.route on https://www.twitch.tv/popout/<channel>/chat, so the https match covers it. The only "http://" twitch URL in test/ is a channelFromUrl input in test/unit/url.test.ts, unrelated to the manifest.

Each new test was run against the old logic restored in place (then re-applied): 6 failed, 28 passed (the 6 targeted tests failed, all others passed).

## Checks

- npm run typecheck: `tsc --noEmit` exit 0, no output.
- npm test: `Test Files  9 passed (9)` / `Tests  420 passed (420)`.
- npm run build: `[build] ok, version 0.1.0, host_permissions 1`.
- npm run lint: `errors 0`, `notices 0`, `warnings 0`.
- npm run test:browser -- keyboard: `64 passed (14.3s)` (offline fixture page, native and 7TV wrapping, dark and light).

## Left undone

- SEC-3: eviction still only removes entries beyond 50 channels, so a store that is quota-full with 50 or fewer large entries does not heal through this fix alone. The audit's other parts (bound entry size, evict-and-retry on a failed set, drop stale entries) were not in this row's scope.
- COR-1: the 'unmapped' branch is now unreachable on the first attempt (the draft equality check runs first and the same text nodes back both); it stays as the guard the verifier asked for. The race was not reproduced in a real browser; the unit test simulates the keystroke by changing the fake editor text inside the frame.
- COR-3: with whitespace after the token the caret ends right after "!name", before the existing space (SPEC 6.2 "caret after the new text"); moving it past the space was not done.
- The build and the browser run used the working tree, which also holds another pass's uncommitted edits (README, package.json, scripts/build.mjs and others); those files were not touched here.
