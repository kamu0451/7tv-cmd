# Discovery (group B), 2026-10-21

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
