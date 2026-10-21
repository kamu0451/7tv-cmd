# Fossabot public commands

Observed 2026-10-21. Evidence: `docs/providers/fossabot.network.json` (Playwright capture of `https://fossabot.com/twitchdev/commands`), fixtures in `test/fixtures/fossabot/`.

## Public URL pattern

`https://fossabot.com/<slug>/commands`. For every channel seen the slug equals the lowercase Twitch login (twitchdev, kaajak1, ipqow). A search result also listed a legacy form `https://fossabot.com/commands/ipqow` (not visited). The site is a client-rendered app: for an unknown slug the document still returns HTTP 200 (26692-byte shell) and the app then renders "404 Page not found" after the API lookup fails (observed for `coconutb`, which does not use Fossabot).

## Endpoint chain (captured from the page for twitchdev, reproduced with node fetch)

| # | Method | URL template | Headers the page sent | CORS seen |
|---|--------|--------------|-----------------------|-----------|
| 1 | GET | `https://fossabot.com/api/v2/cached/channels/by-slug/<slug>` | `Accept: application/json`, four `fossadev-*` client headers (build id, client name, client id, version), sentry baggage, `Referer` | `Access-Control-Allow-Origin: *` |
| 2 (page only) | GET | `https://fossabot.com/api/v2/cached/channels/<id>/stream` | same | `*` |
| 3 | GET | `https://fossabot.com/api/v2/cached/channels/<id>/commands` | same | `*` |

The `fossadev-*` headers are NOT required: the node fetches sent only `User-Agent: 7tv-cmd-research/0.1` and got 200 on steps 1 and 3 (the script was written to retry with the headers on a 400/401/403, which never triggered). No cookie, no authorization.

## Login to provider id

`by-slug/<slug>` returns `{"channel":{"id":"28372","login":"twitchdev","display_name":"TwitchDev","avatar":"...","slug":"twitchdev","broadcaster_type":"partner","provider":"twitch","provider_id":"141981764","provider_url":"twitch.tv/twitchdev","created_at":"..."},"parent":{"id":"28369","type":"channel","parent_id":"28372"}}`. `<id>` = `$.channel.id` (Fossabot's own id, a string: "28372", "751" and "738161041054085120" all occur). `$.channel.provider_id` is the Twitch numeric user id. The slug namespace is shared with Fossabot's other platforms (Kick, YouTube, X per the site title), so a login/slug collision is possible; `$.channel.provider` was "twitch" in all four hits.

## Response shape

Step 3 returns `{"roles":[...],"commands":[...]}` (list path `$.commands`, no pagination; 72 commands = 14 KB in one response).

```
{"enabled_offline":true,"enabled_online":true,"id":"CAEQBhoFNzM2ODk","name":"discord",
 "response":"Join the TwitchDev Discord: https://link.twitch.tv/devchat","type":"custom",
 "aliases":[],"role_ids":[]}
```

| Need | JSON path | Notes |
|------|-----------|-------|
| name | `$.commands[].name` | no leading "!" on any of the 156 commands seen |
| aliases | `$.commands[].aliases[]` | non-empty on 5/32, 15/72, 21/51 |
| response | `$.commands[].response` | text with Fossabot variables such as `@$(user)`, `$(uptime)`, `$(math "$(query)")` |
| cooldown | not exposed | no cooldown field in any command object |
| user level | `$.commands[].role_ids[]` joined to `$.roles[].id` -> `$.roles[].name` | empty `role_ids` = no restriction (the rendered page shows no "Roles:" line for those); role names seen: Broadcaster, Moderator, "[Imported] Channel Editor", "[Imported] Channel Admin" (`default` true for the first two) |
| enabled | `enabled_online`, `enabled_offline` | there is no single `enabled` flag |
| other | `id`, `type` ("custom" or "default") | |

### Disabled, hidden, default commands

Commands with one flag false are returned: `enabled_online:false` on 1 of twitchdev's 32; `enabled_offline:false` on 2 of kaajak1's 72 and 1 of ipqow's 51. A command disabled on both flags never appeared, so whether the API omits fully disabled commands is unknown. Default commands (`type:"default"`, e.g. `addcmd`, `permit`) ARE included: 4/32 twitchdev, 18/72 kaajak1, 26/51 ipqow, 1/1 twitch; the rendered page lists them too ("!addcmd ... Roles: Moderator"). No hidden flag exists.

## Cache and rate limit

- Step 1: `Cache-Control: max-age=30`, `cf-cache-status` HIT/EXPIRED/MISS, `age` up to 901 s, `last-modified`, `Vary: Origin, accept-encoding` (Cloudflare caches it).
- Step 3: no `Cache-Control`, but `cf-cache-status` HIT/EXPIRED/MISS with `last-modified`; the list can be up to ~15 minutes old.
- Rate limit headers on every response: `x-ratelimit-bucket: ip`, `x-ratelimit-total: 30`, `x-ratelimit-remaining` (29 down to 26 over consecutive calls), `x-ratelimit-reset` (epoch seconds, a few seconds after the request). Window length not determined; budget at most 2 requests per channel per session.

## robots.txt and ToS

- `https://fossabot.com/robots.txt`: `# https://www.robotstxt.org/robotstxt.html`, `User-agent: *`, `Disallow:` (everything allowed).
- Terms of Service: `https://fossabot.com/pages/terms` (footer link; `/terms` is a 404 shell). Read through WebFetch, whose summariser returned (so treat the wording as unverified, truncated by the tool): section 2.2 prohibited conduct, "Systematically retrieve data or other content from the Site to a compile database or directory without written permission" (the bullet continues "from us"). That clause is about compiling a database from the Site; a per-user, on-demand read of one channel's public list is not obviously covered but the line is the nearest thing to an automated-read rule.

## Channels

| Login/slug | `$.channel.id` | `$.commands` length | default-type | custom |
|------------|----------------|---------------------|--------------|--------|
| twitchdev | 28372 | 32 | 4 | 28 |
| kaajak1 | 738161041054085120 | 72 | 18 | 54 |
| ipqow | 751 | 51 | 26 | 25 |
| twitch (extra, positive) | 426448839558516736 | 1 | 1 | 0 |

## Negative case

`coconutb` (exists on Twitch, no Fossabot): `GET by-slug/coconutb` -> 404, 84 bytes, `{"code":"not_found","error":"Not Found","message":"Resource not found","status":404}`, CORS `*`, `Cache-Control: max-age=30`. Fixture `_negative-coconutb.channel.json`. The commands endpoint for an unknown id was not tried.

## Request count

16 requests to Fossabot domains: 3 Playwright visits (`/coconutb/commands`, `/twitchdev/commands`, `/terms`), 11 in the chain script (3 x 2 chain + 2 for `twitch` + robots + 2 ToS guesses), 1 `by-slug/coconutb` fixture, 1 WebFetch of `/pages/terms`.

## Open questions

- Is the slug always the Twitch login (rename, case, Kick/YouTube collisions)?
- Does a fully disabled command (both flags false) ever appear?
- Rate-limit window length for the `ip` bucket (30 total).
- Is there a cooldown anywhere (not in `commands`)?
- The `fossadev-*` headers are optional today; unknown if they become mandatory.
- The ToS wording above came via a summariser, not a verbatim read.
