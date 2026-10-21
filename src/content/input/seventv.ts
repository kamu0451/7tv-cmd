// 7TV-wrapped input adapter (docs/SPEC.md section 6.3). 7TV v3.1.6 does not replace the Slate
// editor: it re-parents div.chat-wysiwyg-input__editor inside
// seventv-container.seventv-chat-input-textarea within seventv-container.seventv-chat-input-container
// (docs/reference-7tv-popup.md, "How 7TV hooks the chat input", recorded 2026-10-21). So this
// adapter is the Slate adapter with kind 'seventv' and its own anchor choice (below). 7TV's own Tab carousel and ":" handling need no special case:
// our window capture-phase keydown runs first and only consumes keys while our popup is open.

import { createSlateInput, NATIVE_ANCHOR_SELECTORS } from './native';
import type { ChatInput } from './types';

// Recorded in docs/reference-7tv-popup.md (2026-10-21).
export const SEVENTV_CONTAINER_SELECTOR = 'seventv-container.seventv-chat-input-container';
export const SEVENTV_TEXTAREA_SELECTOR = 'seventv-container.seventv-chat-input-textarea';

// Anchor: measured 2026-10-21 (docs/part3-notes.md) the 7TV container spans the whole popout
// (x0 w1280), while div.chat-wysiwyg-input-box inside 7TV's textarea is x8 w1264, the closest
// box to the recorded tray rect (x13 w1254). So the input box wins and the container is the
// fallback.
export function createSevenTvInput(root: HTMLElement): ChatInput | null {
  if (!root.isConnected) return null;
  const container = root.closest<HTMLElement>(SEVENTV_CONTAINER_SELECTOR);
  if (!container) return null;
  const box = root.closest<HTMLElement>(NATIVE_ANCHOR_SELECTORS[0]);
  return createSlateInput(root, 'seventv', box && container.contains(box) ? box : container);
}
