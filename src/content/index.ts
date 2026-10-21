// Content script entry (docs/SPEC.md sections 6.1, 6.5, 10): channel detection with SPA
// re-evaluation, background requests through sendRequest, the cached ChannelCommands copy, the
// controller lifecycle, and the 'tvcmd' test hook events.

import { channelFromUrl } from '../channel/url';
import { sendRequest } from '../shared/messages';
import type { ChannelCommands } from '../shared/types';
import { debug, warn } from '../shared/log';
import { createController } from './controller';
import type { TvcmdEvent } from './controller';
import { installKeyHub } from './input/native';
import { onWatchTick, watchChatInput } from './input/watch';
import type { ChatInput } from './input/types';

// SPEC 6.2: the one window capture keydown listener is added at content-script start.
installKeyHub();

interface CacheEntry { data: ChannelCommands; receivedAt: number }

const copies = new Map<string, CacheEntry>();
const inflight = new Set<string>();
let login: string | null = null;
let lastHref = '';
let input: ChatInput | null = null;
let contextGone = false;

function emit(d: TvcmdEvent): void {
  document.dispatchEvent(new CustomEvent('tvcmd', { detail: JSON.stringify(d) }));
}

const controller = createController({
  getCommands: () => (login ? copies.get(login)?.data ?? null : null),
  receivedAt: () => (login ? copies.get(login)?.receivedAt ?? 0 : 0),
  requestCommands: () => {
    if (login) fetchCommands(login);
  },
  emit,
});

function fetchCommands(forLogin: string): void {
  if (contextGone || inflight.has(forLogin)) return;
  inflight.add(forLogin);
  sendRequest({ type: 'commands:get', login: forLogin })
    .then((resp) => {
      if (!resp.ok) {
        warn('commands:get failed for ' + forLogin + ': ' + resp.error);
        return;
      }
      copies.set(forLogin, { data: resp.data, receivedAt: Date.now() });
      emit({
        event: 'fetch',
        count: resp.data.commands.length,
        fromCache: resp.data.fromCache,
        login: forLogin,
        t: performance.now(),
      });
      if (forLogin === login) controller.commandsChanged();
    })
    .catch((e: unknown) => {
      // The extension was reloaded or removed under a live page: stop asking.
      const msg = e instanceof Error ? e.message : String(e);
      if (/context invalidated|no extension runtime/i.test(msg)) contextGone = true;
      warn('commands:get messaging failed: ' + msg);
    })
    .finally(() => inflight.delete(forLogin));
}

// Prefetch only with a chat input on a detected channel (SPEC 6.5).
function prefetch(): void {
  if (input && login && !copies.has(login)) fetchCommands(login);
}

function checkLocation(): void {
  const href = location.href;
  if (href === lastHref) return;
  lastHref = href;
  const next = channelFromUrl(href);
  if (next === login) return;
  login = next;
  controller.setChannel(next);
  debug('channel ' + (next ?? 'none'));
  prefetch();
}

checkLocation();
onWatchTick(checkLocation);
window.addEventListener('popstate', checkLocation);
document.addEventListener('visibilitychange', checkLocation);

watchChatInput((next) => {
  const prev = input;
  input = next;
  controller.setInput(next);
  if (prev) prev.dispose(); // the watcher reports a fresh ChatInput; the caller disposes the old one
  prefetch();
});

debug('loaded');
