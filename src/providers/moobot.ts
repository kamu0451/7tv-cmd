// Moobot adapter. Chain as recorded in docs/providers/moobot.md, both calls POST with a form body:
//   1. POST https://moo.bot/a/1/channel/meta                         body name=<login>  -> $.channel.userid
//   2. POST https://moo.bot/a/1/channel/public/commands/list         body _limit=100&_offset=<n>&_order=identifier&channel=<userid>
//      -> { list[], _total }; follows _offset until _offset >= _total, at most MAX_PAGES pages.
// corsOpen is false: Access-Control-Allow-Origin is the fixed value https://moo.bot (recorded), so the
// background fetch needs the host permission https://moo.bot/* (src/providers/hosts.json).
// An unknown login is HTTP 200 with no `channel` key (no 404).

import type { Command, ProviderResult } from '../shared/types';
import { asRecord, normName, normResponse, requireOk, requireShape, runChain } from './merge';
import type { AdapterContext, ProviderAdapter } from './types';

const ID = 'moobot';
const MAX_PAGES = 5;
const PAGE_LIMIT = 100;
const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Accept: 'application/json',
};

// Meta body -> the Twitch user id Moobot knows the channel by; null when there is no channel key.
export function parseChannel(raw: unknown): string | null {
  const id = asRecord(asRecord(raw)?.channel)?.userid;
  if (typeof id === 'string' && id !== '') return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return null;
}

// $._total of a list page, null when absent.
export function moobotTotal(raw: unknown): number | null {
  const t = asRecord(raw)?._total;
  return typeof t === 'number' && Number.isFinite(t) ? t : null;
}

// $.list[]: identifier (no "!"), response (placeholders in angle brackets, kept as is). Moobot lists
// only active, unrestricted commands, so every entry is kept; no aliases, cooldown or userLevel.
export function parseCommands(raw: unknown): Command[] {
  const list = asRecord(raw)?.list;
  if (!Array.isArray(list)) return [];
  const out: Command[] = [];
  for (const item of list) {
    const e = asRecord(item);
    if (!e) continue;
    const name = normName(e.identifier);
    if (name === null) continue;
    out.push({ name, aliases: [], response: normResponse(e.response), provider: ID, alsoOn: [] });
  }
  return out;
}

export const moobot: ProviderAdapter = {
  id: ID,
  label: 'MB',
  hosts: ['moo.bot'],
  corsOpen: false,
  enabled: true,
  fetchCommands(login: string, ctx: AdapterContext): Promise<ProviderResult> {
    return runChain(ID, ctx, async (http) => {
      const r1 = await http.post('https://moo.bot/a/1/channel/meta', 'name=' + encodeURIComponent(login), FORM_HEADERS);
      if (r1.status === 404) return [];
      requireOk(r1);
      const id = parseChannel(r1.body);
      if (id === null) return [];
      const all: Command[] = [];
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const form = `_limit=${PAGE_LIMIT}&_offset=${offset}&_order=identifier&channel=${encodeURIComponent(id)}`;
        const r = await http.post('https://moo.bot/a/1/channel/public/commands/list', form, FORM_HEADERS);
        requireOk(r);
        const list = asRecord(r.body)?.list;
        requireShape(Array.isArray(list));
        const got = (list as unknown[]).length;
        all.push(...parseCommands(r.body));
        offset += got;
        const total = moobotTotal(r.body);
        if (got === 0 || total === null || offset >= total) break;
      }
      return all;
    });
  },
};
