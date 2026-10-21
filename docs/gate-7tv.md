# Gate: does per-channel bot-command autocomplete already exist?

Date: 2026-10-21. Sources read: shallow clones in the session scratchpad (untrusted, read only, nothing run),
gh issue/PR/code search, WebSearch (6 calls), WebFetch.

Clones read:
- SevenTV/Extension @ 69eaa09a6bf556af58f95c349b4fc169299ef201 (2026-10-06), package.json version 3.1.26
- FrankerFaceZ/FrankerFaceZ @ fe229eadc0abdb35b03980bf2b3255adffdb5c87 (2026-10-20)
- night/betterttv @ 1a616214cfebbc9dd9dfaf3f3d205f91f99f2e2f (2026-10-15), package.json version 7.7.28 (latest release 7.7.28, 2026-10-06)

## 7TV (SevenTV/Extension) - PARTIAL

Verdict: completes emotes and chatter names, and adds 7TV's own "/" commands to Twitch's native slash list; nothing for "!" bot commands.

Evidence:
- `src/site/twitch.tv/modules/chat-input/ChatInputModule.vue:133-197` - every autocomplete setting is emote/chatter: `chat_input.autocomplete.colon` ("Enables a list of partially matching emotes"), `.colon.emoji`, `.colon.mode`, `.carousel` ("Tab-completion Carousel"), `.carousel.mode`, `.chatters` ("consider the usernames of active chatters when using tab-completion").
- `src/site/twitch.tv/modules/chat-input/ChatInput.vue:521-534` - colon completion only triggers on ":" (`if (... COLON && !str.startsWith(":")) return;`).
- `src/site/twitch.tv/modules/custom-commands/CommandModule.vue:34` - `const commands = [Dashboard, Song, Reresh, Nuke]`, injected through Twitch's own ChatCommand component (lines 20-53): 7TV's own slash commands.
- `CHANGELOG.md:157` - "Added custom commands /search, /add, /remove and /rename to manage 7TV emotes."
- Grep of `src` for nightbot|streamelements|fossabot|moobot|streamlabs: 0 hits.
- gh issue search ("command autocomplete", "streamelements", "bot commands"): 0 results; "nightbot": only #1180 and #249 (unrelated invisible-character bugs) https://github.com/SevenTV/Extension/issues/1180 https://github.com/SevenTV/Extension/issues/249
- gh PR search "command": #1041 "Feat/new custom commands" (merged) https://github.com/SevenTV/Extension/pull/1041 and #853 "Custom commands" (closed) https://github.com/SevenTV/Extension/pull/853 - both 7TV slash commands. "autocomplete": #89, #95, #268, #722, #793, #1079, #1262 - all emote/chatter completion.

Covers: ":" emote list, Tab emote/chatter carousel, 7TV "/" commands. Misses: any "!" bot command source.

## FrankerFaceZ - SHIPPED (via official add-on, not core)

Verdict: FFZ core has the hook ("!" is a registered command prefix and add-ons can inject commands); the official Add-Ons repo ships "Custom Commands Auto Completer" which fetches per-channel commands from StreamElements, Fossabot, Nightbot and Moobot.

Evidence:
- Core: `src/modules/chat/index.js:97` - `this.CommandPrefixes.set('ffz', ['/', '!']);`
- Core: `src/sites/twitch-twilight/modules/chat/input.jsx:835` - `t.emit('chat:get-tab-commands', event);` and `:845` filters by `cmd.prefix ?? '/'` - add-ons supply "!" commands into Twitch's suggestion tray.
- Core grep for nightbot|streamelements|fossabot: 0 hits.
- Add-on manifest https://github.com/FrankerFaceZ/Add-Ons/blob/master/src/custom-commands-auto-complete/manifest.json - `"enabled": true`, `"name": "Custom Commands Auto Completer"`, author iXyles, version 1.0.0, created/updated 2026-02-01; description: "Adds auto-completion support for custom bot commands. Dynamically fetches commands from popular bots like Fossabot, StreamElements, NightBot, MooBot or custom bots when they are active in the channel."
- `src/custom-commands-auto-complete/presets.js` (Add-Ons repo): StreamElements `https://api.streamelements.com/kappa/v2/bot/commands/{channelId}/default`, Fossabot `https://fossabot.com/api/v2/cached/channels/{channelId}/commands`, Nightbot `https://api.nightbot.tv/1/commands` with `Nightbot-Channel` header, Moobot preset; comment notes Streamlabs is excluded because of CORS from twitch.tv.
- `src/custom-commands-auto-complete/sources.js` - applies a source only when the bot user is detected in the channel (`detectBotInChannel`).
- Commit 7d28bfdd6e "CustomCmds: 1.0.0" 2026-02-03 https://github.com/FrankerFaceZ/Add-Ons/commits/master/src/custom-commands-auto-complete
- Related single-bot add-ons: Twir (`src/twir`, "Adds command suggestions and badges from Twir", 2024-05-16), TurtegBot (`src/turtegbot`, 2025-10-05).
- FFZ issue search "nightbot commands": 0; "command autocomplete": only #1625 "Filter Slash Commands" https://github.com/FrankerFaceZ/FrankerFaceZ/issues/1625

Covers: free, per-channel, multi-bot "!" completion in Twitch web chat. Misses / limits: requires the FFZ extension plus opting into the add-on; v1.0.0 with no update since 2026-02; bot presence detection relies on the bot being in FFZ's chatter list. Not verified live here.

## BetterTTV - SHIPPED (BTTV Pro, paid)

Verdict: "Command Autocomplete" for Nightbot, Fossabot, Moobot and StreamElements on "!" ships in current releases, but only for BTTV Pro subscribers.

Evidence:
- `src/modules/command_autocomplete/twitch/Autocomplete.jsx:41-46` - providers nightbot, fossabot, moobot, streamelements; `:26-38` Twitch GQL query for the channel's chatbots; `:286-296` fetches suggestions for the bots present; `:313-330` filters by user level; `:163-167` inserts `name + " "`.
- `src/actions/autocomplete.js:24` - `api.get(\`cached/users/${provider}/${providerId}/autocomplete\`, {searchParams})` - commands come from BTTV's own backend, not directly from the bots.
- `src/constants.js:448` - `export const COMMAND_PREFIX = '!';` ; `:64` setting id `chatbotCommandAutocomplete`.
- Pro gating: `Autocomplete.jsx:261,276,334` use `getProSettingValue(...)`; `src/utils/pro.js:5-17` returns the default (off) unless `currentUser.pro === true`; `src/modules/settings/settings/global/ChatBots.jsx:13-31` setting "Command Autocomplete" with `showProBadge`, "Enable command autocomplete for supported chatbot commands."
- Also on YouTube: `src/modules/command_autocomplete/youtube/Autocomplete.jsx`.
- Merged PRs (shipped work): #8039 https://github.com/night/betterttv/pull/8039 and #8040 https://github.com/night/betterttv/pull/8040 (2026-06), #8067, #8068, #8089 (2026-06-25), #8100, #8202 "add user level badges ... to command autocomplete" (2026-08-30) https://github.com/night/betterttv/pull/8202 ; #8160 "feat: add pro upgrade page" https://github.com/night/betterttv/pull/8160
- Releases: 7.7.24 (2026-07-15) through 7.7.28 (2026-10-06) https://github.com/night/betterttv/releases
- Origin PR not located (gh searches returned only follow-up fixes). betterttv.com/features rendered empty to WebFetch (client-side app); no public feature-list quote obtained.

Covers: polished "!" popup with arguments, user levels, provider logos, Tab/Enter. Misses: paywalled (Pro + BTTV login), depends on BTTV backend.

## Chatterino (desktop client, not a browser extension) - NONE

Verdict: desktop Qt client; command completion covers its own, custom and Twitch "/" commands only.

Evidence:
- `src/controllers/completion/sources/CommandSource.cpp:74-101` (master, via gh api) - items: Chatterino commands, "Custom Chatterino commands" (user-defined), plugin commands, `TWITCH_DEFAULT_COMMANDS`. No bot provider.
- Open PR #7289 "feat: add command completion popup" (2026-09-15) - popup for commands "prefixed with `/` or `.`" https://github.com/Chatterino/chatterino2/pull/7289 ; #7250 "allow command tab completion in replies" (merged) https://github.com/Chatterino/chatterino2/pull/7250
- Issue search "nightbot commands", "bot command autocomplete": 0 results.

Out of scope anyway: does not touch the Twitch web chat input.

## Existing standalone tools

- CommandMate (Firefox) https://addons.mozilla.org/en-US/firefox/addon/commandmate/ - "interactive menu of commands for each stream"; v1.2.0, updated 2025-08-08, 2 users; no mention of autocomplete, "!" typing, or bot providers; uses nugrunonly.com (source of commands not stated). A menu, not inline autocomplete.
- Small Twitch Commands (Chrome/Firefox) https://github.com/Mana24/Small-Twitch-Commands - shrinks "!command" messages in chat; no autocomplete.
- Greasy Fork "Library Twitch Command Buttons" https://greasyfork.org/scripts/547394 - helper library hooking the chat input; no "!" completion found.
- luckydye/ttv-chat https://github.com/luckydye/ttv-chat (`src/services/Nightbot.ts`) - separate chat client that reads Nightbot; not an extension for twitch.tv chat (not inspected further).
- Streamer.bot chat client (desktop) https://docs.streamer.bot/guide/extra-features/chat - search snippet says its autocomplete menus include "!" commands; desktop app, unverified scope.
- GitHub repo searches ("twitch nightbot autocomplete", "twitch bot commands autocomplete extension", "twitch command autocomplete userscript"): 0 results. No standalone Chrome Web Store / AMO extension found that fetches per-channel bot commands.

## Verdict

YES: per-channel bot-command autocomplete inside the Twitch web chat input already ships in BetterTTV (Pro-only, paid) and in FrankerFaceZ via the free official add-on "Custom Commands Auto Completer" (v1.0.0, 2026-02); 7TV, Chatterino and every standalone tool found do not have it.

## Deferred

- Live test of the FFZ add-on and BTTV Pro feature (another agent records the live test).
- BTTV origin PR and public Pro price page (betterttv.com is client-rendered).
- Chrome Web Store direct search (store redirects to a consent page for fetches).
