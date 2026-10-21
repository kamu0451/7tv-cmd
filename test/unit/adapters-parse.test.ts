// parseChannel and parseCommands of every adapter, run against EVERY file in test/fixtures/<provider>/
// and against hand-built bodies for the normalisation rules (SPEC 3, 5.1).
//
// Expected counts and ids are the ones docs/providers/<provider>.md records in its "Channels" tables
// (Nightbot 75/102/1/4, StreamElements 176 elements of which 160/14/6 enabled, Fossabot 32/72/51/1,
// Moobot 1/0/0/0); they are written here by hand, not derived from the parsers.

import { describe, expect, it } from 'vitest';
import * as botrix from '../../src/providers/botrix';
import * as fossabot from '../../src/providers/fossabot';
import * as moobot from '../../src/providers/moobot';
import * as nightbot from '../../src/providers/nightbot';
import * as streamelements from '../../src/providers/streamelements';
import type { Command } from '../../src/shared/types';
import { fixtureFiles, loadFixture } from '../helpers/fixtures';

interface Parsers {
  parseChannel(raw: unknown): string | null;
  parseCommands(raw: unknown): Command[];
}
const PARSERS: Record<string, Parsers> = { nightbot, streamelements, fossabot, moobot, botrix };

type Expectation =
  | { channel: string | null }
  | { commands: number }
  | { rawLength: number }; // a file the extension never fetches (page-only call): only the shape invariants are checked

const EXPECTED: Record<string, Record<string, Expectation>> = {
  nightbot: {
    'coconutb.channel.json': { channel: '56c7e73d70447e267df1f19d' },
    'coconutb.commands.json': { commands: 75 },
    'nickmercs.channel.json': { channel: '56c7f20970447e267df5b5e8' },
    'nickmercs.commands.json': { commands: 102 },
    'lirik.channel.json': { channel: '5a8afd44280d2872dd8f3b7f' },
    'lirik.commands.json': { commands: 1 },
    'twitch.channel.json': { channel: '681b9ae30106b63fb2471648' },
    'twitch.commands.json': { commands: 4 },
    '_negative-dansgaming.channel.json': { channel: null },
    '_negative-summit1g.channel.json': { channel: null },
    '_negative-timthetatman.channel.json': { channel: null },
    '_negative-noheader.commands.json': { commands: 0 },
  },
  streamelements: {
    'coconutb.channel.json': { channel: '5a2483d1eae4510001c047e5' },
    'coconutb.commands.json': { commands: 160 },
    'kaicenat.channel.json': { channel: '607f0112ffa1497aa7c07208' },
    'kaicenat.commands.json': { commands: 14 },
    'ludwig.channel.json': { channel: '5bb4010a860cde54a36f2339' },
    'ludwig.commands.json': { commands: 6 },
    'coconutb.commands-default.json': { rawLength: 72 },
    '_negative-twitch.channel.json': { channel: '5acfe952e0d91f2b7a59bfe3' },
    '_negative-twitch.commands.json': { commands: 0 },
    '_negative-nosuchuser.channel.json': { channel: null },
  },
  fossabot: {
    'twitchdev.channel.json': { channel: '28372' },
    'twitchdev.commands.json': { commands: 32 },
    'kaajak1.channel.json': { channel: '738161041054085120' },
    'kaajak1.commands.json': { commands: 72 },
    'ipqow.channel.json': { channel: '751' },
    'ipqow.commands.json': { commands: 51 },
    'twitch.channel.json': { channel: '426448839558516736' },
    'twitch.commands.json': { commands: 1 },
    '_negative-coconutb.channel.json': { channel: null },
  },
  moobot: {
    'pokimane.channel.json': { channel: '44445592' },
    'pokimane.commands.json': { commands: 1 },
    '_negative-ninja.channel.json': { channel: '19571641' },
    '_negative-ninja.commands.json': { commands: 0 },
    '_negative-northernlion.channel.json': { channel: '14371185' },
    '_negative-northernlion.commands.json': { commands: 0 },
    '_negative-esl_csgo.channel.json': { channel: '936264266' },
    '_negative-esl_csgo.commands.json': { commands: 0 },
    '_negative-sodapoppin.channel.json': { channel: null },
    '_negative-nosuchuser.channel.json': { channel: null },
  },
  botrix: {
    // disabled adapter, no recorded populated shape: every body parses to no commands
    'auronplay.commands.json': { commands: 0 },
    'spursito.commands.json': { commands: 0 },
    'thegrefg.commands.json': { commands: 0 },
    '_negative-twitch.commands.json': { commands: 0 },
  },
};

const LEVELS = ['everyone', 'subscriber', 'regular', 'vip', 'moderator', 'owner', 'unknown'];

// Shape rules of SPEC 3 that hold for every parsed command of every provider.
function violations(cmds: Command[], provider: string): string[] {
  const bad: string[] = [];
  for (const c of cmds) {
    const tag = provider + ':' + c.name + ' ';
    if (c.name === '' || c.name !== c.name.toLowerCase() || /\s/.test(c.name) || c.name.startsWith('!')) bad.push(tag + 'name');
    if (c.provider !== provider) bad.push(tag + 'provider');
    if (c.alsoOn.length !== 0) bad.push(tag + 'alsoOn');
    if (c.aliases.includes(c.name)) bad.push(tag + 'alias equals name');
    if (new Set(c.aliases).size !== c.aliases.length) bad.push(tag + 'duplicate alias');
    for (const a of c.aliases) {
      if (a === '' || a !== a.toLowerCase() || /\s/.test(a) || a.startsWith('!')) bad.push(tag + 'alias ' + JSON.stringify(a));
    }
    if (c.response.length > 300) bad.push(tag + 'response over 300');
    if (/[\r\n\t]/.test(c.response) || c.response !== c.response.trim()) bad.push(tag + 'response not one trimmed line');
    if (c.userLevel !== undefined && !LEVELS.includes(c.userLevel)) bad.push(tag + 'userLevel');
    if (c.cooldownSec !== undefined && !(typeof c.cooldownSec === 'number' && c.cooldownSec >= 0)) bad.push(tag + 'cooldownSec');
  }
  return bad;
}

// An independent oracle for the name rule: trim, strip one "!", lowercase; null when empty or spaced.
function norm(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  let t = s.trim();
  if (t.startsWith('!')) t = t.slice(1);
  return t === '' || /\s/.test(t) ? null : t.toLowerCase();
}

function expectedAliases(raw: unknown, name: string): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const out: string[] = [];
  for (const a of list) {
    const n = norm(a);
    if (n !== null && n !== name && !out.includes(n)) out.push(n);
  }
  return out;
}

function expectedResponse(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

function checkResponse(parsed: string, rawText: unknown): void {
  const collapsed = expectedResponse(rawText);
  if (collapsed.length <= 300) expect(parsed).toBe(collapsed);
  else {
    expect(parsed.length).toBeLessThanOrEqual(300);
    expect(parsed.length).toBeGreaterThan(290);
    expect(collapsed.startsWith(parsed)).toBe(true);
  }
}

describe('fixture coverage', () => {
  it.each(Object.keys(PARSERS))('%s: every fixture file has a recorded expectation and vice versa', (provider) => {
    expect(fixtureFiles(provider)).toEqual(Object.keys(EXPECTED[provider]).sort());
  });
});

describe.each(Object.keys(PARSERS))('%s adapter against its fixtures', (provider) => {
  const parsers = PARSERS[provider];
  const entries = Object.entries(EXPECTED[provider]);

  it.each(entries)('%s', (file, expectation) => {
    const raw = loadFixture(provider, file);
    if ('channel' in expectation) {
      expect(parsers.parseChannel(raw)).toBe(expectation.channel);
      expect(parsers.parseCommands(raw)).toEqual([]); // a lookup body is never a command list
    } else if ('commands' in expectation) {
      const cmds = parsers.parseCommands(raw);
      expect(cmds).toHaveLength(expectation.commands);
      expect(violations(cmds, provider)).toEqual([]);
      expect(parsers.parseChannel(raw)).toBeNull(); // a command list is never a lookup body
    } else {
      expect(Array.isArray(raw) ? raw.length : -1).toBe(expectation.rawLength);
      expect(violations(parsers.parseCommands(raw), provider)).toEqual([]);
    }
  });
});

describe('fixture values: field mapping and normalisation', () => {
  it.each(['coconutb', 'nickmercs', 'lirik', 'twitch'])('nightbot %s: names, aliases, response, userLevel, cooldown', (login) => {
    const raw = loadFixture('nightbot', login + '.commands.json') as { commands: Array<Record<string, unknown>> };
    const kept = raw.commands.filter((r) => norm(r.name) !== null);
    const parsed = nightbot.parseCommands(raw);
    expect(parsed.map((c) => c.name)).toEqual(kept.map((r) => norm(r.name)));
    parsed.forEach((c, i) => {
      const r = kept[i];
      expect(c.aliases).toEqual(expectedAliases(r.alias, c.name));
      checkResponse(c.response, r.message);
      expect(c.userLevel).toBe(LEVELS.includes(r.userLevel as string) ? r.userLevel : 'unknown');
      if (typeof r.coolDown === 'number') expect(c.cooldownSec).toBe(r.coolDown);
      else expect(c).not.toHaveProperty('cooldownSec');
    });
  });

  it.each(['coconutb', 'kaicenat', 'ludwig'])('streamelements %s: only enabled, names, aliases, userLevel', (login) => {
    const raw = loadFixture('streamelements', login + '.commands.json') as Array<Record<string, any>>;
    const kept = raw.filter((r) => r.enabled === true && r.hidden !== true && norm(r.command) !== null);
    const parsed = streamelements.parseCommands(raw);
    expect(parsed.map((c) => c.name)).toEqual(kept.map((r) => norm(r.command)));
    parsed.forEach((c, i) => {
      const r = kept[i];
      expect(c.aliases).toEqual(expectedAliases(r.aliases, c.name));
      checkResponse(c.response, r.reply);
      expect(c.userLevel).toBe(r.accessLevel === 100 ? 'everyone' : r.accessLevel === 500 ? 'moderator' : 'unknown');
      const cds = [r.cooldown?.user, r.cooldown?.global].filter((v) => typeof v === 'number');
      if (cds.length) expect(cds).toContain(c.cooldownSec);
      else expect(c).not.toHaveProperty('cooldownSec');
    });
  });

  it('streamelements coconutb: 16 disabled commands are in the response and none of them is kept', () => {
    const raw = loadFixture('streamelements', 'coconutb.commands.json') as Array<Record<string, any>>;
    expect(raw).toHaveLength(176);
    const disabled = raw.filter((r) => r.enabled !== true).map((r) => norm(r.command));
    expect(disabled).toHaveLength(16);
    const names = new Set(streamelements.parseCommands(raw).map((c) => c.name));
    for (const d of disabled) expect(names.has(d as string)).toBe(false);
  });

  it.each([
    ['twitchdev', 5],
    ['kaajak1', 15],
    ['ipqow', 21],
    ['twitch', 0],
  ])('fossabot %s: names, aliases (doc: %i with aliases), role -> userLevel, default commands kept', (login, aliased) => {
    const raw = loadFixture('fossabot', login + '.commands.json') as {
      roles: Array<{ id: unknown; name: string }>;
      commands: Array<Record<string, any>>;
    };
    const roleName = new Map(raw.roles.map((r) => [String(r.id), r.name]));
    const kept = raw.commands.filter((r) => (r.enabled_online === true || r.enabled_offline === true) && norm(r.name) !== null);
    const parsed = fossabot.parseCommands(raw);
    expect(parsed.map((c) => c.name)).toEqual(kept.map((r) => norm(r.name)));
    expect(parsed.filter((c) => c.aliases.length > 0)).toHaveLength(aliased);
    parsed.forEach((c, i) => {
      const r = kept[i];
      expect(c.aliases).toEqual(expectedAliases(r.aliases, c.name));
      checkResponse(c.response, r.response);
      const ids: unknown[] = r.role_ids ?? [];
      if (ids.length === 0) expect(c.userLevel).toBe('everyone');
      else if (ids.length === 1) {
        const n = roleName.get(String(ids[0]));
        expect(c.userLevel).toBe(n === 'Broadcaster' ? 'owner' : n === 'Moderator' ? 'moderator' : 'unknown');
      } else expect(LEVELS).toContain(c.userLevel);
    });
    const defaults = raw.commands.filter((r) => r.type === 'default').length;
    expect(parsed.length).toBeGreaterThanOrEqual(defaults);
  });

  it('moobot pokimane: the one command, placeholders kept, no aliases, no userLevel, no cooldown', () => {
    expect(moobot.parseCommands(loadFixture('moobot', 'pokimane.commands.json'))).toEqual([
      { name: 'topic', aliases: [], response: 'Topic: <text> (by <by> <when> ago)', provider: 'moobot', alsoOn: [] },
    ]);
  });

  it('fixtures contain responses over 300 characters and parsing clips them (nightbot coconutb)', () => {
    const raw = loadFixture('nightbot', 'coconutb.commands.json') as { commands: Array<Record<string, any>> };
    const longOnes = raw.commands.filter((r) => expectedResponse(r.message).length > 300);
    expect(longOnes.length).toBeGreaterThan(0);
    const parsed = nightbot.parseCommands(raw);
    for (const c of parsed) expect(c.response.length).toBeLessThanOrEqual(300);
  });
});

describe('nightbot hand-built bodies', () => {
  const one = (item: Record<string, unknown>): Command => nightbot.parseCommands({ commands: [item] })[0];

  it('lowercases, trims and strips one leading "!" from the name', () => {
    expect(one({ name: '!Discord ' }).name).toBe('discord');
    expect(one({ name: 'discord' }).name).toBe('discord');
  });

  it.each(['!hello world', '!', '', '   ', 42, null, undefined])('drops the name %j', (name) => {
    expect(nightbot.parseCommands({ commands: [{ name }, { name: '!ok' }] }).map((c) => c.name)).toEqual(['ok']);
  });

  it('normalises the alias string and never lets it equal the name', () => {
    expect(one({ name: '!discord', alias: 'DC' }).aliases).toEqual(['dc']);
    expect(one({ name: '!discord', alias: ' !Dis ' }).aliases).toEqual(['dis']);
    expect(one({ name: '!discord', alias: '' }).aliases).toEqual([]);
    expect(one({ name: '!discord', alias: '!DISCORD' }).aliases).toEqual([]);
    expect(one({ name: '!discord' }).aliases).toEqual([]);
  });

  it('collapses the response to one trimmed line and clips it at 300', () => {
    expect(one({ name: '!a', message: '  Join   us\n at\tthe link ' }).response).toBe('Join us at the link');
    expect(one({ name: '!a', message: 'x'.repeat(400) }).response).toBe('x'.repeat(300));
    expect(one({ name: '!a', message: 'x'.repeat(300) }).response).toHaveLength(300);
    expect(one({ name: '!a' }).response).toBe('');
  });

  it('does not split a surrogate pair when clipping', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const clipped = one({ name: '!a', message: 'a'.repeat(299) + emoji + 'tail' }).response;
    expect(clipped).toBe('a'.repeat(299));
  });

  it.each(['everyone', 'subscriber', 'regular', 'vip', 'moderator', 'owner'])('keeps the known userLevel %s', (level) => {
    expect(one({ name: '!a', userLevel: level }).userLevel).toBe(level);
  });

  it.each(['bogus', 5, null, undefined])('maps the userLevel %j to unknown', (level) => {
    expect(one({ name: '!a', userLevel: level }).userLevel).toBe('unknown');
  });

  it('reads coolDown and omits it when missing or invalid', () => {
    expect(one({ name: '!a', coolDown: 30 }).cooldownSec).toBe(30);
    expect(one({ name: '!a', coolDown: 0 }).cooldownSec).toBe(0);
    for (const bad of [undefined, 'x', -1, null]) expect(one({ name: '!a', coolDown: bad })).not.toHaveProperty('cooldownSec');
  });

  it('skips non-object list items and tolerates a missing list', () => {
    expect(nightbot.parseCommands({ commands: [null, 5, 'x', [], { name: '!ok' }] }).map((c) => c.name)).toEqual(['ok']);
    expect(nightbot.parseCommands({ commands: 'nope' })).toEqual([]);
    expect(nightbot.parseCommands({ status: 200 })).toEqual([]);
  });

  it('parseChannel reads $.channel._id', () => {
    expect(nightbot.parseChannel({ channel: { _id: 'abc123' }, status: 200 })).toBe('abc123');
    expect(nightbot.parseChannel({ channel: { _id: '' } })).toBeNull();
    expect(nightbot.parseChannel({ channel: {} })).toBeNull();
    expect(nightbot.parseChannel({ message: 'user not found', status: 404 })).toBeNull();
  });
});

describe('streamelements hand-built bodies', () => {
  const base = { command: 'hello', reply: 'hi', enabled: true };
  const parse = (...items: Array<Record<string, unknown>>) => streamelements.parseCommands(items);

  it('keeps only enabled === true and hidden !== true', () => {
    expect(parse({ ...base }).map((c) => c.name)).toEqual(['hello']);
    expect(parse({ ...base, hidden: false }).map((c) => c.name)).toEqual(['hello']);
    expect(parse({ ...base, enabled: false })).toEqual([]);
    expect(parse({ ...base, enabled: undefined })).toEqual([]);
    expect(parse({ ...base, enabled: 'true' })).toEqual([]);
    expect(parse({ ...base, hidden: true })).toEqual([]);
  });

  it('normalises the name and drops spaced names', () => {
    expect(parse({ ...base, command: 'Hello' })[0].name).toBe('hello');
    expect(parse({ ...base, command: '!Hello' })[0].name).toBe('hello');
    expect(parse({ ...base, command: 'two words' })).toEqual([]);
    expect(parse({ ...base, command: '' })).toEqual([]);
  });

  it('normalises the aliases array and removes the name and duplicates', () => {
    expect(parse({ ...base, aliases: ['A', 'a', 'hello', '!b ', '', 'c d'] })[0].aliases).toEqual(['a', 'b']);
    expect(parse({ ...base })[0].aliases).toEqual([]);
  });

  it('maps accessLevel 100 -> everyone, 500 -> moderator, any other number -> unknown', () => {
    expect(parse({ ...base, accessLevel: 100 })[0].userLevel).toBe('everyone');
    expect(parse({ ...base, accessLevel: 500 })[0].userLevel).toBe('moderator');
    expect(parse({ ...base, accessLevel: 300 })[0].userLevel).toBe('unknown');
    expect(parse({ ...base, accessLevel: 1000 })[0].userLevel).toBe('unknown');
  });

  it('reads the cooldown and omits it when the provider publishes none', () => {
    expect(parse({ ...base, cooldown: { user: 30, global: 0 } })[0].cooldownSec).toBe(30);
    expect(parse({ ...base })[0]).not.toHaveProperty('cooldownSec');
  });

  it('collapses and clips the reply', () => {
    expect(parse({ ...base, reply: 'a\n\n b' })[0].response).toBe('a b');
    expect(parse({ ...base, reply: 'y'.repeat(500) })[0].response).toHaveLength(300);
    expect(parse({ ...base, reply: undefined })[0].response).toBe('');
  });

  it('is empty for anything that is not an array', () => {
    expect(streamelements.parseCommands({ command: 'x', enabled: true })).toEqual([]);
  });

  it('parseChannel reads $._id', () => {
    expect(streamelements.parseChannel({ _id: 'abc', username: 'x' })).toBe('abc');
    expect(streamelements.parseChannel({ _id: '' })).toBeNull();
    expect(streamelements.parseChannel({ statusCode: 404, error: 'Not Found', message: 'channel x was not found' })).toBeNull();
  });
});

describe('fossabot hand-built bodies', () => {
  const roles = [
    { id: 'r1', name: 'Broadcaster' },
    { id: 'r2', name: 'Moderator' },
    { id: 'r3', name: '[Imported] Channel Editor' },
  ];
  const on = { name: 'hello', response: 'hi', enabled_online: true, enabled_offline: true, type: 'custom' };
  const parse = (items: Array<Record<string, unknown>>) => fossabot.parseCommands({ roles, commands: items });

  it('keeps a command when either enabled flag is true and drops it when neither is', () => {
    expect(parse([{ ...on }])).toHaveLength(1);
    expect(parse([{ ...on, enabled_online: false }])).toHaveLength(1);
    expect(parse([{ ...on, enabled_offline: false }])).toHaveLength(1);
    expect(parse([{ ...on, enabled_online: false, enabled_offline: false }])).toEqual([]);
    expect(parse([{ name: 'x', response: 'y' }])).toEqual([]);
  });

  it('includes built-in commands (type default)', () => {
    expect(parse([{ ...on, name: 'addcmd', type: 'default' }]).map((c) => c.name)).toEqual(['addcmd']);
  });

  it('maps role names to userLevel: Broadcaster -> owner, Moderator -> moderator, other -> unknown, none -> everyone', () => {
    expect(parse([{ ...on, role_ids: ['r1'] }])[0].userLevel).toBe('owner');
    expect(parse([{ ...on, role_ids: ['r2'] }])[0].userLevel).toBe('moderator');
    expect(parse([{ ...on, role_ids: ['r3'] }])[0].userLevel).toBe('unknown');
    expect(parse([{ ...on, role_ids: ['missing-role'] }])[0].userLevel).toBe('unknown');
    expect(parse([{ ...on, role_ids: [] }])[0].userLevel).toBe('everyone');
    expect(parse([{ ...on }])[0].userLevel).toBe('everyone');
  });

  it('normalises name, aliases and response; has no cooldown', () => {
    const c = parse([{ ...on, name: 'Hello', aliases: ['HI', 'hello', '!yo'], response: ' a \n b ' }])[0];
    expect(c.name).toBe('hello');
    expect(c.aliases).toEqual(['hi', 'yo']);
    expect(c.response).toBe('a b');
    expect(c).not.toHaveProperty('cooldownSec');
  });

  it('drops spaced names, tolerates a missing roles table, and is empty without a commands array', () => {
    expect(parse([{ ...on, name: 'two words' }])).toEqual([]);
    expect(fossabot.parseCommands({ commands: [{ ...on }] })).toHaveLength(1);
    expect(fossabot.parseCommands({ roles })).toEqual([]);
  });

  it('parseChannel reads $.channel.id as a string', () => {
    expect(fossabot.parseChannel({ channel: { id: '28372', provider: 'twitch' } })).toBe('28372');
    expect(fossabot.parseChannel({ channel: { id: 28372 } })).toBe('28372');
    expect(fossabot.parseChannel({ code: 'not_found', error: 'Not Found', message: 'Resource not found', status: 404 })).toBeNull();
    expect(fossabot.parseChannel({ channel: {} })).toBeNull();
  });
});

describe('moobot hand-built bodies', () => {
  it('keeps every listed command, lowercases identifiers, keeps placeholders, and sets no aliases or level', () => {
    const out = moobot.parseCommands({
      list: [
        { type: 'custom', identifier: 'Topic', response: 'Topic: <text> (by <by>)' },
        { type: 'custom', identifier: 'two words', response: 'x' },
        { type: 'custom', identifier: '!lurk', response: 'bye' },
      ],
      _total: 3,
    });
    expect(out.map((c) => c.name)).toEqual(['topic', 'lurk']);
    expect(out[0].response).toBe('Topic: <text> (by <by>)');
    for (const c of out) {
      expect(c.aliases).toEqual([]);
      expect(c).not.toHaveProperty('userLevel');
      expect(c).not.toHaveProperty('cooldownSec');
    }
  });

  it('is empty for an empty list or no list', () => {
    expect(moobot.parseCommands({ list: [], _total: 0 })).toEqual([]);
    expect(moobot.parseCommands({ version: 476 })).toEqual([]);
  });

  it('parseChannel reads $.channel.userid and is null when there is no channel key', () => {
    expect(moobot.parseChannel({ channel: { userid: '44445592', username: 'pokimane' } })).toBe('44445592');
    expect(moobot.parseChannel({ version: 476, assistant: '1.1.14' })).toBeNull();
    expect(moobot.parseChannel({ channel: {} })).toBeNull();
  });

  it('moobotTotal reads _total and is null when absent', () => {
    expect(moobot.moobotTotal({ list: [], _total: 250 })).toBe(250);
    expect(moobot.moobotTotal({ list: [] })).toBeNull();
  });
});

describe('botrix (disabled adapter)', () => {
  it('parseChannel is always null and parseCommands is always empty', () => {
    expect(botrix.parseChannel({ channel: { id: 'x' } })).toBeNull();
    expect(botrix.parseCommands({ commands: [{ name: 'x' }] })).toEqual([]);
  });
});

describe.each(Object.keys(PARSERS))('%s tolerates garbage', (provider) => {
  it.each([null, undefined, 42, 'text', true, [], {}, [1, 2], { channel: null }, { commands: null }])(
    'body %j',
    (raw) => {
      expect(() => PARSERS[provider].parseChannel(raw)).not.toThrow();
      expect(() => PARSERS[provider].parseCommands(raw)).not.toThrow();
      expect(PARSERS[provider].parseChannel(raw)).toBeNull();
      expect(PARSERS[provider].parseCommands(raw)).toEqual([]);
    },
  );
});
