// Wires input -> token -> commands -> match -> popup -> insert (docs/SPEC.md section 6.5).
// The controller owns the popup instance and the key handling while it is open; content/index.ts
// owns channel detection, the background requests and the cached ChannelCommands copy.

import type { ChannelCommands, Command, Suggestion } from '../shared/types';
import { filterCommands } from '../match/match';
import { createPopup } from './popup/popup';
import type { Popup } from './popup/popup';
import { activeToken, isTrigger } from './token';
import type { ChatInput } from './input/types';
import { afterFrame } from './input/native';

// Twitch's native autocomplete tray, which 7TV fills with its ":" emote rows and Twitch with "/"
// commands and "@" chatters (docs/reference-7tv-popup.md, recorded 2026-10-21). We never open
// while one is visible.
export const NATIVE_TRAY_SELECTOR = 'div.autocomplete-match-list';
export const POPUP_HOST_ID = 'tvcmd-popup-host'; // SPEC 7.2
const MAX_ROWS = 13; // docs/reference-7tv-popup.md: 13 rows visible, then scroll
const STALE_MS = 60_000; // SPEC 6.5: re-request when the copy is older than 60 s

export interface TvcmdEvent {
  event: 'open' | 'update' | 'close' | 'insert' | 'fetch';
  query?: string;
  count?: number;
  t: number;
  keyT?: number;
  login?: string;
  fromCache?: boolean;
}

export interface ControllerOptions {
  getCommands(): ChannelCommands | null; // the cached copy for the current channel, read synchronously
  receivedAt(): number;                  // Date.now() when that copy arrived (0 when none)
  requestCommands(): void;               // asks the background again (content/index.ts dedupes)
  emit(d: TvcmdEvent): void;             // the 'tvcmd' test hook (SPEC 10)
}

export interface Controller {
  setChannel(login: string | null): void;
  setInput(input: ChatInput | null): void;
  dispose(): void;
  commandsChanged(): void;               // new data arrived: re-evaluate the current token
  pickByName(name: string): boolean;     // inserts "!name " at the active "!" token (unit tests)
}

function nativeTrayVisible(): boolean {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(NATIVE_TRAY_SELECTOR))) {
    if (el.getClientRects().length > 0 && el.offsetHeight > 0) return true;
  }
  return false;
}

export function createController(opts: ControllerOptions): Controller {
  let input: ChatInput | null = null;
  let login: string | null = null;
  let popup: Popup | null = null;
  let open = false;
  let lastState = '';
  let dismissedState = '';
  let lastKeyT: number | undefined;
  let staleAsked = false;
  let unsubs: Array<() => void> = [];

  function ensurePopup(): Popup {
    if (!popup) {
      popup = createPopup({
        maxRows: MAX_ROWS,
        getEditorRect: () => (input ? input.root.getBoundingClientRect() : new DOMRect()),
        onPick: (s) => pick(s.command.name),
        onClose: () => setClosed(false),
      });
    }
    return popup;
  }

  function stateKey(text: string, caret: number): string {
    return caret + '|' + text;
  }

  function emitShown(kind: 'open' | 'update', query: string, count: number): void {
    const keyT = lastKeyT;
    afterFrame(() => {
      opts.emit({ event: kind, query, count, t: performance.now(), keyT, login: login ?? undefined });
    });
  }

  function setClosed(callPopup: boolean): void {
    if (callPopup && popup) popup.close();
    if (!open) return;
    open = false;
    staleAsked = false;
    opts.emit({ event: 'close', t: performance.now(), login: login ?? undefined });
  }

  function evaluate(force: boolean): void {
    if (!input) return;
    const text = input.getText();
    const caret = input.getCaret();
    const key = stateKey(text, caret);
    if (!force && key === lastState) return;
    lastState = key;
    if (key === dismissedState) return;
    dismissedState = '';
    const token = activeToken(text, caret);
    if (!login || !isTrigger(token, text) || !token) {
      setClosed(true);
      return;
    }
    if (!open && nativeTrayVisible()) return;
    const data = opts.getCommands();
    if (!data) {
      opts.requestCommands(); // opens when the response arrives (commandsChanged)
      setClosed(true);
      return;
    }
    // The background re-fetches only past its TTL, so this costs a message, not a provider request.
    if (!staleAsked && Date.now() - opts.receivedAt() > STALE_MS) {
      staleAsked = true;
      opts.requestCommands();
    }
    const query = token.text.slice(1);
    const items: Suggestion[] = filterCommands(data.commands, query);
    if (items.length === 0) {
      setClosed(true);
      return;
    }
    const p = ensurePopup();
    if (open) {
      p.update(items, query);
      emitShown('update', query, items.length);
    } else {
      p.open(input.anchor, items, query);
      open = true;
      emitShown('open', query, items.length);
    }
  }

  function pick(name: string): boolean {
    if (!input) return false;
    const text = input.getText();
    const caret = input.getCaret();
    let token = activeToken(text, caret);
    if (!token || !token.text.startsWith('!')) {
      // The caret moved (a click on a row keeps it, but be lenient): use the last "!" token.
      const at = text.lastIndexOf('!');
      token = at >= 0 && (at === 0 || /\s/.test(text[at - 1])) ? activeToken(text, at + 1) : null;
    }
    if (!token || !isTrigger(token, text)) return false;
    const query = token.text.slice(1);
    // No second space when whitespace already follows the token ("!dis| hello").
    const space = token.end < text.length && /\s/.test(text[token.end]) ? '' : ' ';
    const ok = input.replaceRange(token.start, token.end, '!' + name + space);
    setClosed(true);
    if (ok) opts.emit({ event: 'insert', query, t: performance.now(), keyT: lastKeyT, login: login ?? undefined });
    return ok;
  }

  function onKeydown(ev: Event): void {
    const e = ev as KeyboardEvent;
    lastKeyT = e.timeStamp;
    if (!open || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const p = popup;
    if (!p) return;
    switch (e.key) {
      case 'ArrowDown':
        p.move(1);
        break;
      case 'ArrowUp':
        p.move(-1);
        break;
      case 'Tab':
      case 'Enter': {
        const s = p.current();
        if (s) pick(s.command.name);
        else setClosed(true);
        break;
      }
      case 'Escape':
        if (input) dismissedState = stateKey(input.getText(), input.getCaret());
        setClosed(true);
        break;
      default:
        return; // every other key is untouched; Space closes through the next input evaluation
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onBlur(ev: Event): void {
    const related = (ev as FocusEvent).relatedTarget;
    const host = document.getElementById(POPUP_HOST_ID);
    if (related instanceof Node && host && host.contains(related)) return;
    setClosed(true);
  }

  function onMouseDown(ev: MouseEvent): void {
    if (!open || !input) return;
    const path = ev.composedPath();
    const host = document.getElementById(POPUP_HOST_ID);
    if (path.includes(input.root) || (host && path.includes(host))) return;
    setClosed(true);
  }
  document.addEventListener('mousedown', onMouseDown, { capture: true });

  function detach(): void {
    for (const u of unsubs) u();
    unsubs = [];
    setClosed(true);
    lastState = '';
    dismissedState = '';
  }

  return {
    setChannel(next: string | null): void {
      if (next === login) return;
      login = next;
      setClosed(true);
      lastState = '';
      dismissedState = '';
    },
    setInput(next: ChatInput | null): void {
      if (next === input) return;
      detach();
      input = next;
      if (!next) return;
      // Round 2 (P4-3): mount the popup host while the input attaches, not on the first "!",
      // so the first open is a text update only.
      ensurePopup();
      unsubs.push(next.on('input', () => evaluate(false)));
      unsubs.push(next.on('keydown', onKeydown));
      unsubs.push(next.on('blur', onBlur));
    },
    commandsChanged(): void {
      evaluate(true);
    },
    pickByName(name: string): boolean {
      const data = opts.getCommands();
      const cmd: Command | undefined = data?.commands.find((c) => c.name === name || c.aliases.includes(name));
      return pick(cmd ? cmd.name : name);
    },
    dispose(): void {
      detach();
      input = null;
      document.removeEventListener('mousedown', onMouseDown, { capture: true });
      if (popup) popup.destroy();
      popup = null;
    },
  };
}
