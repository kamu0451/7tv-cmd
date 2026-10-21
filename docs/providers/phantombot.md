# PhantomBot (self-hosted)

Status: no central public page. PhantomBot is a self-hosted Java bot run by each streamer; there is no shared host to read
commands from, so no network capture and no fixtures.
Checked 2026-10-21.

## What was observed
- `https://phantombot.dev/` (HTTP 200, title "PhantomBot | Multipurpose Twitch Chat Bot") is the project site. Per a WebFetch summary of it, it links
  "PhantomBot Control Panel" (launch the panel), "Guides" and "JavaDoc" (core classes). It does not mention a public commands list page or a public API for a
  channel's commands.
- A web search for a public commands page/playbook returned only release notes, setup guides and GitHub mirrors; no per-channel command URL.

## Per-user page shape
Not found. Any commands view would be on the streamer's own host and port (the bot's built-in web server and panel); no example URL was observed, so none is recorded here
(a port number remembered from memory is deliberately not stated).

## robots / ToS
Nothing relevant found at https://phantombot.dev/ (home page only; no robots.txt or terms page fetched, there is no shared service to read from).

## Request count used: 2 (home page probe, WebFetch of the home page). Visits: 0.

## Open questions
- If the owner wants PhantomBot support, it needs a per-user URL entered by the user, which conflicts with "no user setup": likely out of scope.
