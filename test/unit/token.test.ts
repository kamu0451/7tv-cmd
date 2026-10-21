import { describe, expect, it } from 'vitest';
import { activeToken, isTrigger } from '../../src/content/token';

const trigger = (text: string, caret: number) => isTrigger(activeToken(text, caret), text);

describe('activeToken', () => {
  it('is null for caret -1 (unknown or non-collapsed selection)', () => {
    expect(activeToken('!ban', -1)).toBeNull();
    expect(activeToken('', -1)).toBeNull();
  });

  it('finds the token when the caret is at its end', () => {
    expect(activeToken('!ban', 4)).toEqual({ start: 0, end: 4, text: '!ban' });
  });

  it('finds the token when the caret is at its start', () => {
    expect(activeToken('!ban', 0)).toEqual({ start: 0, end: 4, text: '!ban' });
  });

  it('returns the whole token, not only the part before the caret', () => {
    expect(activeToken('!banana', 3)).toEqual({ start: 0, end: 7, text: '!banana' });
  });

  it('finds the token in the middle of a sentence', () => {
    expect(activeToken('hello !ban world', 9)).toEqual({ start: 6, end: 10, text: '!ban' });
    expect(activeToken('hello !ban world', 2)).toEqual({ start: 0, end: 5, text: 'hello' });
  });

  it('a caret right after a space gives the empty token at the caret', () => {
    expect(activeToken('hello ', 6)).toEqual({ start: 6, end: 6, text: '' });
  });

  it('a caret on the boundary after a space belongs to the following token', () => {
    expect(activeToken('a !b', 2)).toEqual({ start: 2, end: 4, text: '!b' });
    expect(activeToken('a !b', 1)).toEqual({ start: 0, end: 1, text: 'a' });
  });

  it('empty text gives the empty token at caret 0', () => {
    expect(activeToken('', 0)).toEqual({ start: 0, end: 0, text: '' });
  });

  it('treats tabs, newlines and no-break spaces as token separators', () => {
    expect(activeToken('a\t!b', 4)).toEqual({ start: 2, end: 4, text: '!b' });
    expect(activeToken('a\n!b', 4)).toEqual({ start: 2, end: 4, text: '!b' });
    const nbsp = String.fromCharCode(0xa0);
    expect(activeToken('a' + nbsp + '!b', 4)).toEqual({ start: 2, end: 4, text: '!b' });
  });
});

describe('isTrigger', () => {
  it('is true for "!" alone at offset 0', () => {
    expect(trigger('!', 1)).toBe(true);
  });

  it('is true for "!partial" at offset 0 and after a space', () => {
    expect(trigger('!ba', 3)).toBe(true);
    expect(trigger('hello !ba', 9)).toBe(true);
    expect(trigger('hello !', 7)).toBe(true);
  });

  it('is true after any whitespace character', () => {
    expect(trigger('a\t!b', 4)).toBe(true);
    expect(trigger('a\n!b', 4)).toBe(true);
  });

  it('is true wherever the caret sits inside the token', () => {
    expect(trigger('x !banana', 3)).toBe(true);
    expect(trigger('x !banana', 6)).toBe(true);
    expect(trigger('x !banana', 9)).toBe(true);
  });

  it('is false for "!" in the middle of a word', () => {
    expect(trigger('foo!bar', 7)).toBe(false);
    expect(trigger('foo!bar', 4)).toBe(false);
    expect(trigger('a!b', 3)).toBe(false);
  });

  it('is false when the "!" follows a non-space character even if a token is built by hand', () => {
    expect(isTrigger({ start: 3, end: 7, text: '!abc' }, 'abc!abc')).toBe(false);
  });

  it('is false for a second "!" in the token', () => {
    expect(trigger('!!', 2)).toBe(false);
    expect(trigger('!ba!n', 5)).toBe(false);
    expect(trigger('hi !ban!', 8)).toBe(false);
  });

  it('is false for ":", "/" and "@" tokens, which belong to 7TV and Twitch', () => {
    expect(trigger(':ee', 3)).toBe(false);
    expect(trigger('/me', 3)).toBe(false);
    expect(trigger('@bob', 4)).toBe(false);
  });

  it('is false for the empty token and plain words', () => {
    expect(trigger('hello ', 6)).toBe(false);
    expect(trigger('hello', 5)).toBe(false);
    expect(trigger('', 0)).toBe(false);
  });

  it('is false for a null token (caret -1)', () => {
    expect(isTrigger(null, '!ban')).toBe(false);
    expect(trigger('!ban', -1)).toBe(false);
  });

  it('is false when the caret is in the word before the "!" token', () => {
    expect(trigger('hello !ban', 3)).toBe(false);
  });
});
