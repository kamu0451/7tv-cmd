# Streamlabs Cloudbot (streamlabs.com)

Status: NO public per-channel commands page found. Observed for ONE channel (coconutb), so this is a negative result, not a proof.
Captured 2026-10-21. Capture file: docs/providers/streamlabs.network.json (1 visit, 31 requests kept). No fixtures.

## What was observed
- `https://streamlabs.com/coconutb/commands` -> 302 -> `https://streamlabs.com/coconutb/p/commands/` -> 301 ->
  `https://streamlabs.com/coconutb/p/commands` -> 200. The final page is the creator's public tip/donation page
  (title "coconutb / Streamlabs"; text: Donate, Feed, store, leaderboard, media share). No commands list is rendered.
  `https://streamlabs.com/coconutb` alone redirects to `/coconutb/tip` and returns the same 42,022-byte shell.
- `https://streamlabs.com/cloudbot/commands/coconutb` -> 404.
- API calls the page made (all `GET`, `application/json`, no authorization header; the id segment is the creator's Streamlabs hash, 15 hex chars):
  - `https://streamlabs.com/api/v6/user/<login>` (200, 303 bytes)
  - `https://streamlabs.com/api/v6/site/<login>` (200)
  - `https://streamlabs.com/api/v6/<id>/chatbot/data/twitch_account` (200, 212 bytes)
  - `https://streamlabs.com/api/v6/<id>/cloudbot/status` (200, 62 bytes; body not saved)
  - plus tip, leaderboard, media-share, merchandise, pro/gif endpoints; `/api/v6/csrf-token` answered 401 four times.
  No request in the capture has "command" in its URL.
- Login -> id mapping exists publicly: `/api/v6/user/<login>` is the first call; the id used in later URLs comes from it (response body not saved, so the key name is unverified).

## Endpoint chain
None established for commands. Bot command data lives behind the authenticated Cloudbot dashboard (not observable without login).

## robots and terms
- `https://streamlabs.com/robots.txt`: `User-agent: *`, `Allow: /`, `Disallow: /api/*` (also `/widgets/*`, `/alert-box/*`, `/logout*`, ...). The API prefix is disallowed for crawlers.
- Terms: `https://streamlabs.com/terms` fetched; the static HTML carries only ~3.7 KB of text (the terms render client-side), so nothing about automated reads could be checked: unverified.

## Channels and negative case
coconutb only (no commands shown). No other channels tried, no negative fixture (no endpoint).

## Request count used: 6 of 20 (robots 1, 3 URL probes, 1 Playwright visit, terms 1). Visits: 1 of 3.

## Open questions
- Does a channel with an enabled Cloudbot public-commands option exist (Cloudbot dashboard has none that we could see without login)? A second channel was not tried.
- Body of `/api/v6/user/<login>` and `cloudbot/status` (not saved).
