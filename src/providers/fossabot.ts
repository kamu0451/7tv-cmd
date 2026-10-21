// Fossabot adapter. Chain as recorded in docs/providers/fossabot.md (the page-only /stream call and
// the fossadev-* headers are not needed and not used):
//   1. GET https://fossabot.com/api/v2/cached/channels/by-slug/<login>   -> $.channel.id
//   2. GET https://fossabot.com/api/v2/cached/channels/<id>/commands     -> { roles[], commands[] }
// corsOpen: Access-Control-Allow-Origin: * on every response (recorded).

import type { Command, ProviderResult, UserLevel } from '../shared/types';
import { asRecord, normAliases, normName, normResponse, requireOk, requireShape, runChain } from './merge';
import type { AdapterContext, ProviderAdapter } from './types';

const ID = 'fossabot';

// by-slug body -> Fossabot's channel id (a string such as "28372"); null for the recorded 404 body.
// The slug namespace is shared with other platforms, so a channel whose provider is not twitch is
// treated as unknown.
export function parseChannel(raw: unknown): string | null {
  const channel = asRecord(asRecord(raw)?.channel);
  if (!channel) return null;
  if (typeof channel.provider === 'string' && channel.provider !== 'twitch') return null;
  const id = channel.id;
  if (typeof id === 'string' && id !== '') return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return null;
}

const LEVEL_RANK: Record<string, number> = { everyone: 0, moderator: 1, owner: 2 };

// role_ids joined to roles[].name: none -> everyone, Broadcaster -> owner, Moderator -> moderator,
// any other role -> unknown. With several roles the most permissive known level wins; one unmapped
// role makes the result unknown.
function levelOf(roleIds: unknown, roleNames: Map<string, string>): UserLevel {
  if (!Array.isArray(roleIds) || roleIds.length === 0) return 'everyone';
  let best: UserLevel | null = null;
  for (const rid of roleIds) {
    const name = roleNames.get(String(rid));
    const lvl: UserLevel = name === 'Broadcaster' ? 'owner' : name === 'Moderator' ? 'moderator' : 'unknown';
    if (lvl === 'unknown') return 'unknown';
    if (best === null || LEVEL_RANK[lvl] < LEVEL_RANK[best]) best = lvl;
  }
  return best ?? 'unknown';
}

// $.commands[]: name (no "!"), aliases[], response, role_ids[], enabled_online / enabled_offline
// (no single flag; keep a command when either is true). type "default" commands are included.
export function parseCommands(raw: unknown): Command[] {
  const body = asRecord(raw);
  const list = body?.commands;
  if (!body || !Array.isArray(list)) return [];
  const roleNames = new Map<string, string>();
  if (Array.isArray(body.roles)) {
    for (const r of body.roles) {
      const rec = asRecord(r);
      if (rec && rec.id !== undefined && typeof rec.name === 'string') roleNames.set(String(rec.id), rec.name);
    }
  }
  const out: Command[] = [];
  for (const item of list) {
    const e = asRecord(item);
    if (!e || !(e.enabled_online === true || e.enabled_offline === true)) continue;
    const name = normName(e.name);
    if (name === null) continue;
    out.push({
      name,
      aliases: normAliases(e.aliases, name),
      response: normResponse(e.response),
      provider: ID,
      alsoOn: [],
      userLevel: levelOf(e.role_ids, roleNames),
    });
  }
  return out;
}

export const fossabot: ProviderAdapter = {
  id: ID,
  label: 'FB',
  hosts: ['fossabot.com'],
  corsOpen: true,
  enabled: true,
  fetchCommands(login: string, ctx: AdapterContext): Promise<ProviderResult> {
    return runChain(ID, ctx, async (http) => {
      const r1 = await http.get('https://fossabot.com/api/v2/cached/channels/by-slug/' + encodeURIComponent(login));
      if (r1.status === 404) return [];
      requireOk(r1);
      const id = parseChannel(r1.body);
      if (id === null) return [];
      const r2 = await http.get('https://fossabot.com/api/v2/cached/channels/' + encodeURIComponent(id) + '/commands');
      requireOk(r2);
      requireShape(Array.isArray(asRecord(r2.body)?.commands));
      return parseCommands(r2.body);
    });
  },
};
