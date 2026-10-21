// StreamElements adapter. Chain as recorded in docs/providers/streamelements.md (steps 1 and 2 only;
// /default and /loyalty are page-only calls we do not make):
//   1. GET https://api.streamelements.com/kappa/v2/channels/<login>        -> $._id
//   2. GET https://api.streamelements.com/kappa/v2/bot/commands/<id>       -> bare array
// corsOpen: Access-Control-Allow-Origin: * on every response (recorded).

import type { Command, ProviderResult, UserLevel } from '../shared/types';
import { asRecord, normAliases, normName, normResponse, requireOk, requireShape, runChain } from './merge';
import type { AdapterContext, ProviderAdapter } from './types';

const ID = 'streamelements';

// Login lookup body -> StreamElements' channel id; null for the recorded 404 body.
export function parseChannel(raw: unknown): string | null {
  const id = asRecord(raw)?._id;
  return typeof id === 'string' && id !== '' ? id : null;
}

function levelOf(accessLevel: unknown): UserLevel | undefined {
  if (typeof accessLevel !== 'number') return undefined;
  if (accessLevel === 100) return 'everyone';
  if (accessLevel === 500) return 'moderator';
  return 'unknown';
}

function cooldownOf(raw: unknown): number | undefined {
  const c = asRecord(raw);
  if (!c) return undefined;
  const vals = [c.user, c.global].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return vals.length ? Math.max(...vals) : undefined;
}

// Bare array. Disabled commands ARE returned (docs: 16/176 on coconutb), so keep only
// enabled === true && hidden !== true. Fields: command (no "!"), aliases[], reply, cooldown, accessLevel.
export function parseCommands(raw: unknown): Command[] {
  if (!Array.isArray(raw)) return [];
  const out: Command[] = [];
  for (const item of raw) {
    const e = asRecord(item);
    if (!e || e.enabled !== true || e.hidden === true) continue;
    const name = normName(e.command);
    if (name === null) continue;
    const cmd: Command = {
      name,
      aliases: normAliases(e.aliases, name),
      response: normResponse(e.reply),
      provider: ID,
      alsoOn: [],
    };
    const cd = cooldownOf(e.cooldown);
    if (cd !== undefined) cmd.cooldownSec = cd;
    const level = levelOf(e.accessLevel);
    if (level !== undefined) cmd.userLevel = level;
    out.push(cmd);
  }
  return out;
}

export const streamelements: ProviderAdapter = {
  id: ID,
  label: 'SE',
  hosts: ['api.streamelements.com'],
  corsOpen: true,
  enabled: true,
  fetchCommands(login: string, ctx: AdapterContext): Promise<ProviderResult> {
    return runChain(ID, ctx, async (http) => {
      const r1 = await http.get('https://api.streamelements.com/kappa/v2/channels/' + encodeURIComponent(login));
      if (r1.status === 404) return [];
      requireOk(r1);
      const id = parseChannel(r1.body);
      if (id === null) return [];
      const r2 = await http.get('https://api.streamelements.com/kappa/v2/bot/commands/' + encodeURIComponent(id));
      requireOk(r2);
      requireShape(Array.isArray(r2.body));
      return parseCommands(r2.body);
    });
  },
};
