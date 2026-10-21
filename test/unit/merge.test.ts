import { describe, expect, it } from 'vitest';
import { mergeCommands } from '../../src/providers/merge';
import { parseCommands as nightbotCommands } from '../../src/providers/nightbot';
import { parseCommands as streamelementsCommands } from '../../src/providers/streamelements';
import type { Command, ProviderId, ProviderResult } from '../../src/shared/types';
import { cmd, deepFreeze } from '../helpers/commands';
import { loadFixture } from '../helpers/fixtures';

function result(provider: ProviderId, commands: Command[]): ProviderResult {
  return {
    provider,
    status: commands.length ? 'ok' : 'empty',
    commands: commands.map((c) => ({ ...c, provider })),
    fetchedAt: 1,
    requests: 1,
  };
}

describe('mergeCommands', () => {
  it('returns [] for no results and for results without commands', () => {
    expect(mergeCommands([])).toEqual([]);
    expect(mergeCommands([result('nightbot', []), { ...result('fossabot', []), status: 'error', error: 'HTTP 500' }])).toEqual([]);
  });

  it('dedupes by name: one command, the first provider wins, later providers go to alsoOn', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('discord', { response: 'nb reply' })]),
      result('streamelements', [cmd('discord', { response: 'se reply' })]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe('nightbot');
    expect(out[0].response).toBe('nb reply');
    expect(out[0].alsoOn).toEqual(['streamelements']);
  });

  it('keeps the winner\'s cooldown and userLevel', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('x', { cooldownSec: 5, userLevel: 'moderator' })]),
      result('streamelements', [cmd('x', { cooldownSec: 99, userLevel: 'everyone' })]),
    ]);
    expect(out[0].cooldownSec).toBe(5);
    expect(out[0].userLevel).toBe('moderator');
  });

  it('lists later providers in alsoOn in registry (input) order', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('hi')]),
      result('streamelements', [cmd('hi')]),
      result('fossabot', [cmd('hi')]),
      result('moobot', [cmd('hi')]),
    ]);
    expect(out[0].provider).toBe('nightbot');
    expect(out[0].alsoOn).toEqual(['streamelements', 'fossabot', 'moobot']);
  });

  it('the first result in the given order wins, not the alphabetically first provider', () => {
    const out = mergeCommands([result('fossabot', [cmd('hi')]), result('nightbot', [cmd('hi')])]);
    expect(out[0].provider).toBe('fossabot');
    expect(out[0].alsoOn).toEqual(['nightbot']);
  });

  it('does not list the same provider twice or list the winner in its own alsoOn', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('x'), cmd('x')]),
      result('streamelements', [cmd('x')]),
      result('streamelements', [cmd('x')]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].alsoOn).toEqual(['streamelements']);
  });

  it('unions aliases across providers without duplicates, winner\'s first', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('x', { aliases: ['a'] })]),
      result('streamelements', [cmd('x', { aliases: ['b', 'a'] })]),
      result('fossabot', [cmd('x', { aliases: ['c'] })]),
    ]);
    expect(out[0].aliases).toEqual(['a', 'b', 'c']);
  });

  it('removes the command\'s own name from its alias list', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('x', { aliases: ['x', 'y'] })]),
      result('streamelements', [cmd('x', { aliases: ['x', 'z'] })]),
    ]);
    expect(out[0].aliases).toEqual(['y', 'z']);
  });

  it('drops an alias that equals another command\'s name (in the same provider)', () => {
    const out = mergeCommands([result('nightbot', [cmd('ban', { aliases: ['b', 'zap'] }), cmd('b')])]);
    const byName = Object.fromEntries(out.map((c) => [c.name, c]));
    expect(byName.ban.aliases).toEqual(['zap']);
    expect(byName.b.aliases).toEqual([]);
    expect(out).toHaveLength(2);
  });

  it('drops an alias that equals another command\'s name defined by a later provider', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('ban', { aliases: ['b'] })]),
      result('streamelements', [cmd('b')]),
    ]);
    expect(out.find((c) => c.name === 'ban')?.aliases).toEqual([]);
    expect(out.find((c) => c.name === 'b')?.provider).toBe('streamelements');
  });

  it('drops an alias contributed by a later provider when it names another command', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('ban'), cmd('b')]),
      result('streamelements', [cmd('ban', { aliases: ['b', 'zap'] })]),
    ]);
    expect(out.find((c) => c.name === 'ban')?.aliases).toEqual(['zap']);
  });

  it('keeps an alias shared by two commands when no command is named like it', () => {
    const out = mergeCommands([result('nightbot', [cmd('one', { aliases: ['o'] }), cmd('two', { aliases: ['o'] })])]);
    expect(out.map((c) => c.aliases)).toEqual([['o'], ['o']]);
  });

  it('sorts the output by name in code-unit order', () => {
    const out = mergeCommands([
      result('nightbot', [cmd('zeta'), cmd('b_x'), cmd('bax')]),
      result('streamelements', [cmd('alpha'), cmd('b1x')]),
    ]);
    expect(out.map((c) => c.name)).toEqual(['alpha', 'b1x', 'b_x', 'bax', 'zeta']);
  });

  it('does not mutate its input and returns independent copies', () => {
    const input = deepFreeze([
      result('nightbot', [cmd('x', { aliases: ['a', 'x'], alsoOn: [] })]),
      result('streamelements', [cmd('x', { aliases: ['b'] }), cmd('a')]),
    ]);
    const before = JSON.stringify(input);
    const out = mergeCommands(input);
    expect(JSON.stringify(input)).toBe(before);
    out[0].aliases.push('mutated');
    out[0].alsoOn.push('mutated');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('merges the recorded coconutb Nightbot and StreamElements fixtures: 75 + 160 with 8 shared names', () => {
    const nb = nightbotCommands(loadFixture('nightbot', 'coconutb.commands.json'));
    const se = streamelementsCommands(loadFixture('streamelements', 'coconutb.commands.json'));
    expect(nb).toHaveLength(75);
    expect(se).toHaveLength(160);
    const seNames = new Set(se.map((c) => c.name));
    const shared = nb.filter((c) => seNames.has(c.name)).map((c) => c.name);
    expect(shared).toHaveLength(8);

    const out = mergeCommands([result('nightbot', nb), result('streamelements', se)]);
    expect(out).toHaveLength(75 + 160 - 8);
    for (const name of shared) {
      const c = out.find((x) => x.name === name)!;
      expect(c.provider).toBe('nightbot');
      expect(c.alsoOn).toEqual(['streamelements']);
    }
    expect(out.filter((c) => c.alsoOn.length > 0)).toHaveLength(8);
    expect(new Set(out.map((c) => c.name)).size).toBe(out.length);
    for (const c of out) expect(c.aliases).not.toContain(c.name);
    const names = out.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });
});
