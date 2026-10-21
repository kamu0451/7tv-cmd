# Pre-publish audit, 2026-10-21 (before the first push and the first signing)

Five independent reviewers (security, store policy, correctness, repository hygiene, tests and
docs) read the tree at commit 8d91d98, then one verifier tried to refute every critical and
major finding. Reports: `security.md`, `policy.md`, `correctness.md`, `hygiene.md`,
`tests-docs.md`, `verify.md` in this folder. No file outside this folder was changed by the
audit. Nothing was fetched from twitch.tv or a bot provider; the policy reviewer fetched Mozilla
and Chrome policy pages only; the tests reviewer ran typecheck and the unit tests (409 passed).

## After verification

| Severity | Count | Items |
| --- | --- | --- |
| critical | 1 | HYG-1 (git history carries the account name, machine paths and the e-mail local part; HEAD is clean) |
| major | 1 | DATA = SEC-1 + POL-1 + POL-2 (the channel login goes to four bot APIs on every channel visit; manifest says "none", README says "sends nothing about you") |
| minor | 21 | COR-1 (downgraded from major), COR-2..7, SEC-2 (downgraded to note by the verifier), SEC-3..6, POL-3 (major only at a Chrome Web Store step), POL-4..8, TST-1..8, HYG-2 (downgraded), HYG-3..6 |
| note | 22 | the rest; SEC-9, POL-9..12, HYG-9..10 and TST-9 record checks that came back clean |

The verifier's corrected severities and one-line fixes are in `verify.md`.

## Fix plan (what the next pass runs, in this order)

| # | Items | Action | Files | Check |
| --- | --- | --- | --- | --- |
| 1 | DATA, POL-3 | `data_collection_permissions.required` becomes `["browsingActivity"]`; README Privacy section rewritten to the facts (the channel name being viewed and the user's IP reach Nightbot, StreamElements, Fossabot and Moobot, at most once an hour per channel, before anything is typed; no login, cookies, identity or chat content); add `PRIVACY.md` with the same text; SPEC section 9 and LEDGER S20 get a one-line correction | scripts/build.mjs, README.md, PRIVACY.md, docs/SPEC.md, docs/LEDGER.md | `npm run build`, `npm run lint` (0 errors), manifest diff shows the key |
| 2 | COR-1, COR-3, SEC-3, SEC-4/COR-13, POL-8 | insert() re-reads the draft before inserting and never falls through to execCommand on an unmappable range; no second space when text follows the token; persist() runs eviction even when storage.set throws; remove the test-only `tvcmd:test-pick` hook from the bundle; content script match `https://*.twitch.tv/*` only | src/content/input/native.ts, src/content/controller.ts, src/cache/cache.ts, src/content/index.ts, src/manifest.json, unit tests for each | `npm run typecheck`, `npm test`, `npm run test:browser -- keyboard` (offline fixture page) |
| 3 | HYG-2, TST-1, TST-2, TST-8, POL-4, POL-5, POL-6, HYG-4, HYG-6 | generalize the owner-session paragraphs (keep the result, drop time window, profile and add-on count, provider, command count and command names); README: lirik is verified in Firefox, "no public endpoint" becomes "none found", cache sentence names Refresh and Moobot paging, signing text says "usually within a day, may be reviewed later", source-submission recipe names Node 22 and `npm ci`, an "unofficial, not affiliated with 7TV" line; package.json gets repository/homepage/bugs once the remote exists; .gitignore adds `.env`, `*.xpi` | README.md, docs/LEDGER.md, docs/integration-r2.md, PROVIDERS.md, package.json, .gitignore | README link check (every backticked path exists), `rg` for the dropped details returns nothing |
| 4 | HYG-1 | before the first push: a fresh orphan root commit of the clean tree on `main`; the current `main` is kept locally as `local-history` and is never pushed | git only | `git log --all -S<account name>` on the new root returns nothing; `git diff local-history main` is empty |

Left as recorded, not planned: COR-2 (timeout path), COR-4/COR-5 (Refresh reach and throttle stamp), COR-6, COR-7, SEC-5 (cross-channel budget), SEC-6 (control characters in names), TST-3..7 (coverage gaps), HYG-3 (22 MB of screenshots and one webm; trimming is the owner's call), HYG-5 (process vocabulary in docs), POL-7 (icons, Chrome only).

## Decisions that need the owner

- HYG-1: the orphan root commit discards the local history from the public copy (kept locally). Recommended; it is the only way to honour "no owner identity string anywhere in the repo".
- POL-6: the add-on name and id lead with "7tv". Keeping the name with an "unofficial" line is the recommendation; renaming must happen before the first signing, because the id is permanent after it.
- HYG-3: whether to trim docs/critics/r1 screenshots, the light-theme recordings and docs/recordings/*/video.webm (about 10 MB of 22) before the root commit.

## Not covered by this audit

The browser tests were not run (they touch twitch.tv); hosted 7TV in Chromium and a logged-in Chromium session were never tested in any round; the Firefox background's uncaught exceptions are still unobserved; the PNG sample viewed for personal content was 8 of 253.
