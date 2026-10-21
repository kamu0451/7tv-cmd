// Nightbot adapter. Endpoint chain exactly as recorded in docs/providers/nightbot.md:
//   1. GET https://api.nightbot.tv/1/channels/twitch/<login>            -> $.channel._id
//   2. GET https://api.nightbot.tv/1/commands  (header Nightbot-Channel: <id>) -> $.commands
// corsOpen: api.nightbot.tv reflects the request Origin and the preflight allows Nightbot-Channel
// (docs/providers/nightbot.md "CORS detail"; SPEC 5.2 records chrome-extension:// as checked).

import type { Command, ProviderResult } from '../shared/types';
import { asRecord, isUserLevel, normAliases, normName, normResponse, requireOk, requireShape, runChain } from './merge';
import type { AdapterContext, ProviderAdapter } from './types';

const ID = 'nightbot';

// Login lookup body -> Nightbot's channel id; null for the recorded 404 body {"message":"user not found"}.
export function parseChannel(raw: unknown): string | null {
  const channel = asRecord(asRecord(raw)?.channel);
  const id = channel?._id;
  return typeof id === 'string' && id !== '' ? id : null;
}

// $.commands[]: name (usually with "!"), alias (one string, "" when none), message, coolDown, userLevel.
// No enabled flag exists, so every command is kept.
export function parseCommands(raw: unknown): Command[] {
  const list = asRecord(raw)?.commands;
  if (!Array.isArray(list)) return [];
  const out: Command[] = [];
  for (const item of list) {
    const e = asRecord(item);
    if (!e) continue;
    const name = normName(e.name);
    if (name === null) continue;
    const cmd: Command = {
      name,
      aliases: normAliases(e.alias, name),
      response: normResponse(e.message),
      provider: ID,
      alsoOn: [],
      userLevel: isUserLevel(e.userLevel) ? e.userLevel : 'unknown',
    };
    const cd = e.coolDown;
    if (typeof cd === 'number' && Number.isFinite(cd) && cd >= 0) cmd.cooldownSec = cd;
    out.push(cmd);
  }
  return out;
}

export const nightbot: ProviderAdapter = {
  id: ID,
  label: 'NB',
  hosts: ['api.nightbot.tv'],
  corsOpen: true,
  enabled: true,
  fetchCommands(login: string, ctx: AdapterContext): Promise<ProviderResult> {
    return runChain(ID, ctx, async (http) => {
      const r1 = await http.get('https://api.nightbot.tv/1/channels/twitch/' + encodeURIComponent(login));
      if (r1.status === 404) return [];
      requireOk(r1);
      const id = parseChannel(r1.body);
      if (id === null) return [];
      const r2 = await http.get('https://api.nightbot.tv/1/commands', { 'Nightbot-Channel': id });
      requireOk(r2);
      requireShape(Array.isArray(asRecord(r2.body)?.commands));
      return parseCommands(r2.body);
    });
  },
};
