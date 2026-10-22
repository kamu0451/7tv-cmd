# Handoff

## Next session
Nothing is open. If the popup does not appear on a Twitch chat in the owner's Firefox, start at
about:addons -> 7tv-cmd -> "Permissions and data": both optional permissions must be on
(README, "Firefox (permanent install, signed)" step 4). For a new release: bump `version` in
`package.json` and `src/manifest.json`, `npm run build`, `npm run lint`, `npm test`,
`npm run test:browser -- keyboard`, then `npm run sign -- --upload-source-code
web-ext-artifacts/7tv-cmd-source.zip` after `git archive -o web-ext-artifacts/7tv-cmd-source.zip HEAD`
(keys in the gitignored `.env`, never read or printed; Mozilla refuses a version it has seen).

## Current state
- Build: passing (typecheck, esbuild, web-ext lint 0 errors 0 warnings).
- Tests: 420 unit passing; browser keyboard suite 64 passing (local fixture page); live spec not re-run.
- Branch: `main`, pushed to the public GitHub repo; `local-history` holds the pre-publish history
  with the evidence files and is never pushed.
- Uncommitted changes: none.
- Release: 0.1.0 signed by Mozilla (unlisted, source archive attached) and installed in the
  owner's Firefox profile as the permanent copy; the temporary add-on is removed.

## Goal
A Manifest V3 WebExtension (Firefox first, Chrome second) that adds a "!" bot-command autocomplete
popup to the Twitch chat input, reading Nightbot, StreamElements, Fossabot and Moobot public command
lists, coexisting with 7TV's ":" emote popup.

## Completed
- [x] Spec, build rounds, critics, pre-publish audit (`docs/audit/SUMMARY.md`), five code fixes.
- [x] Evidence folders (screenshots, logs, DOM dumps, recordings) removed from the public tree and
      gitignored; audit reports moved to `docs/audit/`.
- [x] Clean single-root history on `main`; identity, path, e-mail, IP and secret scans 0.
- [x] First push, package.json repository links, `.env`-aware `npm run sign`.
- [x] Mozilla signing of 0.1.0; permanent install; both host permissions switched on.

## Key decisions
- Evidence never published (owner, 2026-10-22): `docs/critics/` and `docs/recordings/` are ignored
  paths kept on the development machine; `local-history` keeps the old commits locally.
- Name "7tv-cmd" and id `7tv-cmd@example.com` kept, with an "unofficial" line in README and the
  manifest description; the id is now permanent (signed once).
- Data collection declared as `browsingActivity` (channel login goes to four providers).
- Mozilla API keys live only in `.env` (gitignored) and are used in-process by
  `node --env-file-if-exists=.env`; nothing prints them. The owner's AMO key pair was regenerated on
  2026-10-22; the JWT issuer changes on every regenerate.

## Dead ends
- Driving the "Revoke and regenerate credentials" click from a session: denied by the auto-mode
  classifier (Secret-Store Writes); the owner clicks it and fills `.env` himself.
- Installing the signed xpi by opening its `file:///` path while a temporary add-on with the same
  id is loaded: installs silently as an upgrade, hidden (`visible:false`) until the temporary one
  is removed, and with both optional host permissions off. Remove the temporary add-on in
  about:debugging, then switch the permissions on in about:addons.
- `gh repo create --push` over SSH fails here (no GitHub SSH key); `gh config set git_protocol
  https` and an https remote work.

## Files changed
- `README.md` -- status (signed), install steps 3-4, Verified/Evidence sections without file pointers.
- `.gitignore` -- `docs/critics/`, `docs/recordings/`, `.env`.
- `package.json` -- repository/homepage/bugs; `sign` script reads `.env`.
- `docs/LEDGER.md` -- "Evidence folders" section; `docs/SPEC.md`, `docs/audit/*` -- path updates.
