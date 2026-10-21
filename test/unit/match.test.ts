import { describe, expect, it } from 'vitest';
import { filterCommands } from '../../src/match/match';
import { cmd, deepFreeze } from '../helpers/commands';

const names = (xs: ReturnType<typeof filterCommands>) => xs.map((s) => s.command.name);

describe('filterCommands ordering (SPEC 8)', () => {
  it('ranks exact before prefix before substring', () => {
    const out = filterCommands([cmd('abc'), cmd('ban'), cmd('b')], 'b');
    expect(names(out)).toEqual(['b', 'ban', 'abc']);
    expect(out.map((s) => s.kind)).toEqual(['exact', 'prefix', 'substring']);
  });

  it('ranks a name match before an alias match of the same kind, even when the alias is shorter', () => {
    const out = filterCommands([cmd('zzz', { aliases: ['bb'] }), cmd('bxxxx')], 'b');
    expect(names(out)).toEqual(['bxxxx', 'zzz']);
    expect(out[0].viaAlias).toBe(false);
    expect(out[1].viaAlias).toBe(true);
    expect(out[1].matched).toBe('bb');
  });

  it('inside one command the name beats an alias of equal kind, even when the alias is shorter', () => {
    const [s] = filterCommands([cmd('barnacle', { aliases: ['bar'] })], 'ba');
    expect(s.matched).toBe('barnacle');
    expect(s.viaAlias).toBe(false);
    expect(s.kind).toBe('prefix');
  });

  it('inside one command a better kind via an alias beats a worse kind via the name', () => {
    const [s] = filterCommands([cmd('bar', { aliases: ['b'] })], 'b');
    expect(s.matched).toBe('b');
    expect(s.viaAlias).toBe(true);
    expect(s.kind).toBe('exact');
  });

  it('inside one command the shorter alias wins between two aliases of equal kind', () => {
    const [s] = filterCommands([cmd('zeta', { aliases: ['banana', 'ban'] })], 'ba');
    expect(s.matched).toBe('ban');
    expect(s.viaAlias).toBe(true);
  });

  it('inside one command alphabetical order decides between equal-length aliases', () => {
    const [s] = filterCommands([cmd('zeta', { aliases: ['bz', 'ba'] })], 'b');
    expect(s.matched).toBe('ba');
  });

  it('puts the shorter matched text first within one kind', () => {
    expect(names(filterCommands([cmd('baba'), cmd('bab'), cmd('ba')], 'b'))).toEqual(['ba', 'bab', 'baba']);
  });

  it('orders equal kind and equal length alphabetically', () => {
    expect(names(filterCommands([cmd('bz'), cmd('ba'), cmd('bm')], 'b'))).toEqual(['ba', 'bm', 'bz']);
  });

  it('compares in code-unit order, not locale order', () => {
    // code units: '1' (0x31) < '_' (0x5f) < 'a' (0x61); localeCompare would put '_' first.
    expect(names(filterCommands([cmd('bax'), cmd('b_x'), cmd('b1x')], 'b'))).toEqual(['b1x', 'b_x', 'bax']);
  });

  it('is independent of the input order', () => {
    const list = [cmd('ban'), cmd('abc'), cmd('b'), cmd('zzz', { aliases: ['bb'] }), cmd('bxxxx'), cmd('xb')];
    const expected = names(filterCommands(list, 'b'));
    const reversed = [...list].reverse();
    const rotated = [...list.slice(2), ...list.slice(0, 2)];
    expect(names(filterCommands(reversed, 'b'))).toEqual(expected);
    expect(names(filterCommands(rotated, 'b'))).toEqual(expected);
  });

  it('drops commands with no matching name or alias', () => {
    expect(filterCommands([cmd('discord'), cmd('ban', { aliases: ['x'] })], 'zzz')).toEqual([]);
  });

  it('compares duplicate aliases once and returns one suggestion per command', () => {
    const out = filterCommands([cmd('zeta', { aliases: ['ba', 'ba', 'ba'] })], 'b');
    expect(out).toHaveLength(1);
    expect(out[0].matched).toBe('ba');
  });

  it('ignores an alias equal to the command name', () => {
    const out = filterCommands([cmd('ban', { aliases: ['ban'] })], 'ban');
    expect(out).toHaveLength(1);
    expect(out[0].viaAlias).toBe(false);
  });
});

describe('filterCommands query handling', () => {
  it('lists every command for an empty query, in name order, as prefix with range [0, 0]', () => {
    const list = [cmd('zeta'), cmd('alpha', { aliases: ['a'] }), cmd('mid')];
    const out = filterCommands(list, '');
    expect(names(out)).toEqual(['alpha', 'mid', 'zeta']);
    for (const s of out) {
      expect(s.kind).toBe('prefix');
      expect(s.range).toEqual([0, 0]);
      expect(s.viaAlias).toBe(false);
      expect(s.matched).toBe(s.command.name);
    }
  });

  it('treats a whitespace-only query as empty', () => {
    expect(names(filterCommands([cmd('b'), cmd('a')], '   '))).toEqual(['a', 'b']);
  });

  it('empty query on no commands is an empty list', () => {
    expect(filterCommands([], '')).toEqual([]);
    expect(filterCommands([], 'b')).toEqual([]);
  });

  it('trims and lowercases the query', () => {
    const out = filterCommands([cmd('ban')], '  BAN ');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('exact');
  });

  it('empty-query order is code-unit order too', () => {
    expect(names(filterCommands([cmd('a1'), cmd('a_'), cmd('aa')], ''))).toEqual(['a1', 'a_', 'aa']);
  });
});

describe('filterCommands highlight ranges', () => {
  it('prefix and exact ranges start at 0 and span the query', () => {
    const [prefix] = filterCommands([cmd('banana')], 'ban');
    expect(prefix.range).toEqual([0, 3]);
    const [exact] = filterCommands([cmd('ban')], 'ban');
    expect(exact.range).toEqual([0, 3]);
  });

  it('substring range starts at the first occurrence in the matched text', () => {
    const [s] = filterCommands([cmd('xxbanban')], 'ban');
    expect(s.kind).toBe('substring');
    expect(s.range).toEqual([2, 5]);
    expect(s.matched.slice(s.range[0], s.range[1])).toBe('ban');
  });

  it('an alias match is highlighted inside the alias, not the name', () => {
    const [s] = filterCommands([cmd('discord', { aliases: ['xxdc'] })], 'dc');
    expect(s.viaAlias).toBe(true);
    expect(s.matched).toBe('xxdc');
    expect(s.range).toEqual([2, 4]);
    expect(s.kind).toBe('substring');
  });

  it('every range slices back to the lowercased query', () => {
    const list = [cmd('ban'), cmd('xban'), cmd('b'), cmd('zeta', { aliases: ['abba'] })];
    for (const s of filterCommands(list, 'B')) {
      expect(s.matched.slice(s.range[0], s.range[1])).toBe('b');
    }
  });
});

describe('filterCommands limit', () => {
  const many = Array.from({ length: 150 }, (_, i) => cmd('c' + String(i).padStart(3, '0')));

  it('defaults to 1000 suggestions', () => {
    expect(filterCommands(many, '')).toHaveLength(150);
    expect(filterCommands(many, 'c')).toHaveLength(150);
  });

  it('keeps the best ones when it cuts', () => {
    const out = filterCommands([cmd('xb'), cmd('b'), cmd('bb'), cmd('bbb')], 'b', 2);
    expect(names(out)).toEqual(['b', 'bb']);
  });

  it('honours an explicit limit for empty and non-empty queries', () => {
    expect(filterCommands(many, '', 7)).toHaveLength(7);
    expect(filterCommands(many, 'c', 7)).toHaveLength(7);
    expect(filterCommands(many, 'c', 500)).toHaveLength(150);
  });

  it('a limit of 0 gives an empty list', () => {
    expect(filterCommands(many, 'c', 0)).toEqual([]);
    expect(filterCommands(many, '', 0)).toEqual([]);
  });
});

describe('filterCommands purity', () => {
  it('never mutates its input and returns the same command objects', () => {
    const list = deepFreeze([
      cmd('zeta', { aliases: ['bb', 'ba'] }),
      cmd('ban', { alsoOn: ['streamelements'] }),
      cmd('abc'),
    ]);
    const before = JSON.stringify(list);
    const order = list.map((c) => c.name);
    const out = filterCommands(list, 'b');
    expect(JSON.stringify(list)).toBe(before);
    expect(list.map((c) => c.name)).toEqual(order);
    for (const s of out) expect(list).toContain(s.command);
    filterCommands(list, '');
    expect(JSON.stringify(list)).toBe(before);
  });

  it('returns a new array each call and the same result for the same input', () => {
    const list = [cmd('ban'), cmd('abc')];
    const a = filterCommands(list, 'b');
    const b = filterCommands(list, 'b');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a.pop();
    expect(filterCommands(list, 'b')).toHaveLength(2);
  });
});
