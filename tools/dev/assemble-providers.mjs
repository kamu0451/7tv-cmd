// Assembles PROVIDERS.md at the repo root from docs/gate-7tv.md (summarised below) and
// docs/providers/*.md (copied, headings shifted down). Re-run after a provider doc changes:
//   node tools/dev/assemble-providers.mjs
// Fails (exit 1) when any source line is not ASCII, so a non-ASCII char never reaches the root doc.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SUPPORTED = ['nightbot', 'streamelements', 'fossabot', 'moobot'];
const UNSUPPORTED = ['botrix', 'wizebot', 'streamlabs', 'phantombot'];
const shift = (md, by) => md.replace(/^(#+) /gm, (m, h) => '#'.repeat(Math.min(6, h.length + by)) + ' ');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trim();

const header = `# Providers

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
`;

const parts = [header];
let bad = 0;
const add = (file, by) => {
  const txt = read(file);
  txt.split('\n').forEach((l, i) => { if (/[^\x00-\x7F]/.test(l)) { bad++; console.error('non-ASCII ' + file + ':' + (i + 1)); } });
  parts.push(shift(txt, by));
};
parts.push('## Supported providers (v1)\n\nPriority order of the registry (src/providers/index.ts): nightbot (badge NB), streamelements (SE), fossabot (FB), moobot (MB). Only moobot needs a host permission (https://moo.bot/*).');
for (const id of SUPPORTED) add('docs/providers/' + id + '.md', 2);
parts.push('## Found but not supported\n\n- botrix: registered with enabled:false (status unsupported, zero requests): no populated response observed in 14 channels, API path under robots.txt Disallow, no CORS header.\n- wizebot, streamlabs (Cloudbot), phantombot: no public per-channel command endpoint found (a negative result, see their sections below); not registered.\n- botisimo: network capture only (docs/providers/botisimo.network.json), see the discovery notes below.\n\nThe research docs follow.');
for (const id of UNSUPPORTED) if (existsSync('docs/providers/' + id + '.md')) add('docs/providers/' + id + '.md', 2);
parts.push('### Discovery notes (docs/providers/_discovery.md)');
add('docs/providers/_discovery.md', 3);
if (bad) { console.error(bad + ' non-ASCII line(s); PROVIDERS.md not written'); process.exit(1); }
writeFileSync('PROVIDERS.md', parts.join('\n\n') + '\n');
console.log('PROVIDERS.md written, ' + parts.join('\n\n').split('\n').length + ' lines');
