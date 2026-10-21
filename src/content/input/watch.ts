// watchChatInput (docs/SPEC.md section 6.3): reports the current chat input, or null.
// One MutationObserver on the document (subtree, childList), evaluated at most once per animation
// frame. The callback fires only when the editor element or its kind changes; the caller disposes
// the previous ChatInput. Every evaluation also runs the tick listeners (onWatchTick), which
// content/index.ts uses to re-check location.href for SPA navigation (SPEC 6.1).

import { afterFrame, createNativeInput, SLATE_EDITOR_SELECTOR } from './native';
import { createSevenTvInput, SEVENTV_CONTAINER_SELECTOR } from './seventv';
import type { ChatInput, InputKind } from './types';

const tickListeners = new Set<() => void>();

// Registers a function run on every watcher evaluation (at most once per animation frame).
export function onWatchTick(fn: () => void): () => void {
  tickListeners.add(fn);
  return () => tickListeners.delete(fn);
}

function visible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function findEditor(): { root: HTMLElement; kind: InputKind } | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(SLATE_EDITOR_SELECTOR));
  if (all.length === 0) return null;
  // Prefer a 7TV-wrapped editor, then any visible one, then the first.
  const wrapped = all.find((el) => el.closest(SEVENTV_CONTAINER_SELECTOR) && visible(el));
  if (wrapped) return { root: wrapped, kind: 'seventv' };
  const root = all.find(visible) ?? all[0];
  return { root, kind: root.closest(SEVENTV_CONTAINER_SELECTOR) ? 'seventv' : 'native' };
}

export function watchChatInput(cb: (input: ChatInput | null) => void): () => void {
  let lastRoot: HTMLElement | null = null;
  let lastKind: InputKind | null = null;
  let reported = false;
  let pending = false;
  let stopped = false;

  function evaluate(): void {
    pending = false;
    if (stopped) return;
    for (const fn of Array.from(tickListeners)) fn();
    const found = findEditor();
    const root = found ? found.root : null;
    const kind = found ? found.kind : null;
    if (reported && root === lastRoot && kind === lastKind) return;
    let input: ChatInput | null = null;
    if (found) input = found.kind === 'seventv' ? createSevenTvInput(found.root) : createNativeInput(found.root);
    const wasNull = reported && lastRoot === null;
    lastRoot = input ? root : null;
    lastKind = input ? kind : null;
    if (!input && wasNull) return; // null already reported
    reported = true;
    cb(input);
  }

  // At most once per animation frame; afterFrame's 100 ms timer bounds a stalled frame loop.
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    afterFrame(evaluate, 100);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  evaluate();

  return () => {
    stopped = true;
    observer.disconnect();
  };
}
