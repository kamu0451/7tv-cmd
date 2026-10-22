# 7tv-cmd: project rules

- Public repository. Tracked files never carry the owner's account name, handles, e-mail, machine
  paths, session ids or screenshots; run a scan over `git ls-files` before every push.
- `docs/critics/` and `docs/recordings/` are ignored evidence folders (screenshots, logs, DOM dumps,
  recordings). Never un-ignore them, never publish their contents, never cite a file in them from
  README as if it were in the repo.
- `local-history` is a local branch holding the pre-publish history. Never push it; `main` is the
  only published branch.
- `.env` holds the Mozilla add-on API keys. Never read, print or echo it; `npm run sign` loads it
  in-process (`node --env-file-if-exists=.env`). Checks on it print only whether the variables are
  set and well-formed.
- Signing a new version: bump the version first (Mozilla refuses a version it has seen), build,
  lint, test, then `npm run sign -- --upload-source-code web-ext-artifacts/7tv-cmd-source.zip` with
  the archive from `git archive -o web-ext-artifacts/7tv-cmd-source.zip HEAD`.
- Live tests touch twitch.tv and the four providers read-only, logged out, at most one fetch cycle
  per channel per hour; no chat message is sent by any test.
