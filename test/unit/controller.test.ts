// content/controller.ts pick (SPEC 6.5): the text handed to ChatInput.replaceRange. Node has no DOM,
// so the popup module is replaced by a stub and the ChatInput is a plain object.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/content/popup/popup', () => ({
  createPopup: () => ({
    open() {},
    update() {},
    close() {},
    destroy() {},
    move() {},
    current: () => null,
  }),
}));

import { createController } from '../../src/content/controller';
import type { ChatInput } from '../../src/content/input/types';

function fakeInput(text: string, caret: number) {
  const replaceRange = vi.fn((_start: number, _end: number, _text: string) => true);
  const input = {
    kind: 'native',
    root: {},
    anchor: {},
    getText: () => text,
    getCaret: () => caret,
    replaceRange,
    on: () => () => {},
    dispose() {},
  } as unknown as ChatInput;
  return { input, replaceRange };
}

function pickDiscord(text: string, caret: number) {
  const { input, replaceRange } = fakeInput(text, caret);
  const c = createController({ getCommands: () => null, receivedAt: () => 0, requestCommands() {}, emit() {} });
  c.setChannel('coconutb');
  c.setInput(input);
  const ok = c.pickByName('discord');
  c.dispose();
  return { ok, replaceRange };
}

beforeEach(() => {
  vi.stubGlobal('document', {
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pick: trailing space', () => {
  it('appends one space when the token ends the draft', () => {
    const { ok, replaceRange } = pickDiscord('!dis', 4);
    expect(ok).toBe(true);
    expect(replaceRange).toHaveBeenCalledWith(0, 4, '!discord ');
  });

  it('appends one space mid-sentence when the token ends the draft', () => {
    const { replaceRange } = pickDiscord('hi !dis', 7);
    expect(replaceRange).toHaveBeenCalledWith(3, 7, '!discord ');
  });

  it('adds no second space when whitespace already follows the token ("!dis| hello" -> "!discord hello")', () => {
    const { replaceRange } = pickDiscord('!dis hello', 4);
    expect(replaceRange).toHaveBeenCalledWith(0, 4, '!discord');
    const [start, end, inserted] = replaceRange.mock.calls[0];
    expect('!dis hello'.slice(0, start) + inserted + '!dis hello'.slice(end)).toBe('!discord hello');
  });

  it('adds no second space when the caret is inside the token and a tab follows it', () => {
    const { replaceRange } = pickDiscord('!dis\thello', 2);
    expect(replaceRange).toHaveBeenCalledWith(0, 4, '!discord');
  });
});
