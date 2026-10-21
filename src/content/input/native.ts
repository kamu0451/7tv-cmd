// Native Twitch Slate input adapter (docs/SPEC.md sections 6.2 to 6.4). seventv.ts reuses
// createSlateInput: 7TV re-parents the same Slate editor (docs/reference-7tv-popup.md).
//
// Text model: getText() is the concatenation of the editor's editable text nodes with U+FEFF
// (Slate's zero-width placeholder character) removed; text inside [data-slate-placeholder] or a
// contenteditable="false" subtree (the "Send a message" placeholder, void nodes) is skipped.
// The content script never reads React or Slate internals (SPEC 6.4); it writes through the
// editor's own input path: a DOM selection plus a synthetic beforeinput (insertText, with the
// token as its target range) that slate-react applies to its model; execCommand('insertText')
// only when no listener cancels that event. See insert() for why SPEC 6.4's order is reversed.

import type { ChatInput, InputKind } from './types';

const ZWNBSP = String.fromCharCode(0xfeff);

// Twitch's native chat editor (observed 2026-10-21 in Chromium and Firefox, SPEC 6.3). Its class
// is chat-wysiwyg-input__editor; data-test-selector="chat-input", role="textbox" are also present.
export const SLATE_EDITOR_SELECTOR =
  'div[data-a-target="chat-input"][data-slate-editor="true"][contenteditable="true"]';

// Native anchor: the visible input box, div.chat-wysiwyg-input-box (x8 w1264 h41 in the 1280x800
// popout, observed 2026-10-21, docs/part3-notes.md); .chat-input__textarea has the same rect.
// Closest match wins, in order; the editor's parent is the last resort.
export const NATIVE_ANCHOR_SELECTORS = ['.chat-wysiwyg-input-box', '.chat-input__textarea'];

// ---------------------------------------------------------------------------------------------
// Keydown hub (SPEC 6.2): ONE capture listener on window, added at content-script start by
// installKeyHub(), so it runs before any page listener on document, the React root or 7TV's
// containers. Events are delivered to the inputs whose root is in event.composedPath().

interface KeyReg { root: HTMLElement; cb: (e: Event) => void }
const keyRegs = new Set<KeyReg>();
let hubInstalled = false;

function onWindowKeydown(e: KeyboardEvent): void {
  if (keyRegs.size === 0) return;
  const path = e.composedPath();
  for (const reg of Array.from(keyRegs)) {
    if (path.includes(reg.root)) reg.cb(e);
  }
}

export function installKeyHub(): void {
  if (hubInstalled) return;
  hubInstalled = true;
  window.addEventListener('keydown', onWindowKeydown, { capture: true });
}

// ---------------------------------------------------------------------------------------------
// Text mapping helpers.

function isSkipped(node: Node, root: HTMLElement): boolean {
  let el: Element | null = node.parentElement;
  while (el && el !== root) {
    if (el.hasAttribute('data-slate-placeholder')) return true;
    if (el.getAttribute('contenteditable') === 'false') return true;
    el = el.parentElement;
  }
  return false;
}

function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!isSkipped(n, root)) out.push(n as Text);
  }
  return out;
}

function cleanLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] !== ZWNBSP) n++;
  return n;
}

// Raw offset inside `s` of the clean index `ci` (0..cleanLength(s)).
function rawOffset(s: string, ci: number): number {
  let seen = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ZWNBSP) continue;
    if (seen === ci) return i;
    seen++;
  }
  return s.length;
}

interface DomPoint { node: Text; offset: number }

// DOM point for the clean index i. atStart: at a boundary between two nodes prefer the start of
// the next node (for a range start), else the end of the previous one.
function pointAt(nodes: Text[], i: number, atStart: boolean): DomPoint | null {
  let pos = 0;
  let last: DomPoint | null = null;
  for (const t of nodes) {
    const s = t.data;
    const len = cleanLength(s);
    if (len === 0) continue;
    if (i < pos + len || (i === pos + len && !atStart)) return { node: t, offset: rawOffset(s, i - pos) };
    pos += len;
    last = { node: t, offset: s.length };
  }
  return i === pos ? last : null;
}

function readText(root: HTMLElement): string {
  let out = '';
  for (const t of textNodes(root)) out += t.data;
  return out.split(ZWNBSP).join('');
}

function readCaret(root: HTMLElement): number {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return -1;
  const node = sel.anchorNode;
  if (!node || !root.contains(node)) return -1;
  const nodes = textNodes(root);
  let pos = 0;
  if (node.nodeType === Node.TEXT_NODE) {
    for (const t of nodes) {
      if (t === node) return pos + cleanLength(t.data.slice(0, sel.anchorOffset));
      pos += cleanLength(t.data);
    }
    // The caret sits in a skipped node (placeholder / zero-width only): count what precedes it.
  }
  const caretRange = document.createRange();
  caretRange.setStart(node, sel.anchorOffset);
  caretRange.collapse(true);
  pos = 0;
  for (const t of nodes) {
    if (caretRange.comparePoint(t, t.data.length) <= 0) pos += cleanLength(t.data);
    else break;
  }
  return pos;
}

// Runs cb once, on the next animation frame or after fallbackMs, whichever comes first. Measured
// 2026-10-21 (docs/part3-notes.md): with 7TV loaded in headless Chromium, requestAnimationFrame
// callbacks from the content script stalled until the next key event, so a frame wait alone can
// hang an insertion; the timer bounds it.
export function afterFrame(cb: () => void, fallbackMs = 50): void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    cb();
  };
  requestAnimationFrame(run);
  setTimeout(run, fallbackMs);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => afterFrame(resolve));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function select(root: HTMLElement, start: number, end: number): boolean {
  const nodes = textNodes(root);
  const a = pointAt(nodes, start, true);
  const b = start === end ? a : pointAt(nodes, end, false);
  const sel = document.getSelection();
  if (!a || !b || !sel) return false;
  if (document.activeElement !== root) root.focus({ preventScroll: true });
  sel.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
  return true;
}

// ---------------------------------------------------------------------------------------------

export function createSlateInput(root: HTMLElement, kind: InputKind, anchor: HTMLElement): ChatInput {
  const inputCbs = new Set<(e: Event) => void>();
  const blurCbs = new Set<(e: Event) => void>();
  const regs = new Set<KeyReg>();
  let scheduled = false;
  let pendingEvent: Event | null = null;
  let disposed = false;

  // 'input' is reported for any change of the draft or of the caret: Slate cancels most
  // beforeinput events and renders through React, so a native 'input' event is not guaranteed.
  // Sources: native input events, a MutationObserver on the editor, and selectionchange inside it.
  // Coalesced to one callback per microtask.
  function schedule(e: Event): void {
    if (disposed) return;
    if (!pendingEvent || e.type === 'input') pendingEvent = e;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const ev = pendingEvent ?? new Event('input');
      pendingEvent = null;
      if (disposed) return;
      for (const cb of Array.from(inputCbs)) cb(ev);
    });
  }

  const onNativeInput = (e: Event): void => schedule(e);
  const onBlur = (e: Event): void => {
    for (const cb of Array.from(blurCbs)) cb(e);
  };
  const onSelectionChange = (e: Event): void => {
    const sel = document.getSelection();
    if (sel && sel.anchorNode && root.contains(sel.anchorNode)) schedule(e);
  };
  const observer = new MutationObserver(() => schedule(new Event('input')));
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  root.addEventListener('input', onNativeInput);
  root.addEventListener('blur', onBlur);
  document.addEventListener('selectionchange', onSelectionChange);

  // Measured 2026-10-21 on the live popout chat (Chromium, native and 7TV, docs/part3-notes.md):
  // execCommand('insertText') changes the DOM but Slate's draft does NOT follow (DOM "!discord ",
  // Slate "!dis"), which corrupts the editor. So the order of SPEC 6.4 is reversed: a synthetic
  // beforeinput carrying the target range goes first (slate-react selects that range and applies
  // Editor.insertText, then cancels the event); execCommand runs only when no listener cancelled
  // it (an editor that is not Slate). A last attempt without targetRanges waits past Slate's
  // 100 ms selectionchange throttle so Slate's own selection is the token.
  // 'handled': a listener (slate-react) cancelled the event; 'unhandled': none did; 'unmapped':
  // [start, end) no longer exists in the draft, so nothing may be inserted at all.
  function fireBeforeInput(
    start: number,
    end: number,
    text: string,
    withRange: boolean,
  ): 'handled' | 'unhandled' | 'unmapped' {
    const nodes = textNodes(root);
    const a = pointAt(nodes, start, true);
    const b = pointAt(nodes, end, false);
    if (!a || !b) return 'unmapped';
    const init: InputEventInit = { inputType: 'insertText', data: text, cancelable: true, bubbles: true, composed: true };
    if (withRange) {
      init.targetRanges = [
        new StaticRange({ startContainer: a.node, startOffset: a.offset, endContainer: b.node, endOffset: b.offset }),
      ];
    }
    const ev = new InputEvent('beforeinput', init);
    root.dispatchEvent(ev);
    return ev.defaultPrevented ? 'handled' : 'unhandled';
  }

  async function insert(start: number, end: number, text: string, before: string): Promise<void> {
    await nextFrame(); // the selection set in replaceRange is synced (SPEC 6.4)
    if (disposed) return;
    // A key typed inside that frame already replaced the selected token: insert nothing.
    if (readText(root) !== before) return;
    const result = fireBeforeInput(start, end, text, true);
    if (result === 'unhandled') document.execCommand('insertText', false, text);
    if (result !== 'handled') return;
    // Slate cancelled the event. React may render a frame or more later, so only a draft that is
    // still UNCHANGED after Slate's throttle window counts as ignored (never insert twice).
    await wait(120);
    if (disposed || readText(root) !== before) return;
    if (!select(root, start, end)) return;
    await wait(120);
    if (disposed || readText(root) !== before) return;
    fireBeforeInput(start, end, text, false);
  }

  return {
    kind,
    root,
    anchor,
    getText: () => readText(root),
    getCaret: () => readCaret(root),
    replaceRange(start: number, end: number, text: string): boolean {
      if (disposed || !root.isConnected) return false;
      const before = readText(root);
      if (start < 0 || end < start || end > before.length) return false;
      if (!select(root, start, end)) return false;
      void insert(start, end, text, before);
      return true;
    },
    on(event: 'input' | 'keydown' | 'blur', cb: (e: Event) => void): () => void {
      if (event === 'keydown') {
        const reg: KeyReg = { root, cb };
        regs.add(reg);
        keyRegs.add(reg);
        return () => {
          regs.delete(reg);
          keyRegs.delete(reg);
        };
      }
      const set = event === 'input' ? inputCbs : blurCbs;
      set.add(cb);
      return () => set.delete(cb);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      root.removeEventListener('input', onNativeInput);
      root.removeEventListener('blur', onBlur);
      document.removeEventListener('selectionchange', onSelectionChange);
      for (const reg of regs) keyRegs.delete(reg);
      regs.clear();
      inputCbs.clear();
      blurCbs.clear();
    },
  };
}

function nativeAnchor(root: HTMLElement): HTMLElement {
  for (const sel of NATIVE_ANCHOR_SELECTORS) {
    const el = root.closest<HTMLElement>(sel);
    if (el) return el;
  }
  return root.parentElement ?? root;
}

export function createNativeInput(root: HTMLElement): ChatInput | null {
  if (!root.isConnected) return null;
  return createSlateInput(root, 'native', nativeAnchor(root));
}
