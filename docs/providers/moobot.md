# Moobot public commands

Observed 2026-10-21. Evidence: `docs/providers/moobot.network.json` (Playwright capture of `https://moo.bot/r/commands#pokimane`), fixtures in `test/fixtures/moobot/`. Moobot is the weakest provider of this group: the public list works, but only one of the five popular channels probed had any public command.

## Public URL pattern

`https://moo.bot/r/commands#<login>` (listed in `https://moo.bot/sitemap.xml` as `https://moo.bot/r/commands`). The login is in the URL FRAGMENT, read by the page script (`location.hash`), so the server never sees it; with no fragment the page shows a login box and a "Show command list" button that sets the fragment. The docs page for `!Commands` says it "provides a link to a public list of all your active chat commands" and that "Moobot automatically hides disabled or restricted commands from the list" (moo.bot/docs/built-in-twitch-bot-chat-commands, quoted as returned by WebFetch).

## Endpoint chain (captured from the page for pokimane)

Both calls are POST with a form body, not GET (the page's request helper defaults to `method:"POST"`, params as `application/x-www-form-urlencoded`).

| # | Method | URL | Headers | Body (observed) | CORS seen |
|---|--------|-----|---------|-----------------|-----------|
| 1 | POST | `https://moo.bot/a/1/channel/meta` | `Accept: application/json`, `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `Origin`, `Referer` | `name=<login>` | `Access-Control-Allow-Origin: https://moo.bot` |
| 2 | POST | `https://moo.bot/a/1/channel/public/commands/list` | same | `_limit=15&_offset=0&_order=identifier&channel=<userid>` | `https://moo.bot` |

No authorization header on the logged-out page (the helper only adds `Authorization: Token ...` for a logged-in user). Direct node fetches used only `User-Agent: 7tv-cmd-research/0.1`, `Accept`, `Content-Type` and got 200. The fixtures were fetched with `_limit=100` instead of the page's 15; the server accepted it, but every list was tiny (0 or 1 element), so whether 100 is clamped is unknown.

CORS: `Access-Control-Allow-Origin` was `https://moo.bot` on every response, including requests that sent no Origin, so it is a fixed value and not reflected. A content script on twitch.tv cannot read these responses; the extension must fetch from its background context with a `https://moo.bot/*` host permission.

## Login to provider id

Step 1 body: `{"status":{"autojoin":false,"joined":true,"moderated":false},"channel":{"trial":true,"points":15,"userid":"44445592","username":"pokimane"},"version":476,"assistant":"1.1.14"}`. `$.channel.userid` is the Twitch numeric user id (so step 2 could be called with a Twitch id directly if the extension knew it, which it does not). Moobot returns a `channel` object for many Twitch users that merely have a (trial) Moobot record, whether or not they publish commands.

## Response shape

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

## Cache and rate limit

`Cache-Control: no-cache, no-store, must-revalidate, private, no-cache, must-revalidate, max-age=60` (contradictory, effectively no caching), `Expires: 0`, `cf-cache-status: DYNAMIC`. No rate-limit headers. The page script knows a `RATE_LIMITED` error ("too many attempts in too short a period of time") but no limit value was observed.

## robots.txt and ToS

- `https://moo.bot/robots.txt`: `User-Agent: *`, `Disallow: /r/error, /r/login, /r/import, /r/link, /r/invoice, /r/receipt, /r/plans/*, /r/connect/*`, `Allow: /`, `Sitemap: https://moo.bot/sitemap.xml`. `/r/commands` is allowed; `/a/` is not mentioned.
- `https://moo.bot/r/terms` (last modified 09.06.2023), license restrictions: "you may not: modify or copy the materials; attempt to decompile or reverse engineer any software contained on the Service; attempt to use any data mining, robots or similar data gathering or extraction methods; remove any copyright or other proprietary notations ...". This is the clearest automated-access prohibition of the four providers; it is aimed at the Service's own materials, and a user-initiated lookup of a public list is arguably not "data mining", but the risk should be recorded.

## Channels probed

| Login | Step 1 | Step 2 `_total` | Fixture prefix |
|-------|--------|-----------------|----------------|
| pokimane | 200, userid 44445592 | 1 | `pokimane.*` |
| ninja | 200, userid 19571641 | 0 | `_negative-ninja.*` |
| northernlion | 200, userid 14371185 | 0 | `_negative-northernlion.*` |
| esl_csgo | 200, userid 936264266 | 0 | `_negative-esl_csgo.*` |
| sodapoppin | 200, no `channel` key | not called | `_negative-sodapoppin.channel` |

Only pokimane (1 command) returned a command, so "three channels with commands" was NOT reached; the request budget (20) ran out after five probes.

## Negative case

A login Moobot does not know (`zz7tvcmdnosuchuser`, and sodapoppin): HTTP 200 and body `{"version":476,"assistant":"1.1.14"}` (36 bytes) with no `channel` key; the page then prints "<name> was not found." There is no 404. A known channel without commands returns `{"list":[],"_total":0}` (22 bytes). Fixture `_negative-nosuchuser.channel.json`.

## Request count

20 requests to Moobot domains: 4 for discovery and docs (WebFetch of two docs pages, `robots.txt`, `sitemap.xml`), 2 Playwright visits (`/r/commands`, `/r/commands#pokimane`), 3 fetches reading the page HTML and `commands.js` (HTML once, JS twice), 9 probe/list calls, 1 unknown-login meta, 1 ToS. Total 4 + 2 + 3 + 9 + 1 + 1 = 20.

## Open questions

- Which channels actually publish many commands? Discovery by guessing logins is wasteful; no directory of Moobot channels was found.
- Is `_limit` clamped (maximum page size)?
- Do built-in commands appear (`type` other than "custom")?
- Is the ToS clause on "robots or similar data gathering" a blocker for an extension?
- API version `1` and `version:476` are page-build specific; unknown how often `/a/1/` changes.
