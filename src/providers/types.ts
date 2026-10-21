// Scaffold-owned interfaces (docs/SPEC.md section 5.1), frozen for the round. Part 2 builds the
// adapters against these and does not change them.

import type { ProviderId, ProviderResult } from '../shared/types';

export interface AdapterContext {
  fetch: typeof fetch;    // injectable for tests
  now: () => number;
  timeoutMs: number;      // deadline for the WHOLE chain, default 2000; one AbortController per fetchCommands call
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;          // 2-3 ASCII chars for the popup badge: NB, SE, FB, MB, WB, CB, BX, ...
  hosts: string[];        // API hosts this adapter fetches, bare host names such as 'moo.bot' (feeds the manifest and the request-budget test)
  corsOpen: boolean;      // true when every endpoint (including the preflight for custom headers) admits the extension origin: ACAO * or a reflected Origin, as recorded in docs/providers/<id>.md; false means a host_permission is required
  enabled: boolean;       // false: never fetched, fetchCommands resolves status 'unsupported' without a request
  fetchCommands(login: string, ctx: AdapterContext): Promise<ProviderResult>;
}
