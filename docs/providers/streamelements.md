# StreamElements public commands

Observed 2026-10-21. Evidence files: `docs/providers/streamelements.network.json` (Playwright capture of the public page), fixtures in `test/fixtures/streamelements/`.

## Public URL pattern

`https://streamelements.com/<login>/commands` where `<login>` is the Twitch login (lowercase, e.g. `coconutb`). The page is a client-rendered app (title "StreamElements | CoconutB", text "A list of chat commands enabled in chat"); the data comes from the API chain below.

## Endpoint chain (as captured from the page, then reproduced with node fetch)

| # | Method | URL template | Request headers the page sent | CORS seen |
|---|--------|--------------|-------------------------------|-----------|
| 1 | GET | `https://api.streamelements.com/kappa/v2/channels/<login>` | `Accept: application/json`, `Origin`, `Referer` only | `Access-Control-Allow-Origin: *` |
| 2 | GET | `https://api.streamelements.com/kappa/v2/bot/commands/<id>` | same | `*` |
| 3 (page only) | GET | `https://api.streamelements.com/kappa/v2/bot/commands/<id>/default` | same | `*` |
| 4 (page only, not needed) | GET | `https://api.streamelements.com/kappa/v2/loyalty/<id>` | same | `*` |

No authorization header, no x-* header, no cookie. The direct node fetches (only `User-Agent: 7tv-cmd-research/0.1`) got the same 200 responses, so no header is required.

## Login to provider id

Step 1 returns the channel object; `<id>` is `$._id` (24 hex chars, StreamElements' own id). `$.providerId` is the Twitch numeric user id (coconutb: 56395702, the same value Nightbot reports as its `providerId`). `$.username` / `$.alias` echo the login. The endpoint is shared with other platforms (`$.provider` = "twitch" here).

## Response shape

Step 2 returns a bare JSON array (list path `$`), no wrapper object, no pagination. One element:

```
{"cooldown":{"user":15,"global":5},"_id":"...","channel":"<id>","command":"247","aliases":[],
 "keywords":[],"titleKeywords":[],"enabled":true,"enabledOnline":true,"enabledOffline":true,
 "hidden":false,"cost":0,"type":"say","accessLevel":100,"reply":"...","regex":"",
 "startsAt":"0001-01-01T00:00:00.000Z","expiresAt":"0001-01-01T00:00:00.000Z","createdAt":"...","updatedAt":"..."}
```

| Need | JSON path (per element) | Notes |
|------|------------------------|-------|
| name | `command` | no leading "!" in any of the 270 elements seen |
| aliases | `aliases[]` | array of strings; non-empty on 9/176, 1/19, 4/75 |
| response | `reply` | may contain `${...}` variables and newlines |
| cooldown | `cooldown.user`, `cooldown.global` | seconds |
| user level | `accessLevel` | number; observed 100, 500, 1000 (meaning of each value is not stated anywhere in the captures; 100 is the default everyone level) |
| enabled | `enabled`, `enabledOnline`, `enabledOffline` | booleans |
| hidden | `hidden` | boolean, `false` on every element seen |
| other | `type` (say/whisper/mention), `cost` (loyalty points, 0 everywhere), `keywords`, `titleKeywords`, `regex` (set on 2 of ludwig's), `startsAt`/`expiresAt` ("0001-01-01..." means unset), `createdAt`, `updatedAt`, `channel`, `_id` | |

### Disabled and hidden commands

DISABLED COMMANDS ARE IN THE RESPONSE. `enabled:false` counts: coconutb 16 of 176, kaicenat 5 of 19, ludwig 69 of 75. `enabledOnline:false` on 4 of coconutb's; `enabledOffline:false` on 4 (coconutb) and 1 (ludwig). An extension must filter on `enabled === true` (and decide on online/offline). `hidden:true` was never observed, so it is unknown whether the API returns hidden commands; filter on it anyway. Whether the public page itself drops disabled rows was not checked.

### Default (built-in) commands

Step 3 is a separate array (72 elements for coconutb, 32 KB): `{_id, command, commandId, commands[], accessLevel, enabled, enabledOnline, enabledOffline, moduleId, cost, cooldown, aliases, regex, description, subCommands[], moduleEnabled}`. Built-ins such as `accountage` appear only here, with `description` instead of `reply`. Saved as `coconutb.commands-default.json` only; the other channels were not fetched.

## Cache and rate limit

- `Cache-Control`: absent on every response. `cf-cache-status: DYNAMIC` (not edge-cached). `Vary: Accept-Encoding`.
- Rate limit headers on every 200: `x-ratelimit-bucket: global`, `x-ratelimit-limit: 10000`, `x-ratelimit-remaining: 9999` (never lower in 14 requests), `x-ratelimit-reset` (epoch milliseconds). Saved in each `.meta.json`.
- Payload sizes: 89 KB for 176 commands, so fetch once per channel and cache client-side.

## robots.txt and ToS

- `https://streamelements.com/robots.txt`: `User-agent: *`, `Allow: /`, `Disallow: /overlay/`, `Disallow: /dashboard/`, `Sitemap: https://streamelements.com/sitemap.xml`. Nothing about `api.streamelements.com` (its own robots.txt was not fetched).
- `https://streamelements.com/terms` (28681 chars of text; `/terms-of-service` is an empty app shell): a keyword scan for automated, scrape, crawl, spider, robot, harvest, data mining, reverse engineer, bot, API found 5 sentences, none about automated reads. Closest line (truncated): "Restrictions You shall not: (i) copy, distribute or modify any part of the Services without our prior written authorization; (ii) use, modify, create derivative works of, transfer (by sale, resale, license, sublicense, download or otherwise), reproduce, distribute, display or disclose Content (as defined below), except ..." and "(iii) disassemble, reverse engineer, decompi[le] ...". No explicit statement about reading the public commands API.

## Channels

| Login | `$._id` | Elements | enabled:true |
|-------|---------|----------|--------------|
| coconutb | 5a2483d1eae4510001c047e5 | 176 | 160 |
| kaicenat | 607f0112ffa1497aa7c07208 | 19 | 14 |
| ludwig | 5bb4010a860cde54a36f2339 | 75 | 6 |

Fixtures: `<login>.channel.json`, `<login>.commands.json` (+ `.meta.json`), plus `coconutb.commands-default.json`.

## Negative cases

- `twitch` (a Twitch login that StreamElements knows): `GET channels/twitch` -> 200 with a channel object (`_id` 5acfe952e0d91f2b7a59bfe3), then `GET bot/commands/<id>` -> 200, body `[]` (2 bytes). Fixtures `_negative-twitch.channel.json`, `_negative-twitch.commands.json`.
- Login with no StreamElements record (`zz7tvcmdnosuchuser`, not a real Twitch account): 404, body `{"statusCode":404,"error":"Not Found","message":"channel zz7tvcmdnosuchuser was not found"}`, CORS `*` still present. Fixture `_negative-nosuchuser.channel.json`. A real Twitch user unknown to StreamElements was not found within the budget.

## Request count

14 requests to StreamElements domains: 1 Playwright visit, 11 in the chain script (3 chains x 2 = 6, `twitch` 2, robots 1, ToS probes `/terms-of-service` and `/terms` 2), 1 default-commands fetch, 1 unknown-login fetch. Total 1 + 11 + 1 + 1 = 14.

## Open questions

- Does `channels/<login>` accept an uppercase login or a numeric Twitch id? (Only lowercase logins tried.)
- Meaning of `accessLevel` values 100/500/1000 and whether 300/400 (subscriber/regular) exist.
- Whether `hidden:true` commands are returned, and whether the public page filters disabled rows.
- Rate limit scope (global bucket of 10000; per IP or per app is not stated).
- Whether users that renamed their Twitch account resolve by new login.
