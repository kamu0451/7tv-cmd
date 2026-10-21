# Providers

Assembled by tools/dev/assemble-providers.mjs from docs/gate-7tv.md and docs/providers/*.md.
The per-provider sections are copied from the research docs (2026-10-21); the code that uses them
is src/providers/<id>.ts.

## Gate finding: does this already exist?

Source: docs/gate-7tv.md (2026-10-21; clones of SevenTV/Extension @ 69eaa09, v3.1.26,
FrankerFaceZ @ fe229ea, night/betterttv @ 1a61621, v7.7.28).

- 7TV: PARTIAL. It completes emotes after ":", chatter names in its Tab carousel and its own "/"
  commands; there is no "!" bot-command completion, no provider code (0 hits for nightbot,
  streamelements, fossabot, moobot, streamlabs in src) and no issue or PR asking for it
  (https://github.com/SevenTV/Extension/pull/1041 and /pull/853 are 7TV's own slash commands).
  Recording of 7TV with "!" typed: docs/recordings/gate-7tv-bang/.
- FrankerFaceZ: SHIPPED through the official add-on "Custom Commands Auto Completer" (v1.0.0,
  2026-02; StreamElements, Fossabot, Nightbot, Moobot; applied only when the bot is detected in the
  channel) https://github.com/FrankerFaceZ/Add-Ons/blob/master/src/custom-commands-auto-complete/manifest.json
  Not tested live.
- BetterTTV: SHIPPED for BTTV Pro (paid) users only, "Command Autocomplete" for Nightbot, Fossabot,
  Moobot and StreamElements, served from BTTV's own backend https://github.com/night/betterttv/pull/8202
- Chatterino (desktop): none; its completion covers its own and Twitch "/" commands
  https://github.com/Chatterino/chatterino2/pull/7289
- Standalone tools: none found that completes per-channel bot commands in the Twitch web input.

Decision (docs/LEDGER.md, round 0 -> 1): BUILD, as a standalone extension that coexists with 7TV
and needs no account and no paid tier.


## Supported providers (v1)

Priority order of the registry (src/providers/index.ts): nightbot (badge NB), streamelements (SE), fossabot (FB), moobot (MB). Only moobot needs a host permission (https://moo.bot/*).

### Nightbot public commands

Observed 2026-10-21. Evidence: `docs/providers/nightbot.network.json` (Playwright capture of `https://nightbot.tv/t/coconutb/commands`), fixtures in `test/fixtures/nightbot/`.

#### Public URL pattern

`https://nightbot.tv/t/<login>/commands`, `<login>` = lowercase Twitch login. A client-rendered app (page title "CoconutB's Commands", columns Command / Message / User-Level).

#### Endpoint chain (captured from the page, reproduced with node fetch)

| # | Method | URL template | Required headers | CORS seen |
|---|--------|--------------|------------------|-----------|
| 1 | GET | `https://api.nightbot.tv/1/channels/twitch/<login>` | none (page sent `Accept: */*`, `Origin`, `Referer`) | `Access-Control-Allow-Origin` reflects the request Origin |
| 2 | GET | `https://api.nightbot.tv/1/commands` | `Nightbot-Channel: <id>` | same |

Note the exact path: the page calls `/1/channels/twitch/<login>` (the provider segment is `twitch`, not `t`). No Authorization header, no cookie.

`Nightbot-Channel` IS required: the same GET without it returned 400 `{"message":"invalid channel","status":400}` (fixture `_negative-noheader.commands.json`).

CORS detail: no `Access-Control-Allow-Origin` is sent when the request has no `Origin` (`Vary: Origin`). With `Origin: https://nightbot.tv` (the page) the value is that origin. With `Origin: https://www.twitch.tv`: the preflight `OPTIONS /1/commands` (request headers `nightbot-channel`) returned 204 with `Access-Control-Allow-Origin: https://www.twitch.tv`, `Access-Control-Allow-Headers: Authorization, Nightbot-Channel, Pragma, Cache-Control, Content-Type`, `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`, `Access-Control-Max-Age: 86400`; the real GET with that Origin returned 200 and the same ACAO. So a twitch.tv content script can read it; a background fetch works too. (Only the origin `https://www.twitch.tv` was tested.)

#### Login to provider id

Step 1 body: `{"channel":{"_id":"56c7e73d70447e267df1f19d","createdAt":"...","updatedAt":"...","name":"coconutb","displayName":"CoconutB","avatar":"...","provider":"twitch","providerId":"56395702","admin":false},"status":200}`. `<id>` = `$.channel._id` (24 hex chars, Nightbot's own id, sent back as the `Nightbot-Channel` header). `$.channel.providerId` is the Twitch numeric user id.

#### Response shape

Step 2: `{"_total":75,"commands":[...],"status":200}`. List path `$.commands`; `_total` equalled the array length in all four fixtures (75, 102, 1, 4); no pagination parameter was seen.

```
{"_id":"679d62866f63a9591272740d","createdAt":"...","updatedAt":"...","name":"luxdrop","alias":"",
 "message":"Use https://luxdrop.com/r/COCO ...","userLevel":"everyone","count":0,"coolDown":5}
```

| Need | JSON path (per element) | Notes |
|------|------------------------|-------|
| name | `name` | usually WITH a leading "!" (74/75 coconutb, 97/102 nickmercs, 4/4 twitch) but not always ("luxdrop", lirik's single command): strip a leading "!" before matching |
| aliases | `alias` | a single string, present on 19/75 coconutb elements, always "" in the fixtures; no non-empty value observed |
| response | `message` | |
| cooldown | `coolDown` | seconds (capital D); values seen 5 and 30 |
| user level | `userLevel` | "everyone" and "moderator" seen |
| enabled | none | no enabled/hidden field in the object |
| other | `count` (use counter), `_id`, `createdAt`, `updatedAt` | |

Disabled/hidden: there is no flag, so none can be seen; whether the public endpoint withholds any command is unknown. Built-in Nightbot commands (!commands, !title, ...) were not checked for in the lists; `api-docs.nightbot.tv` documents them under a separate `GET /1/commands/default`, which the page does not call and we did not request. One element contains a space in its name (coconutb), so do not assume single-token names.

#### Cache and rate limit

- No `Cache-Control` on any response; `cf-cache-status: DYNAMIC`; `Vary: Origin`.
- No rate-limit header on any response. The only limit stated in `https://api-docs.nightbot.tv/` (via WebFetch) is for sending channel messages ("1 request per 5 seconds"); nothing for `GET /commands`.
- Sizes: 22 KB for 75 commands, 30 KB for 102.

#### robots.txt and ToS

- `https://nightbot.tv/robots.txt` returns HTTP 200 with the HTML app shell (`text/html`, 1403 bytes), so there is effectively no robots.txt.
- Terms of Service `https://nightbot.tv/terms` (last updated February 12, 2024; rendered with Playwright, 15598 chars). A keyword scan found 6 sentences, none about automated reads or scraping (they are about auto-renewing subscriptions, YouTube API Services, and a footer reading "Terms of Service - Privacy Policy - API Documentation" linking to https://api-docs.nightbot.tv/). Nothing relevant found at https://nightbot.tv/terms.
- `https://api-docs.nightbot.tv/` documents `GET https://api.nightbot.tv/1/commands` (scope `commands`) as the current API user's list with an `Authorization: Bearer` token and does not mention the `Nightbot-Channel` header, so the unauthenticated, header-based call the public page makes is undocumented.

#### Channels

| Login | `$.channel._id` | `$.commands` length |
|-------|-----------------|---------------------|
| coconutb | 56c7e73d70447e267df1f19d | 75 |
| nickmercs | 56c7f20970447e267df5b5e8 | 102 |
| lirik | 5a8afd44280d2872dd8f3b7f | 1 |
| twitch (extra, positive) | 681b9ae30106b63fb2471648 | 4 |

#### Negative cases

- Login unknown to Nightbot (dansgaming, summit1g, timthetatman, all real Twitch accounts): step 1 -> 404 `{"message":"user not found","status":404}` (41 bytes). Fixtures `_negative-dansgaming.channel.json`, `_negative-summit1g.channel.json`, `_negative-timthetatman.channel.json`.
- Missing `Nightbot-Channel`: 400 `{"message":"invalid channel","status":400}`.
- The suggested negative "twitch" is NOT negative here: it exists on Nightbot with 4 commands (kept as the positive fixture `twitch.*`).

#### Request count

20 requests to Nightbot domains: 2 Playwright visits (`/t/coconutb/commands`, `/terms`), 14 in the chain script (coconutb, lirik, nickmercs = 6 for chains, 3 x 404 candidates, `twitch` 2, robots 1, two ToS guesses 2), 2 CORS probes (OPTIONS + GET), 1 no-header call, 1 WebFetch of `api-docs.nightbot.tv`. Total 2 + 14 + 2 + 1 + 1 = 20.

#### Open questions

- Does `channels/twitch/<login>` also accept a Twitch numeric id (would remove the dependence on the login)?
- Rate limits for the public read are unknown (no headers).
- Is the unauthenticated `Nightbot-Channel` call a supported public interface? The documented API requires OAuth, so it could change without notice.
- Do default commands ever appear in `/1/commands`?
- Can `alias` ever be non-empty, and what separator does it use?

### StreamElements public commands

Observed 2026-10-21. Evidence files: `docs/providers/streamelements.network.json` (Playwright capture of the public page), fixtures in `test/fixtures/streamelements/`.

#### Public URL pattern

`https://streamelements.com/<login>/commands` where `<login>` is the Twitch login (lowercase, e.g. `coconutb`). The page is a client-rendered app (title "StreamElements | CoconutB", text "A list of chat commands enabled in chat"); the data comes from the API chain below.

#### Endpoint chain (as captured from the page, then reproduced with node fetch)

| # | Method | URL template | Request headers the page sent | CORS seen |
|---|--------|--------------|-------------------------------|-----------|
| 1 | GET | `https://api.streamelements.com/kappa/v2/channels/<login>` | `Accept: application/json`, `Origin`, `Referer` only | `Access-Control-Allow-Origin: *` |
| 2 | GET | `https://api.streamelements.com/kappa/v2/bot/commands/<id>` | same | `*` |
| 3 (page only) | GET | `https://api.streamelements.com/kappa/v2/bot/commands/<id>/default` | same | `*` |
| 4 (page only, not needed) | GET | `https://api.streamelements.com/kappa/v2/loyalty/<id>` | same | `*` |

No authorization header, no x-* header, no cookie. The direct node fetches (only `User-Agent: 7tv-cmd-research/0.1`) got the same 200 responses, so no header is required.

#### Login to provider id

Step 1 returns the channel object; `<id>` is `$._id` (24 hex chars, StreamElements' own id). `$.providerId` is the Twitch numeric user id (coconutb: 56395702, the same value Nightbot reports as its `providerId`). `$.username` / `$.alias` echo the login. The endpoint is shared with other platforms (`$.provider` = "twitch" here).

#### Response shape

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

##### Disabled and hidden commands

DISABLED COMMANDS ARE IN THE RESPONSE. `enabled:false` counts: coconutb 16 of 176, kaicenat 5 of 19, ludwig 69 of 75. `enabledOnline:false` on 4 of coconutb's; `enabledOffline:false` on 4 (coconutb) and 1 (ludwig). An extension must filter on `enabled === true` (and decide on online/offline). `hidden:true` was never observed, so it is unknown whether the API returns hidden commands; filter on it anyway. Whether the public page itself drops disabled rows was not checked.

##### Default (built-in) commands

Step 3 is a separate array (72 elements for coconutb, 32 KB): `{_id, command, commandId, commands[], accessLevel, enabled, enabledOnline, enabledOffline, moduleId, cost, cooldown, aliases, regex, description, subCommands[], moduleEnabled}`. Built-ins such as `accountage` appear only here, with `description` instead of `reply`. Saved as `coconutb.commands-default.json` only; the other channels were not fetched.

#### Cache and rate limit

- `Cache-Control`: absent on every response. `cf-cache-status: DYNAMIC` (not edge-cached). `Vary: Accept-Encoding`.
- Rate limit headers on every 200: `x-ratelimit-bucket: global`, `x-ratelimit-limit: 10000`, `x-ratelimit-remaining: 9999` (never lower in 14 requests), `x-ratelimit-reset` (epoch milliseconds). Saved in each `.meta.json`.
- Payload sizes: 89 KB for 176 commands, so fetch once per channel and cache client-side.

#### robots.txt and ToS

- `https://streamelements.com/robots.txt`: `User-agent: *`, `Allow: /`, `Disallow: /overlay/`, `Disallow: /dashboard/`, `Sitemap: https://streamelements.com/sitemap.xml`. Nothing about `api.streamelements.com` (its own robots.txt was not fetched).
- `https://streamelements.com/terms` (28681 chars of text; `/terms-of-service` is an empty app shell): a keyword scan for automated, scrape, crawl, spider, robot, harvest, data mining, reverse engineer, bot, API found 5 sentences, none about automated reads. Closest line (truncated): "Restrictions You shall not: (i) copy, distribute or modify any part of the Services without our prior written authorization; (ii) use, modify, create derivative works of, transfer (by sale, resale, license, sublicense, download or otherwise), reproduce, distribute, display or disclose Content (as defined below), except ..." and "(iii) disassemble, reverse engineer, decompi[le] ...". No explicit statement about reading the public commands API.

#### Channels

| Login | `$._id` | Elements | enabled:true |
|-------|---------|----------|--------------|
| coconutb | 5a2483d1eae4510001c047e5 | 176 | 160 |
| kaicenat | 607f0112ffa1497aa7c07208 | 19 | 14 |
| ludwig | 5bb4010a860cde54a36f2339 | 75 | 6 |

Fixtures: `<login>.channel.json`, `<login>.commands.json` (+ `.meta.json`), plus `coconutb.commands-default.json`.

#### Negative cases

- `twitch` (a Twitch login that StreamElements knows): `GET channels/twitch` -> 200 with a channel object (`_id` 5acfe952e0d91f2b7a59bfe3), then `GET bot/commands/<id>` -> 200, body `[]` (2 bytes). Fixtures `_negative-twitch.channel.json`, `_negative-twitch.commands.json`.
- Login with no StreamElements record (`zz7tvcmdnosuchuser`, not a real Twitch account): 404, body `{"statusCode":404,"error":"Not Found","message":"channel zz7tvcmdnosuchuser was not found"}`, CORS `*` still present. Fixture `_negative-nosuchuser.channel.json`. A real Twitch user unknown to StreamElements was not found within the budget.

#### Request count

14 requests to StreamElements domains: 1 Playwright visit, 11 in the chain script (3 chains x 2 = 6, `twitch` 2, robots 1, ToS probes `/terms-of-service` and `/terms` 2), 1 default-commands fetch, 1 unknown-login fetch. Total 1 + 11 + 1 + 1 = 14.

#### Open questions

- Does `channels/<login>` accept an uppercase login or a numeric Twitch id? (Only lowercase logins tried.)
- Meaning of `accessLevel` values 100/500/1000 and whether 300/400 (subscriber/regular) exist.
- Whether `hidden:true` commands are returned, and whether the public page filters disabled rows.
- Rate limit scope (global bucket of 10000; per IP or per app is not stated).
- Whether users that renamed their Twitch account resolve by new login.

### Fossabot public commands

Observed 2026-10-21. Evidence: `docs/providers/fossabot.network.json` (Playwright capture of `https://fossabot.com/twitchdev/commands`), fixtures in `test/fixtures/fossabot/`.

#### Public URL pattern

`https://fossabot.com/<slug>/commands`. For every channel seen the slug equals the lowercase Twitch login (twitchdev, kaajak1, ipqow). A search result also listed a legacy form `https://fossabot.com/commands/ipqow` (not visited). The site is a client-rendered app: for an unknown slug the document still returns HTTP 200 (26692-byte shell) and the app then renders "404 Page not found" after the API lookup fails (observed for `coconutb`, which does not use Fossabot).

#### Endpoint chain (captured from the page for twitchdev, reproduced with node fetch)

| # | Method | URL template | Headers the page sent | CORS seen |
|---|--------|--------------|-----------------------|-----------|
| 1 | GET | `https://fossabot.com/api/v2/cached/channels/by-slug/<slug>` | `Accept: application/json`, four `fossadev-*` client headers (build id, client name, client id, version), sentry baggage, `Referer` | `Access-Control-Allow-Origin: *` |
| 2 (page only) | GET | `https://fossabot.com/api/v2/cached/channels/<id>/stream` | same | `*` |
| 3 | GET | `https://fossabot.com/api/v2/cached/channels/<id>/commands` | same | `*` |

The `fossadev-*` headers are NOT required: the node fetches sent only `User-Agent: 7tv-cmd-research/0.1` and got 200 on steps 1 and 3 (the script was written to retry with the headers on a 400/401/403, which never triggered). No cookie, no authorization.

#### Login to provider id

`by-slug/<slug>` returns `{"channel":{"id":"28372","login":"twitchdev","display_name":"TwitchDev","avatar":"...","slug":"twitchdev","broadcaster_type":"partner","provider":"twitch","provider_id":"141981764","provider_url":"twitch.tv/twitchdev","created_at":"..."},"parent":{"id":"28369","type":"channel","parent_id":"28372"}}`. `<id>` = `$.channel.id` (Fossabot's own id, a string: "28372", "751" and "738161041054085120" all occur). `$.channel.provider_id` is the Twitch numeric user id. The slug namespace is shared with Fossabot's other platforms (Kick, YouTube, X per the site title), so a login/slug collision is possible; `$.channel.provider` was "twitch" in all four hits.

#### Response shape

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

##### Disabled, hidden, default commands

Commands with one flag false are returned: `enabled_online:false` on 1 of twitchdev's 32; `enabled_offline:false` on 2 of kaajak1's 72 and 1 of ipqow's 51. A command disabled on both flags never appeared, so whether the API omits fully disabled commands is unknown. Default commands (`type:"default"`, e.g. `addcmd`, `permit`) ARE included: 4/32 twitchdev, 18/72 kaajak1, 26/51 ipqow, 1/1 twitch; the rendered page lists them too ("!addcmd ... Roles: Moderator"). No hidden flag exists.

#### Cache and rate limit

- Step 1: `Cache-Control: max-age=30`, `cf-cache-status` HIT/EXPIRED/MISS, `age` up to 901 s, `last-modified`, `Vary: Origin, accept-encoding` (Cloudflare caches it).
- Step 3: no `Cache-Control`, but `cf-cache-status` HIT/EXPIRED/MISS with `last-modified`; the list can be up to ~15 minutes old.
- Rate limit headers on every response: `x-ratelimit-bucket: ip`, `x-ratelimit-total: 30`, `x-ratelimit-remaining` (29 down to 26 over consecutive calls), `x-ratelimit-reset` (epoch seconds, a few seconds after the request). Window length not determined; budget at most 2 requests per channel per session.

#### robots.txt and ToS

- `https://fossabot.com/robots.txt`: `# https://www.robotstxt.org/robotstxt.html`, `User-agent: *`, `Disallow:` (everything allowed).
- Terms of Service: `https://fossabot.com/pages/terms` (footer link; `/terms` is a 404 shell). Read through WebFetch, whose summariser returned (so treat the wording as unverified, truncated by the tool): section 2.2 prohibited conduct, "Systematically retrieve data or other content from the Site to a compile database or directory without written permission" (the bullet continues "from us"). That clause is about compiling a database from the Site; a per-user, on-demand read of one channel's public list is not obviously covered but the line is the nearest thing to an automated-read rule.

#### Channels

| Login/slug | `$.channel.id` | `$.commands` length | default-type | custom |
|------------|----------------|---------------------|--------------|--------|
| twitchdev | 28372 | 32 | 4 | 28 |
| kaajak1 | 738161041054085120 | 72 | 18 | 54 |
| ipqow | 751 | 51 | 26 | 25 |
| twitch (extra, positive) | 426448839558516736 | 1 | 1 | 0 |

#### Negative case

`coconutb` (exists on Twitch, no Fossabot): `GET by-slug/coconutb` -> 404, 84 bytes, `{"code":"not_found","error":"Not Found","message":"Resource not found","status":404}`, CORS `*`, `Cache-Control: max-age=30`. Fixture `_negative-coconutb.channel.json`. The commands endpoint for an unknown id was not tried.

#### Request count

16 requests to Fossabot domains: 3 Playwright visits (`/coconutb/commands`, `/twitchdev/commands`, `/terms`), 11 in the chain script (3 x 2 chain + 2 for `twitch` + robots + 2 ToS guesses), 1 `by-slug/coconutb` fixture, 1 WebFetch of `/pages/terms`.

#### Open questions

- Is the slug always the Twitch login (rename, case, Kick/YouTube collisions)?
- Does a fully disabled command (both flags false) ever appear?
- Rate-limit window length for the `ip` bucket (30 total).
- Is there a cooldown anywhere (not in `commands`)?
- The `fossadev-*` headers are optional today; unknown if they become mandatory.
- The ToS wording above came via a summariser, not a verbatim read.

### Moobot public commands

Observed 2026-10-21. Evidence: `docs/providers/moobot.network.json` (Playwright capture of `https://moo.bot/r/commands#pokimane`), fixtures in `test/fixtures/moobot/`. Moobot is the weakest provider of this group: the public list works, but only one of the five popular channels probed had any public command.

#### Public URL pattern

`https://moo.bot/r/commands#<login>` (listed in `https://moo.bot/sitemap.xml` as `https://moo.bot/r/commands`). The login is in the URL FRAGMENT, read by the page script (`location.hash`), so the server never sees it; with no fragment the page shows a login box and a "Show command list" button that sets the fragment. The docs page for `!Commands` says it "provides a link to a public list of all your active chat commands" and that "Moobot automatically hides disabled or restricted commands from the list" (moo.bot/docs/built-in-twitch-bot-chat-commands, quoted as returned by WebFetch).

#### Endpoint chain (captured from the page for pokimane)

Both calls are POST with a form body, not GET (the page's request helper defaults to `method:"POST"`, params as `application/x-www-form-urlencoded`).

| # | Method | URL | Headers | Body (observed) | CORS seen |
|---|--------|-----|---------|-----------------|-----------|
| 1 | POST | `https://moo.bot/a/1/channel/meta` | `Accept: application/json`, `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `Origin`, `Referer` | `name=<login>` | `Access-Control-Allow-Origin: https://moo.bot` |
| 2 | POST | `https://moo.bot/a/1/channel/public/commands/list` | same | `_limit=15&_offset=0&_order=identifier&channel=<userid>` | `https://moo.bot` |

No authorization header on the logged-out page (the helper only adds `Authorization: Token ...` for a logged-in user). Direct node fetches used only `User-Agent: 7tv-cmd-research/0.1`, `Accept`, `Content-Type` and got 200. The fixtures were fetched with `_limit=100` instead of the page's 15; the server accepted it, but every list was tiny (0 or 1 element), so whether 100 is clamped is unknown.

CORS: `Access-Control-Allow-Origin` was `https://moo.bot` on every response, including requests that sent no Origin, so it is a fixed value and not reflected. A content script on twitch.tv cannot read these responses; the extension must fetch from its background context with a `https://moo.bot/*` host permission.

#### Login to provider id

Step 1 body: `{"status":{"autojoin":false,"joined":true,"moderated":false},"channel":{"trial":true,"points":15,"userid":"44445592","username":"pokimane"},"version":476,"assistant":"1.1.14"}`. `$.channel.userid` is the Twitch numeric user id (so step 2 could be called with a Twitch id directly if the extension knew it, which it does not). Moobot returns a `channel` object for many Twitch users that merely have a (trial) Moobot record, whether or not they publish commands.

#### Response shape

Step 2: `{"list":[{"type":"custom","identifier":"topic","response":"Topic: <text> (by <by> <when> ago)"}],"_total":1}`. List path `$.list`.

| Need | JSON path | Notes |
|------|-----------|-------|
| name | `$.list[].identifier` | no "!" prefix; the page capitalises it ("Topic") |
| aliases | not exposed | |
| response | `$.list[].response` | custom commands use placeholder syntax in angle brackets, which the page renders as guillemets (<text> becomes "Chat text") |
| cooldown | not exposed | |
| user level | not exposed | restricted commands are hidden per the docs, so everything listed is open to viewers |
| enabled | not exposed | disabled commands hidden per the docs |
| other | `type` ("custom" only observed; built-in commands not seen) | |

Pagination: query-style params `_limit`, `_offset`, `_order` (page uses 15, `identifier`) and `$._total` in the response; page forward until `_offset >= _total`.

#### Cache and rate limit

`Cache-Control: no-cache, no-store, must-revalidate, private, no-cache, must-revalidate, max-age=60` (contradictory, effectively no caching), `Expires: 0`, `cf-cache-status: DYNAMIC`. No rate-limit headers. The page script knows a `RATE_LIMITED` error ("too many attempts in too short a period of time") but no limit value was observed.

#### robots.txt and ToS

- `https://moo.bot/robots.txt`: `User-Agent: *`, `Disallow: /r/error, /r/login, /r/import, /r/link, /r/invoice, /r/receipt, /r/plans/*, /r/connect/*`, `Allow: /`, `Sitemap: https://moo.bot/sitemap.xml`. `/r/commands` is allowed; `/a/` is not mentioned.
- `https://moo.bot/r/terms` (last modified 09.06.2023), license restrictions: "you may not: modify or copy the materials; attempt to decompile or reverse engineer any software contained on the Service; attempt to use any data mining, robots or similar data gathering or extraction methods; remove any copyright or other proprietary notations ...". This is the clearest automated-access prohibition of the four providers; it is aimed at the Service's own materials, and a user-initiated lookup of a public list is arguably not "data mining", but the risk should be recorded.

#### Channels probed

| Login | Step 1 | Step 2 `_total` | Fixture prefix |
|-------|--------|-----------------|----------------|
| pokimane | 200, userid 44445592 | 1 | `pokimane.*` |
| ninja | 200, userid 19571641 | 0 | `_negative-ninja.*` |
| northernlion | 200, userid 14371185 | 0 | `_negative-northernlion.*` |
| esl_csgo | 200, userid 936264266 | 0 | `_negative-esl_csgo.*` |
| sodapoppin | 200, no `channel` key | not called | `_negative-sodapoppin.channel` |

Only pokimane (1 command) returned a command, so "three channels with commands" was NOT reached; the request budget (20) ran out after five probes.

#### Negative case

A login Moobot does not know (`zz7tvcmdnosuchuser`, and sodapoppin): HTTP 200 and body `{"version":476,"assistant":"1.1.14"}` (36 bytes) with no `channel` key; the page then prints "<name> was not found." There is no 404. A known channel without commands returns `{"list":[],"_total":0}` (22 bytes). Fixture `_negative-nosuchuser.channel.json`.

#### Request count

20 requests to Moobot domains: 4 for discovery and docs (WebFetch of two docs pages, `robots.txt`, `sitemap.xml`), 2 Playwright visits (`/r/commands`, `/r/commands#pokimane`), 3 fetches reading the page HTML and `commands.js` (HTML once, JS twice), 9 probe/list calls, 1 unknown-login meta, 1 ToS. Total 4 + 2 + 3 + 9 + 1 + 1 = 20.

#### Open questions

- Which channels actually publish many commands? Discovery by guessing logins is wasteful; no directory of Moobot channels was found.
- Is `_limit` clamped (maximum page size)?
- Do built-in commands appear (`type` other than "custom")?
- Is the ToS clause on "robots or similar data gathering" a blocker for an extension?
- API version `1` and `version:476` are page-build specific; unknown how often `/a/1/` changes.

## Found but not supported

- botrix: registered with enabled:false (status unsupported, zero requests): no populated response observed in 14 channels, API path under robots.txt Disallow, no CORS header.
- wizebot, streamlabs (Cloudbot), phantombot: no public per-channel command endpoint found (a negative result, see their sections below); not registered.
- botisimo: network capture only (docs/providers/botisimo.network.json), see the discovery notes below.

The research docs follow.

### Botrix (botrix.live)

Status: endpoint verified keyless, but NO channel with a non-empty command list was found in 14 tries, so the
populated response shape is NOT observed (field names below come from the site's own JS bundle, marked "bundle").

Captured 2026-10-21. Capture file: docs/providers/botrix.network.json (2 visits). Fixtures: test/fixtures/botrix/.

#### Public URL pattern
- Twitch: `https://botrix.live/p/<login>/commands` (Angular route `p/:id/commands`, bundle). The component sets
  platform "twitch" by default and "kick" when the path starts with `/k/`; Kick page is `/k/<id>/commands`,
  YouTube `/y/<id>/commands`. `/commands/:id` redirects to `/`. A `t/:id` route also exists (purpose not checked).
- Observed page: `https://botrix.live/p/auronplay/commands`, title "auronplay Commands | BotRix ...",
  text "Auronplay hasn't added any custom commands yet."

#### Endpoint chain (observed in the Playwright capture)
1. `GET https://botrix.live//api/public/commands?user=<login>&platform=twitch`
   - The page itself calls it with a DOUBLE slash after the host; the single-slash form also works (direct fetches below).
   - Request headers the page sent: accept, referer, `x-csrf-token` (a per-session value, value redacted in the capture),
     stock Chromium user-agent. No authorization header. No cookie needed: direct node fetches with only
     `User-Agent: 7tv-cmd-research/0.1` returned the same bodies (all 14 requests, HTTP 200).
   - Response headers: `content-type: application/json`, `cache-control: max-age=150`, `server: cloudflare`,
     `vary: accept-encoding`. NO `access-control-allow-origin` header, NO ratelimit headers.
   - CORS consequence: a content script on twitch.tv cannot read this cross-origin; the extension's background
     script/service worker needs host permission `https://botrix.live/*` and fetches there (design choice for the build, not tested here).

#### Login -> provider id
None. The Twitch login (lowercase) is sent as `user`. The `platform` parameter is required in practice (page always sends it).

#### Response shape
- Unknown user: HTTP 200, body `{"error":true}` (14 bytes). The page then does `location.assign("/")`.
- Known user with no commands: HTTP 200, body `[]`.
- Populated list (bundle only, NOT observed): array of objects; the page code reads `cmd` (command name), `msg`
  (response text) and `allowed_roles` (array containing "all" or role names), sorts by `cmd`.
  Client-side only: drops commands whose cmd/msg contain bad words, strips `<hideText>...</hideText>`, resolves
  `<ifPLATFORM>...</ifPLATFORM>` blocks by platform. Aliases, cooldown and enabled flag: no field seen in the code path; unknown.
- Disabled/hidden commands: unknown (no populated sample). Pagination: none in the API; the page paginates client-side (PrimeNG paginator).

#### Channels tried (14 API requests)
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

#### Cache / rate limit
`cache-control: max-age=150` on every API response. No ratelimit headers on 14 requests in a few seconds. Behind Cloudflare.

#### robots and terms
- `https://botrix.live/robots.txt`: `User-Agent: *`, `Allow: /`, then `Disallow: /api`, `/sync`, `/alertas*`, `/widgets*`, `/alerts*`.
  The commands endpoint lives under the disallowed `/api` prefix. robots.txt governs crawlers, not a user-initiated
  browser action, but treat it as a risk to raise with the owner before shipping.
- Terms: linked from the site as `https://botrix.live/docs/#/?id=_6-terms-and-conditions` (docsify page). The capture only kept the
  first 6000 characters of rendered text, which ended before section 6, so the terms text was NOT read: unverified.

#### Request count used: 20 of 20 (homepage 1, robots 1, main.js 1, docs/README.md 404 1, API 14, page visits 2)

#### Open questions
- Find one channel with real commands and record the populated shape (cooldown, aliases, enabled).
- Does the API require the `x-csrf-token` when called at volume, or from a browser Origin (`Origin: moz-extension://...`)?
- Read the terms section 6 fully.

### WizeBot (wizebot.tv)

Status: NO public per-channel commands page or endpoint found. Result is negative-but-incomplete, no fixtures.
Captured 2026-10-21. Capture file: docs/providers/wizebot.network.json (3 visits: /en/streamings, viewer.wizebot.tv, support docs).

#### What was observed
- Public site `https://wizebot.tv/` redirects to `/en/index`. `https://wizebot.tv/sitemaps/en.xml` lists only 4 pages:
  `/index`, `/services`, `/streamings`, `/about`. No per-channel page is in the sitemap.
- Directory of live channels: `https://wizebot.tv/en/streamings` calls
  `GET https://wizebot.tv/api/streamings_list.php?_=<ms>` (no auth, no special headers, `application/json`, 1.8 MB, 4934 entries
  at capture time). Shape: `{"data":[{"channel_name","display_name","id","game_name","followers","viewers","country","img_cover","premium","partner_twitch","partner", ...}]}`;
  `channel_name` is the lowercase Twitch login. Only channels live now are listed. Useful to know WHICH channels use WizeBot;
  it carries no commands.
- Public docs page `https://support.wizebot.tv/docs/commands` (Playwright; plain fetch tools got HTTP 403) lists built-in commands and says:
  "!commands - Displaying the link on this page (Including the link of custom commands)." So the bot answers with a link that includes
  custom commands, but the page never prints that link's URL pattern.
- Viewer panel: `https://viewer.wizebot.tv/` redirects to `https://login.wizebot.tv/auth/tool/viewer` ("Viewer Panel - Authentication is required", Login via Twitch). Login-gated.
- Direct fetches of guessed public URLs for a listed channel (`chowh1`): `/chowh1/commands`, `/commands/chowh1`, `/en/commands`, `/chowh1`,
  `/en/commands/chowh1` all returned HTTP 200 with the generic home page (final URL `https://wizebot.tv/en/index`, 33,607 bytes): the site
  redirects any unknown path to home, so a miss and a login-gate look the same.

#### Endpoint chain
None established. Commands of a channel were not observed on any public URL.

#### Login -> id
`streamings_list.php` gives `id` (Twitch user id as a string, e.g. "1051294" for chowh1) next to `channel_name`, but no commands endpoint consumes it that we saw.

#### robots and terms
- `https://wizebot.tv/robots.txt`: `User-Agent: *` / `Allow: /` / `Sitemap: https://wizebot.tv/sitemap.xml`. Nothing about automated reads.
- Terms: `https://support.wizebot.tv/support/terms` is linked from the docs footer but was NOT fetched (budget): unverified.

#### Channels and negative case
No channel returned commands. Channels known to run WizeBot (from the live directory): chowh1, olofmeister, Lewislefou, Kuhrinho, riberaribell (no commands fetched).
Negative case: not applicable (no endpoint).

#### Request count used: 14 of 20
homepage 1, robots 1, sitemap index 1, sitemaps/en.xml 1, streamings visit 1, streamings_list 1, viewer visit 1, 5 URL guesses, docs visit 1, WebFetch of the docs page (403) 1. Visits: 3 of 3.

#### Open questions
- Where does the `!commands` link point? Cheapest answer: read one `!commands` reply from a live WizeBot channel's chat (not done here: no chat access) or the WizeBot panel (login-gated).
- Whether a public custom-commands page exists at all, or the link requires the viewer login.

### Streamlabs Cloudbot (streamlabs.com)

Status: NO public per-channel commands page found. Observed for ONE channel (coconutb), so this is a negative result, not a proof.
Captured 2026-10-21. Capture file: docs/providers/streamlabs.network.json (1 visit, 31 requests kept). No fixtures.

#### What was observed
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

#### Endpoint chain
None established for commands. Bot command data lives behind the authenticated Cloudbot dashboard (not observable without login).

#### robots and terms
- `https://streamlabs.com/robots.txt`: `User-agent: *`, `Allow: /`, `Disallow: /api/*` (also `/widgets/*`, `/alert-box/*`, `/logout*`, ...). The API prefix is disallowed for crawlers.
- Terms: `https://streamlabs.com/terms` fetched; the static HTML carries only ~3.7 KB of text (the terms render client-side), so nothing about automated reads could be checked: unverified.

#### Channels and negative case
coconutb only (no commands shown). No other channels tried, no negative fixture (no endpoint).

#### Request count used: 6 of 20 (robots 1, 3 URL probes, 1 Playwright visit, terms 1). Visits: 1 of 3.

#### Open questions
- Does a channel with an enabled Cloudbot public-commands option exist (Cloudbot dashboard has none that we could see without login)? A second channel was not tried.
- Body of `/api/v6/user/<login>` and `cloudbot/status` (not saved).

### PhantomBot (self-hosted)

Status: no central public page. PhantomBot is a self-hosted Java bot run by each streamer; there is no shared host to read
commands from, so no network capture and no fixtures.
Checked 2026-10-21.

#### What was observed
- `https://phantombot.dev/` (HTTP 200, title "PhantomBot | Multipurpose Twitch Chat Bot") is the project site. Per a WebFetch summary of it, it links
  "PhantomBot Control Panel" (launch the panel), "Guides" and "JavaDoc" (core classes). It does not mention a public commands list page or a public API for a
  channel's commands.
- A web search for a public commands page/playbook returned only release notes, setup guides and GitHub mirrors; no per-channel command URL.

#### Per-user page shape
Not found. Any commands view would be on the streamer's own host and port (the bot's built-in web server and panel); no example URL was observed, so none is recorded here
(a port number remembered from memory is deliberately not stated).

#### robots / ToS
Nothing relevant found at https://phantombot.dev/ (home page only; no robots.txt or terms page fetched, there is no shared service to read from).

#### Request count used: 2 (home page probe, WebFetch of the home page). Visits: 0.

#### Open questions
- If the owner wants PhantomBot support, it needs a per-user URL entered by the user, which conflicts with "no user setup": likely out of scope.

### Discovery notes (docs/providers/_discovery.md)

#### Discovery (group B), 2026-10-21

WebSearch used: 10 of 12 (the search engine returned mostly SEO pages; direct probes with node fetch and Playwright did the real work).
Each line: candidate, public per-channel commands URL?, evidence.

- Botisimo: NO (dead). `https://botisimo.com/coconutb/commands` -> 200 but the page is a parked domain ("This domain may be for sale", links only to terms.html and privacy.html). Evidence: docs/providers/botisimo.network.json.
- CoeBot: inconclusive. `https://coebot.tv/c/coconutb` -> `https://www.coebot.tv/c/coconutb` 404 "CoeBot - Error". The `/c/<channel>` pattern was a guess from memory and the channel may simply not exist there; nothing confirms a public commands page.
- Moobot: inconclusive here. `https://moo.bot/` 200 ("Moobot, your Twitch Chat Bot for 2026"); a docs page on built-in commands appeared in search (https://moo.bot/docs/built-in-twitch-bot-chat-commands) but no per-channel URL was seen. docs/providers/moobot.network.json exists from another group.
- DeepBot: no evidence. `https://deep.bot/` -> 200, 114 bytes, empty title (no usable content).
- Tangia: no evidence. `https://www.tangia.co/` 200 (interactive-overlay product); no commands URL found.
- Firebot: NO. Local desktop app (`https://firebot.app/` 200, "Firebot - All-in-one Twitch bot"); nothing hosted per channel was found.
- Streamer.bot: NO. Local desktop app (`https://streamer.bot/` 200); nothing hosted per channel was found.
- Mix It Up: NO per-channel page. `https://mixitup.bot/` (from `https://mixitupapp.com/`) links `/docs/commands` and `/community/commands` (a shared community command library, not a channel's list).
- Sery_Bot: inconclusive. `https://sery.bot/` -> `https://docs.sery.bot/` 200, docs only.
- Streamlabs Chatbot (desktop): not probed; desktop app, no hosted page expected.
- Nightdev (Nightbot): not probed here (Nightbot is another group's provider).
- Kick-only bots: excluded as instructed.
- WizeBot, Streamlabs Cloudbot, PhantomBot: see their own files; no public per-channel commands page found for any of the three.
- Botrix: YES, keyless JSON API (`https://botrix.live/p/<login>/commands` page, `GET https://botrix.live/api/public/commands?user=<login>&platform=twitch`), see botrix.md.

Net: discovery found no new site with a confirmed public per-channel commands page beyond the ones named by the owner; Botrix is the only one in group B with a working endpoint.
