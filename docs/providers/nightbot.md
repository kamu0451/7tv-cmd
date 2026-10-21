# Nightbot public commands

Observed 2026-10-21. Evidence: `docs/providers/nightbot.network.json` (Playwright capture of `https://nightbot.tv/t/coconutb/commands`), fixtures in `test/fixtures/nightbot/`.

## Public URL pattern

`https://nightbot.tv/t/<login>/commands`, `<login>` = lowercase Twitch login. A client-rendered app (page title "CoconutB's Commands", columns Command / Message / User-Level).

## Endpoint chain (captured from the page, reproduced with node fetch)

| # | Method | URL template | Required headers | CORS seen |
|---|--------|--------------|------------------|-----------|
| 1 | GET | `https://api.nightbot.tv/1/channels/twitch/<login>` | none (page sent `Accept: */*`, `Origin`, `Referer`) | `Access-Control-Allow-Origin` reflects the request Origin |
| 2 | GET | `https://api.nightbot.tv/1/commands` | `Nightbot-Channel: <id>` | same |

Note the exact path: the page calls `/1/channels/twitch/<login>` (the provider segment is `twitch`, not `t`). No Authorization header, no cookie.

`Nightbot-Channel` IS required: the same GET without it returned 400 `{"message":"invalid channel","status":400}` (fixture `_negative-noheader.commands.json`).

CORS detail: no `Access-Control-Allow-Origin` is sent when the request has no `Origin` (`Vary: Origin`). With `Origin: https://nightbot.tv` (the page) the value is that origin. With `Origin: https://www.twitch.tv`: the preflight `OPTIONS /1/commands` (request headers `nightbot-channel`) returned 204 with `Access-Control-Allow-Origin: https://www.twitch.tv`, `Access-Control-Allow-Headers: Authorization, Nightbot-Channel, Pragma, Cache-Control, Content-Type`, `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`, `Access-Control-Max-Age: 86400`; the real GET with that Origin returned 200 and the same ACAO. So a twitch.tv content script can read it; a background fetch works too. (Only the origin `https://www.twitch.tv` was tested.)

## Login to provider id

Step 1 body: `{"channel":{"_id":"56c7e73d70447e267df1f19d","createdAt":"...","updatedAt":"...","name":"coconutb","displayName":"CoconutB","avatar":"...","provider":"twitch","providerId":"56395702","admin":false},"status":200}`. `<id>` = `$.channel._id` (24 hex chars, Nightbot's own id, sent back as the `Nightbot-Channel` header). `$.channel.providerId` is the Twitch numeric user id.

## Response shape

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

## Cache and rate limit

- No `Cache-Control` on any response; `cf-cache-status: DYNAMIC`; `Vary: Origin`.
- No rate-limit header on any response. The only limit stated in `https://api-docs.nightbot.tv/` (via WebFetch) is for sending channel messages ("1 request per 5 seconds"); nothing for `GET /commands`.
- Sizes: 22 KB for 75 commands, 30 KB for 102.

## robots.txt and ToS

- `https://nightbot.tv/robots.txt` returns HTTP 200 with the HTML app shell (`text/html`, 1403 bytes), so there is effectively no robots.txt.
- Terms of Service `https://nightbot.tv/terms` (last updated February 12, 2024; rendered with Playwright, 15598 chars). A keyword scan found 6 sentences, none about automated reads or scraping (they are about auto-renewing subscriptions, YouTube API Services, and a footer reading "Terms of Service - Privacy Policy - API Documentation" linking to https://api-docs.nightbot.tv/). Nothing relevant found at https://nightbot.tv/terms.
- `https://api-docs.nightbot.tv/` documents `GET https://api.nightbot.tv/1/commands` (scope `commands`) as the current API user's list with an `Authorization: Bearer` token and does not mention the `Nightbot-Channel` header, so the unauthenticated, header-based call the public page makes is undocumented.

## Channels

| Login | `$.channel._id` | `$.commands` length |
|-------|-----------------|---------------------|
| coconutb | 56c7e73d70447e267df1f19d | 75 |
| nickmercs | 56c7f20970447e267df5b5e8 | 102 |
| lirik | 5a8afd44280d2872dd8f3b7f | 1 |
| twitch (extra, positive) | 681b9ae30106b63fb2471648 | 4 |

## Negative cases

- Login unknown to Nightbot (dansgaming, summit1g, timthetatman, all real Twitch accounts): step 1 -> 404 `{"message":"user not found","status":404}` (41 bytes). Fixtures `_negative-dansgaming.channel.json`, `_negative-summit1g.channel.json`, `_negative-timthetatman.channel.json`.
- Missing `Nightbot-Channel`: 400 `{"message":"invalid channel","status":400}`.
- The suggested negative "twitch" is NOT negative here: it exists on Nightbot with 4 commands (kept as the positive fixture `twitch.*`).

## Request count

20 requests to Nightbot domains: 2 Playwright visits (`/t/coconutb/commands`, `/terms`), 14 in the chain script (coconutb, lirik, nickmercs = 6 for chains, 3 x 404 candidates, `twitch` 2, robots 1, two ToS guesses 2), 2 CORS probes (OPTIONS + GET), 1 no-header call, 1 WebFetch of `api-docs.nightbot.tv`. Total 2 + 14 + 2 + 1 + 1 = 20.

## Open questions

- Does `channels/twitch/<login>` also accept a Twitch numeric id (would remove the dependence on the login)?
- Rate limits for the public read are unknown (no headers).
- Is the unauthenticated `Nightbot-Channel` call a supported public interface? The documented API requires OAuth, so it could change without notice.
- Do default commands ever appear in `/1/commands`?
- Can `alias` ever be non-empty, and what separator does it use?
