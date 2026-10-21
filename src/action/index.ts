// Toolbar action page (docs/SPEC.md section 5.5): the current tab's channel, each provider's status,
// command count and age, and a Refresh button that sends 'commands:refresh'. Text goes in through
// textContent only. The channel comes from the active tab URL (activeTab permission); a "?login="
// query parameter on this page overrides it so the page can be opened in a tab for tests.

import { channelFromUrl } from '../channel/url';
import { sendRequest } from '../shared/messages';
import type { ChannelCommands, ProviderResult } from '../shared/types';

interface TabsLike {
  query(info: { active: boolean; currentWindow: boolean }): Promise<Array<{ url?: string }>>;
}

const LOGIN_RE = /^[a-z0-9_]{1,25}$/i;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + ' s';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min';
  return Math.round(m / 60) + ' h';
}

function statusText(p: ProviderResult): string {
  switch (p.status) {
    case 'ok':
      return 'ok';
    case 'empty':
      return 'no commands';
    case 'error':
      return 'error';
    case 'unsupported':
      return 'unsupported';
  }
}

async function currentLogin(): Promise<string | null> {
  const forced = new URLSearchParams(location.search).get('login');
  if (forced !== null) return LOGIN_RE.test(forced) ? forced.toLowerCase() : null;
  const g = globalThis as unknown as { browser?: { tabs?: TabsLike }; chrome?: { tabs?: TabsLike } };
  const tabs = g.browser?.tabs ?? g.chrome?.tabs;
  if (!tabs) return null;
  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    return tab?.url ? channelFromUrl(tab.url) : null;
  } catch {
    return null;
  }
}

function render(data: ChannelCommands): void {
  const rows = el<HTMLTableSectionElement>('rows');
  rows.textContent = '';
  const table = el<HTMLTableElement>('providers');
  table.hidden = data.providers.length === 0;
  const now = Date.now();
  for (const p of data.providers) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = p.provider;
    const status = document.createElement('td');
    status.textContent = statusText(p);
    if (p.status === 'error') status.className = 'status-error';
    if (p.error) {
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.textContent = p.error;
      status.appendChild(detail);
    }
    const count = document.createElement('td');
    count.className = 'num';
    count.textContent = p.status === 'unsupported' ? '-' : String(p.commands.length);
    const age = document.createElement('td');
    age.className = 'num';
    age.textContent = p.status === 'unsupported' ? '-' : formatAge(now - p.fetchedAt);
    tr.append(name, status, count, age);
    rows.appendChild(tr);
  }
  const note = el<HTMLParagraphElement>('note');
  if (data.providers.length === 0) note.textContent = 'Nothing cached for this channel yet. Press Refresh to fetch it.';
  else note.textContent = data.commands.length + ' commands in total.';
}

async function main(): Promise<void> {
  const channel = el<HTMLParagraphElement>('channel');
  const button = el<HTMLButtonElement>('refresh');
  const note = el<HTMLParagraphElement>('note');
  const login = await currentLogin();
  if (login === null) {
    channel.textContent = 'Open a Twitch channel in this tab to see its commands.';
    return;
  }
  channel.textContent = 'Channel: ';
  const strong = document.createElement('strong');
  strong.textContent = login;
  channel.appendChild(strong);

  try {
    const status = await sendRequest({ type: 'commands:status', login });
    if (status.ok) render(status.data);
    else note.textContent = 'Could not read the cache: ' + status.error;
  } catch (e) {
    note.textContent = 'Could not reach the background script: ' + (e instanceof Error ? e.message : String(e));
  }
  button.disabled = false;

  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Refreshing...';
    note.textContent = '';
    void sendRequest({ type: 'commands:refresh', login })
      .then((r) => {
        if (!r.ok) {
          note.textContent = 'Refresh failed: ' + r.error;
          return;
        }
        render(r.data);
        if (r.refreshed === false) note.textContent = 'Refreshed less than a minute ago. Showing the cached list.';
      })
      .catch((e: unknown) => {
        note.textContent = 'Refresh failed: ' + (e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = 'Refresh';
      });
  });
}

void main();
