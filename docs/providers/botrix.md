# Botrix (botrix.live)

Status: endpoint verified keyless, but NO channel with a non-empty command list was found in 14 tries, so the
populated response shape is NOT observed (field names below come from the site's own JS bundle, marked "bundle").

Captured 2026-10-21. Capture file: docs/providers/botrix.network.json (2 visits). Fixtures: test/fixtures/botrix/.

## Public URL pattern
- Twitch: `https://botrix.live/p/<login>/commands` (Angular route `p/:id/commands`, bundle). The component sets
  platform "twitch" by default and "kick" when the path starts with `/k/`; Kick page is `/k/<id>/commands`,
  YouTube `/y/<id>/commands`. `/commands/:id` redirects to `/`. A `t/:id` route also exists (purpose not checked).
- Observed page: `https://botrix.live/p/auronplay/commands`, title "auronplay Commands | BotRix ...",
  text "Auronplay hasn't added any custom commands yet."

## Endpoint chain (observed in the Playwright capture)
1. `GET https://botrix.live//api/public/commands?user=<login>&platform=twitch`
   - The page itself calls it with a DOUBLE slash after the host; the single-slash form also works (direct fetches below).
   - Request headers the page sent: accept, referer, `x-csrf-token` (a per-session value, value redacted in the capture),
     stock Chromium user-agent. No authorization header. No cookie needed: direct node fetches with only
     `User-Agent: 7tv-cmd-research/0.1` returned the same bodies (all 14 requests, HTTP 200).
   - Response headers: `content-type: application/json`, `cache-control: max-age=150`, `server: cloudflare`,
     `vary: accept-encoding`. NO `access-control-allow-origin` header, NO ratelimit headers.
   - CORS consequence: a content script on twitch.tv cannot read this cross-origin; the extension's background
     script/service worker needs host permission `https://botrix.live/*` and fetches there (design choice for the build, not tested here).

## Login -> provider id
None. The Twitch login (lowercase) is sent as `user`. The `platform` parameter is required in practice (page always sends it).

## Response shape
- Unknown user: HTTP 200, body `{"error":true}` (14 bytes). The page then does `location.assign("/")`.
- Known user with no commands: HTTP 200, body `[]`.
- Populated list (bundle only, NOT observed): array of objects; the page code reads `cmd` (command name), `msg`
  (response text) and `allowed_roles` (array containing "all" or role names), sorts by `cmd`.
  Client-side only: drops commands whose cmd/msg contain bad words, strips `<hideText>...</hideText>`, resolves
  `<ifPLATFORM>...</ifPLATFORM>` blocks by platform. Aliases, cooldown and enabled flag: no field seen in the code path; unknown.
- Disabled/hidden commands: unknown (no populated sample). Pagination: none in the API; the page paginates client-side (PrimeNG paginator).

## Channels tried (14 API requests)
| login | HTTP | body | count |
|---|---|---|---|
| auronplay | 200 | `[]` | 0 |
| spursito | 200 | `[]` | 0 |
| thegrefg | 200 | `[]` | 0 |
| twitch (negative) | 200 | `{"error":true}` | n/a |
| botrix, coconutb, elxokas, ibai, knekro, illojuan, vegetta777, ampeter, reventxz, alexby11 | 200 | `{"error":true}` | n/a |

Only the 3 `[]` responses and the negative case are kept as fixtures (test/fixtures/botrix/<login>.commands.json + .meta.json,
`_negative-twitch.commands.*`). The error-body channels were guesses at who uses Botrix; there is no public directory (search
engines returned nothing useful).

## Cache / rate limit
`cache-control: max-age=150` on every API response. No ratelimit headers on 14 requests in a few seconds. Behind Cloudflare.

## robots and terms
- `https://botrix.live/robots.txt`: `User-Agent: *`, `Allow: /`, then `Disallow: /api`, `/sync`, `/alertas*`, `/widgets*`, `/alerts*`.
  The commands endpoint lives under the disallowed `/api` prefix. robots.txt governs crawlers, not a user-initiated
  browser action, but treat it as a risk to raise with the owner before shipping.
- Terms: linked from the site as `https://botrix.live/docs/#/?id=_6-terms-and-conditions` (docsify page). The capture only kept the
  first 6000 characters of rendered text, which ended before section 6, so the terms text was NOT read: unverified.

## Request count used: 20 of 20 (homepage 1, robots 1, main.js 1, docs/README.md 404 1, API 14, page visits 2)

## Open questions
- Find one channel with real commands and record the populated shape (cooldown, aliases, enabled).
- Does the API require the `x-csrf-token` when called at volume, or from a browser Origin (`Origin: moz-extension://...`)?
- Read the terms section 6 fully.
