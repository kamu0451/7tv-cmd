// content/input/native.ts replaceRange -> insert (SPEC 6.4) against a minimal fake DOM: one editor
// root holding plain text nodes, a fake selection, a recorded execCommand, and an animation frame
// that never fires (the 50 ms fallback of afterFrame runs it, under fake timers).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSlateInput } from '../../src/content/input/native';

class FakeInputEvent extends Event {
  inputType: string;
  data: string | null;
  targetRanges: unknown[];
  constructor(type: string, init: { inputType?: string; data?: string; targetRanges?: unknown[] } & EventInit) {
    super(type, init);
    this.inputType = init.inputType ?? '';
    this.data = init.data ?? null;
    this.targetRanges = init.targetRanges ?? [];
  }
}

class FakeRoot extends EventTarget {
  texts: Array<{ data: string; parentElement: FakeRoot }> = [];
  isConnected = true;
  constructor(text: string) {
    super();
    this.texts.push({ data: text, parentElement: this });
  }
  get text(): string {
    return this.texts.map((t) => t.data).join('');
  }
  set text(s: string) {
    this.texts[0].data = s;
  }
  contains(n: unknown): boolean {
    return n === this || this.texts.includes(n as never);
  }
  focus(): void {}
  getAttribute(): null {
    return null;
  }
  hasAttribute(): boolean {
    return false;
  }
}

let root: FakeRoot;
let execCommand: ReturnType<typeof vi.fn>;
let fired: FakeInputEvent[];

function setup(text: string, slate?: (e: FakeInputEvent) => void) {
  root = new FakeRoot(text);
  fired = [];
  root.addEventListener('beforeinput', (e) => {
    fired.push(e as FakeInputEvent);
    if (slate) slate(e as FakeInputEvent);
  });
  execCommand = vi.fn((_cmd: string, _ui: boolean, value: string) => {
    root.text = value; // a plain contenteditable: the token is still selected, so it is replaced
    return true;
  });
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('StaticRange', class { constructor(init: object) { Object.assign(this, init); } });
  vi.stubGlobal('InputEvent', FakeInputEvent);
  vi.stubGlobal('requestAnimationFrame', () => 0); // stalled; the 50 ms fallback runs the insert
  vi.stubGlobal('document', {
    activeElement: root,
    addEventListener() {},
    removeEventListener() {},
    getSelection: () => ({ rangeCount: 1, isCollapsed: true, setBaseAndExtent() {} }),
    createTreeWalker: (r: FakeRoot) => {
      let i = -1;
      return { nextNode: () => r.texts[++i] ?? null };
    },
    execCommand,
  });
  return createSlateInput(root as unknown as HTMLElement, 'native', root as unknown as HTMLElement);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('replaceRange happy path (unchanged draft)', () => {
  it('a non-Slate editor: one beforeinput with the token range, then one execCommand insertText', async () => {
    const input = setup('!dis');
    expect(input.replaceRange(0, 4, '!discord ')).toBe(true);
    expect(fired).toHaveLength(0); // nothing before the frame
    await vi.advanceTimersByTimeAsync(50);
    expect(fired).toHaveLength(1);
    expect(fired[0].inputType).toBe('insertText');
    expect(fired[0].data).toBe('!discord ');
    expect(fired[0].targetRanges).toHaveLength(1);
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith('insertText', false, '!discord ');
    await vi.advanceTimersByTimeAsync(500);
    expect(fired).toHaveLength(1);
    expect(root.text).toBe('!discord ');
  });

  it('Slate cancels and applies the insertion: no execCommand, no second event', async () => {
    const input = setup('!dis', (e) => {
      e.preventDefault();
      root.text = '!discord ';
    });
    input.replaceRange(0, 4, '!discord ');
    await vi.advanceTimersByTimeAsync(500);
    expect(fired).toHaveLength(1);
    expect(execCommand).not.toHaveBeenCalled();
    expect(root.text).toBe('!discord ');
  });

  it('Slate cancels but the draft stays unchanged: one retry without a target range, never execCommand', async () => {
    const input = setup('!dis', (e) => e.preventDefault());
    input.replaceRange(0, 4, '!discord ');
    await vi.advanceTimersByTimeAsync(50 + 120 + 120);
    expect(fired).toHaveLength(2);
    expect(fired[1].targetRanges).toHaveLength(0);
    expect(execCommand).not.toHaveBeenCalled();
  });
});

describe('a key typed before the deferred insertion runs (COR-1)', () => {
  it('draft "!dis" became "h" inside the frame: nothing is inserted (was "h!discord ")', async () => {
    const input = setup('!dis');
    input.replaceRange(0, 4, '!discord ');
    root.text = 'h'; // the browser replaced the selected token with the typed letter
    await vi.advanceTimersByTimeAsync(500);
    expect(fired).toHaveLength(0);
    expect(execCommand).not.toHaveBeenCalled();
    expect(root.text).toBe('h');
  });

  it('draft emptied inside the frame (message sent): nothing is typed into the empty input', async () => {
    const input = setup('!dis');
    input.replaceRange(0, 4, '!discord ');
    root.text = '';
    await vi.advanceTimersByTimeAsync(500);
    expect(fired).toHaveLength(0);
    expect(execCommand).not.toHaveBeenCalled();
    expect(root.text).toBe('');
  });

  it('draft changed to a same-length text inside the frame: no beforeinput and no execCommand', async () => {
    const input = setup('!dis');
    input.replaceRange(0, 4, '!discord ');
    root.text = '!dix';
    await vi.advanceTimersByTimeAsync(500);
    expect(fired).toHaveLength(0);
    expect(execCommand).not.toHaveBeenCalled();
    expect(root.text).toBe('!dix');
  });
});
