// Part 4 matcher check (docs/SPEC.md section 8). Bundles src/match/match.ts in memory with esbuild,
// prints filterCommands results for 10 queries over a fixed list, and asserts the ranking rules:
// exact first, prefix before substring, name before alias, shorter first, code-unit order, ranges.
// Usage: node tools/dev/match-check.mjs   (exit 1 on a failed assertion)

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = await build({
  entryPoints: [join(root, 'src', 'match', 'match.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const { filterCommands } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const c = (name, aliases = []) => ({ name, aliases, response: '', provider: 'nightbot', alsoOn: [] });
const LIST = [
  c('discord', ['dc']),
  c('dc'),                       // exact name "dc" must beat discord's exact alias "dc"
  c('socials', ['links', 'discordlink']),
  c('backseat'),
  c('ban'),
  c('banana'),
  c('kebab'),
  c('cabal'),
  c('bot', ['b']),
  c('abba'),
  c('uptime', ['up', 'live']),
  c('hug', ['hugs', 'hugs']),    // duplicate alias compared once
  c('clip', ['clips']),
  c('Zed'),                      // code-unit order: uppercase sorts before lowercase (not localeCompare)
];

const show = (s) => s.kind[0].toUpperCase() + ':' + (s.viaAlias ? s.matched + '->' + s.command.name : s.command.name) +
  '[' + s.range[0] + ',' + s.range[1] + ']';

const QUERIES = ['', 'b', 'ba', 'dc', 'disc', 'up', 'link', 'hug', 'AB', 'zzz'];
for (const q of QUERIES) {
  console.log(JSON.stringify(q).padEnd(8) + filterCommands(LIST, q).map(show).join('  '));
}

const fails = [];
const names = (q, limit) => filterCommands(LIST, q, limit).map((s) => s.command.name);
const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(label + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };

// Empty query: every command, name order (code units), kind prefix, range [0,0].
const empty = filterCommands(LIST, '');
eq('empty count', empty.length, LIST.length);
eq('empty order', empty.map((s) => s.command.name), LIST.map((x) => x.name).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
eq('empty kind/range', [...new Set(empty.map((s) => s.kind + s.range.join(',')))], ['prefix0,0']);
// "b": exact alias b->bot first; then prefix names shortest first; substring after every prefix.
const b = filterCommands(LIST, 'b');
eq('b first is exact', [b[0].kind, b[0].command.name, b[0].viaAlias], ['exact', 'bot', true]);
const firstSub = b.findIndex((s) => s.kind === 'substring');
eq('b prefix before substring', b.slice(firstSub).every((s) => s.kind === 'substring'), true);
eq('b prefix names', names('b').slice(1, firstSub), ['ban', 'banana', 'backseat']);
// "dc": exact name beats exact alias.
eq('dc order', filterCommands(LIST, 'dc').map((s) => [s.command.name, s.viaAlias]), [['dc', false], ['discord', true]]);
// "disc": prefix name discord before prefix alias discordlink (socials).
eq('disc order', filterCommands(LIST, 'disc').map((s) => s.matched), ['discord', 'discordlink']);
// Substring range points at the match inside `matched`.
eq('kebab range', filterCommands(LIST, 'ba').find((s) => s.command.name === 'kebab').range, [2, 4]);
// Query is trimmed and lowercased.
eq('trim/lower', names('  BA '), names('ba'));
eq('limit', names('', 3).length, 3);
eq('no match', names('zzz'), []);
eq('deterministic', JSON.stringify(filterCommands(LIST, 'b')), JSON.stringify(filterCommands([...LIST].reverse(), 'b')));

console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'PASS: 11 ranking assertions');
if (fails.length) process.exit(1);
