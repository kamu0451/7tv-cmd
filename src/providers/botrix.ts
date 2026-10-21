// Botrix adapter, registered DISABLED (docs/LEDGER.md round 0 -> 1): no populated response was ever
// observed in 14 channels, its API path is under robots.txt Disallow and it sends no CORS header
// (docs/providers/botrix.md). fetchCommands performs no request and resolves status 'unsupported'.

import type { Command, ProviderResult } from '../shared/types';
import type { AdapterContext, ProviderAdapter } from './types';

const ID = 'botrix';

// Botrix has no lookup step: the login goes straight into the commands URL.
export function parseChannel(_raw: unknown): string | null {
  return null;
}

// No populated response was ever observed, so there is no recorded shape to parse.
export function parseCommands(_raw: unknown): Command[] {
  return [];
}

export const botrix: ProviderAdapter = {
  id: ID,
  label: 'BX',
  hosts: ['botrix.live'],
  corsOpen: false,
  enabled: false,
  fetchCommands(_login: string, ctx: AdapterContext): Promise<ProviderResult> {
    return Promise.resolve({ provider: ID, status: 'unsupported', commands: [], fetchedAt: ctx.now(), requests: 0 });
  },
};
