// Registry in priority order (docs/SPEC.md section 5.2) and fetchAll.
// For WizeBot, Streamlabs Cloudbot and PhantomBot no public per-channel endpoint was found, so they
// are not registered (docs/LEDGER.md round 0 -> 1). botrix is registered disabled.

import type { ProviderResult } from '../shared/types';
import { botrix } from './botrix';
import { fossabot } from './fossabot';
import { moobot } from './moobot';
import { nightbot } from './nightbot';
import { streamelements } from './streamelements';
import type { AdapterContext, ProviderAdapter } from './types';

export const ADAPTERS: ProviderAdapter[] = [nightbot, streamelements, fossabot, moobot, botrix];

function oneLine(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, ' ').trim().slice(0, 200) || 'unknown error';
}

// Runs every adapter once, concurrently; never throws. An adapter that rejects (adapters are written
// not to) becomes a status 'error' result. Results come back in registry order.
export async function fetchAll(login: string, ctx: AdapterContext): Promise<ProviderResult[]> {
  const settled = await Promise.allSettled(ADAPTERS.map((a) => a.fetchCommands(login, ctx)));
  return settled.map((s, i): ProviderResult => {
    if (s.status === 'fulfilled') return s.value;
    return {
      provider: ADAPTERS[i].id,
      status: 'error',
      commands: [],
      fetchedAt: ctx.now(),
      requests: 0,
      error: oneLine(s.reason),
    };
  });
}
