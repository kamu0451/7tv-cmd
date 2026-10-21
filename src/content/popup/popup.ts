// createPopup (docs/SPEC.md section 7). Vanilla DOM in an open shadow root on div#tvcmd-popup-host.
// Third-party strings (command names, aliases, responses) are written with textContent only.

import type { Suggestion } from '../../shared/types';
import { BORDER_PX, GAP_PX, POPUP_CSS, ROW_HEIGHT } from './styles';

export interface PopupOptions {
  maxRows: number;                       // visible rows before scrolling; from the reference
  getEditorRect(): DOMRect;              // bounding rect of input.root (the editor); the popup sits 4 px above its top edge (section 7.2)
  onPick(s: Suggestion): void;
  onClose(): void;                       // called only when the popup hides itself (open()/update() with an empty list); close() never calls it, click outside is the controller's job
}

export interface Popup {
  open(anchor: HTMLElement, items: Suggestion[], query: string): void;   // mounts once, shows, selects index 0
  update(items: Suggestion[], query: string): void;                     // keeps the selection on the same command when still present, else index 0; no unmount, no flicker
  move(delta: 1 | -1): void;                                            // wraps at both ends; scrolls the selected row into view
  current(): Suggestion | null;
  isOpen(): boolean;
  close(): void;
  reposition(): void;                                                   // repositions now; the popup also repositions itself on window resize and scroll
  destroy(): void;
}

/** Provider badge text: 2-3 chars, text only (SPEC 7.2). Unknown ids fall back to their first 2 letters. */
const BADGES: Record<string, string> = {
  nightbot: 'NB',
  streamelements: 'SE',
  fossabot: 'FB',
  moobot: 'MB',
  botrix: 'BRX',
  wizebot: 'WZ',
  streamlabs: 'SL',
  phantombot: 'PB',
};

export function providerBadge(provider: string): string {
  return BADGES[provider] ?? provider.slice(0, 2).toUpperCase();
}

const MIN_WIDTH = 280;          // SPEC 7.2: width from the anchor, min 280 px
const EDGE_MARGIN = 8;          // SPEC 7.2: max height = space above the input minus 8 px
const MIN_ROWS_ABOVE = 3;       // SPEC 7.2: fewer than 3 rows fit above -> open below

interface RowNodes {
  el: HTMLDivElement;
  pre: Text;
  mark: HTMLElement;
  post: Text;
  alias: HTMLSpanElement;
  badge: HTMLSpanElement;
  l2: HTMLDivElement;
}

function sameCommand(a: Suggestion, b: Suggestion): boolean {
  return a.command.name === b.command.name && a.command.provider === b.command.provider;
}

export function createPopup(opts: PopupOptions): Popup {
  let host: HTMLDivElement | null = null;
  let tray: HTMLDivElement | null = null;
  let anchorEl: HTMLElement | null = null;
  let items: Suggestion[] = [];
  let selected = -1;
  // True once the user moved the selection (keys or mouse) since open(). update() keeps the
  // selection on the same command only then; an untouched selection stays on row 0, so typing
  // "!b" after "!" selects the best "b" match instead of following "abacus" down the list.
  let userMoved = false;
  let shown = false;
  const rows: RowNodes[] = [];

  function mount(): HTMLDivElement {
    if (tray && host && host.isConnected) return tray;
    host = document.createElement('div');
    host.id = 'tvcmd-popup-host';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = POPUP_CSS;
    tray = document.createElement('div');
    tray.className = 'tray';
    tray.setAttribute('role', 'listbox');
    tray.setAttribute('aria-label', 'Bot commands');
    root.append(style, tray);
    // Rows keep the input focused: no blur, caret and selection unchanged (SPEC 7.2).
    tray.addEventListener('mousedown', (e) => e.preventDefault());
    tray.addEventListener('mousemove', (e) => {
      const i = rowIndexOf(e.target);
      if (i >= 0 && i !== selected) select(i, false);
    });
    tray.addEventListener('click', (e) => {
      const i = rowIndexOf(e.target);
      if (i >= 0 && i < items.length) {
        select(i, false);
        opts.onPick(items[i]);
      }
    });
    rows.length = 0;
    // LEDGER P4-3: a pool of maxRows rows is built now, not on the first open.
    for (let i = 0; i < opts.maxRows; i++) rows.push(makeRow(i));
    document.body.appendChild(host);
    // Parse the shadow stylesheet now so the first open does not pay for it.
    void getComputedStyle(tray).display;
    return tray;
  }

  function rowIndexOf(target: EventTarget | null): number {
    let n = target instanceof Node ? target : null;
    while (n && n !== tray) {
      if (n instanceof HTMLElement && n.parentNode === tray) {
        const v = n.dataset.i;
        return v === undefined ? -1 : Number(v);
      }
      n = n.parentNode;
    }
    return -1;
  }

  function makeRow(i: number): RowNodes {
    const el = document.createElement('div');
    el.className = 'row';
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', 'false');
    el.dataset.i = String(i);
    const l1 = document.createElement('div');
    l1.className = 'l1';
    const name = document.createElement('span');
    name.className = 'name';
    const pre = document.createTextNode('');
    const mark = document.createElement('b');
    const post = document.createTextNode('');
    name.append(pre, mark, post);
    const alias = document.createElement('span');
    alias.className = 'alias';
    const badge = document.createElement('span');
    badge.className = 'badge';
    l1.append(name, alias, badge);
    const l2 = document.createElement('div');
    l2.className = 'l2';
    el.append(l1, l2);
    return { el, pre, mark, post, alias, badge, l2 };
  }

  function setText(node: Text | HTMLElement, value: string): void {
    // Only touch the DOM when the value changed: filtering reuses rows without repainting them.
    if (node.textContent !== value) node.textContent = value;
  }

  function fill(r: RowNodes, s: Suggestion): void {
    const m = s.matched;
    const [a, b] = s.range;
    setText(r.pre, '!' + m.slice(0, a));
    setText(r.mark, m.slice(a, b));
    setText(r.post, m.slice(b));
    setText(r.alias, s.viaAlias ? '-> !' + s.command.name : '');
    setText(r.badge, providerBadge(s.command.provider));
    setText(r.l2, s.command.response);
    const title = s.command.response || '!' + s.command.name;
    if (r.el.title !== title) r.el.title = title;
  }

  function render(): void {
    const t = mount();
    const n = items.length;
    for (let i = 0; i < n; i++) {
      let r = rows[i];
      if (!r) {
        r = makeRow(i);
        rows.push(r);
      }
      fill(r, items[i]);
      if (r.el.parentNode !== t) t.appendChild(r.el);
    }
    // Surplus rows are detached but kept for reuse.
    for (let i = n; i < rows.length; i++) {
      const el = rows[i].el;
      if (el.parentNode) el.remove();
    }
  }

  function paintSelection(prev: number): void {
    if (prev >= 0 && prev < rows.length && prev !== selected) rows[prev].el.setAttribute('aria-selected', 'false');
    if (selected >= 0 && selected < rows.length) rows[selected].el.setAttribute('aria-selected', 'true');
  }

  function select(i: number, scroll: boolean): void {
    const prev = selected;
    userMoved = true;
    selected = i;
    paintSelection(prev);
    if (scroll) scrollToSelected();
  }

  function scrollToSelected(): void {
    if (!tray || selected < 0) return;
    // Manual scroll inside the tray (the tray is position: fixed, so no page scroll can happen).
    const top = selected * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    const view = tray.clientHeight;
    if (top < tray.scrollTop) tray.scrollTop = top;
    else if (bottom > tray.scrollTop + view) tray.scrollTop = bottom - view;
  }

  function applyTheme(): void {
    if (!tray) return;
    const light = document.documentElement.classList.contains('tw-root--theme-light');
    tray.classList.toggle('light', light);
  }

  function reposition(): void {
    if (!tray || !anchorEl || !shown) return;
    const a = anchorEl.getBoundingClientRect();
    const ed = opts.getEditorRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(a.width, MIN_WIDTH), vw);
    const left = Math.max(0, Math.min(a.left, vw - width));
    // The 1 px frame (border-box) sits outside the rows: 13 rows stay fully visible (LEDGER P4-2).
    const frame = 2 * BORDER_PX;
    const rowsMax = Math.max(1, opts.maxRows) * ROW_HEIGHT + frame;
    const contentH = items.length * ROW_HEIGHT + frame;
    const spaceAbove = ed.top - EDGE_MARGIN;
    let top: number;
    let height: number;
    if (spaceAbove >= MIN_ROWS_ABOVE * ROW_HEIGHT) {
      height = Math.min(contentH, rowsMax, spaceAbove);
      top = ed.top - GAP_PX - height;
    } else {
      top = ed.bottom + GAP_PX;
      height = Math.max(ROW_HEIGHT + frame, Math.min(contentH, rowsMax, vh - top - EDGE_MARGIN));
    }
    const s = tray.style;
    s.left = left + 'px';
    s.top = top + 'px';
    s.width = width + 'px';
    s.height = height + 'px';
  }

  const onViewportChange = (): void => reposition();

  mount(); // LEDGER P4-3: host, shadow root, stylesheet and row pool exist from creation

  function show(): void {
    if (shown) return;
    shown = true;
    tray?.classList.add('open');
    host?.setAttribute('data-tvcmd-open', '1');
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
  }

  function hide(): void {
    if (!shown) return;
    shown = false;
    tray?.classList.remove('open');
    host?.removeAttribute('data-tvcmd-open');
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, { capture: true });
  }

  /** Sets the selection and re-asserts every attached row: a reused row may carry a stale aria-selected. */
  function selectExact(next: number): void {
    for (let i = 0; i < items.length; i++) {
      const want = i === next ? 'true' : 'false';
      if (rows[i].el.getAttribute('aria-selected') !== want) rows[i].el.setAttribute('aria-selected', want);
    }
    selected = next;
  }

  /** open()/update() with an empty list: hide and fire onClose (SPEC 7.1 edge rules). */
  function hideSelf(): void {
    items = [];
    selected = -1;
    render();
    hide();
    opts.onClose();
  }

  return {
    open(anchor, list, _query) {
      anchorEl = anchor;
      if (list.length === 0) {
        hideSelf();
        return;
      }
      items = list;
      render();
      applyTheme();
      selectExact(0);
      userMoved = false;
      show();
      reposition();
      if (tray) tray.scrollTop = 0;
    },
    update(list, _query) {
      if (list.length === 0) {
        hideSelf();
        return;
      }
      const cur = userMoved && selected >= 0 && selected < items.length ? items[selected] : null;
      userMoved = false;
      items = list;
      render();
      let next = 0;
      if (cur) {
        for (let i = 0; i < list.length; i++) {
          if (sameCommand(list[i], cur)) {
            next = i;
            userMoved = true; // still following the user's choice
            break;
          }
        }
      }
      selectExact(next);
      if (!shown) {
        applyTheme();
        show();
      }
      reposition();
      scrollToSelected();
    },
    move(delta) {
      const n = items.length;
      if (!shown || n === 0) return;
      const base = selected < 0 ? (delta > 0 ? -1 : 0) : selected;
      select((((base + delta) % n) + n) % n, true);
    },
    current() {
      return shown && selected >= 0 && selected < items.length ? items[selected] : null;
    },
    isOpen() {
      return shown;
    },
    close() {
      hide();
    },
    reposition,
    destroy() {
      hide();
      host?.remove();
      host = null;
      tray = null;
      anchorEl = null;
      items = [];
      selected = -1;
      rows.length = 0;
    },
  };
}
