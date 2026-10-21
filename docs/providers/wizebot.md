# WizeBot (wizebot.tv)

Status: NO public per-channel commands page or endpoint found. Result is negative-but-incomplete, no fixtures.
Captured 2026-10-21. Capture file: docs/providers/wizebot.network.json (3 visits: /en/streamings, viewer.wizebot.tv, support docs).

## What was observed
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

## Endpoint chain
None established. Commands of a channel were not observed on any public URL.

## Login -> id
`streamings_list.php` gives `id` (Twitch user id as a string, e.g. "1051294" for chowh1) next to `channel_name`, but no commands endpoint consumes it that we saw.

## robots and terms
- `https://wizebot.tv/robots.txt`: `User-Agent: *` / `Allow: /` / `Sitemap: https://wizebot.tv/sitemap.xml`. Nothing about automated reads.
- Terms: `https://support.wizebot.tv/support/terms` is linked from the docs footer but was NOT fetched (budget): unverified.

## Channels and negative case
No channel returned commands. Channels known to run WizeBot (from the live directory): chowh1, olofmeister, Lewislefou, Kuhrinho, riberaribell (no commands fetched).
Negative case: not applicable (no endpoint).

## Request count used: 14 of 20
homepage 1, robots 1, sitemap index 1, sitemaps/en.xml 1, streamings visit 1, streamings_list 1, viewer visit 1, 5 URL guesses, docs visit 1, WebFetch of the docs page (403) 1. Visits: 3 of 3.

## Open questions
- Where does the `!commands` link point? Cheapest answer: read one `!commands` reply from a live WizeBot channel's chat (not done here: no chat access) or the WizeBot panel (login-gated).
- Whether a public custom-commands page exists at all, or the link requires the viewer login.
