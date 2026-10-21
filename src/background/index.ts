// Background message handler (docs/SPEC.md section 4). Answers commands:get, commands:refresh and
// commands:status through the cache within 2.5 s: every adapter chain has its own 2000 ms deadline
// (AdapterContext.timeoutMs), and the answer itself is capped at ANSWER_BUDGET_MS. A fetch that
// outlives the cap keeps running and lands in the cache for the next request.

import { getCommands, peek, refreshThrottled } from '../cache/cache';
import type { AdapterContext } from '../providers/types';
import { onRequest } from '../shared/messages';
import type { Request, Response } from '../shared/messages';

const CHAIN_TIMEOUT_MS = 2000;
const ANSWER_BUDGET_MS = 2500;
const LOGIN_RE = /^[a-z0-9_]{1,25}$/;

function makeCtx(): AdapterContext {
  return { fetch: (input, init) => globalThis.fetch(input, init), now: () => Date.now(), timeoutMs: CHAIN_TIMEOUT_MS };
}

async function answer(req: Request, login: string): Promise<Response> {
  const ctx = makeCtx();
  switch (req.type) {
    case 'commands:get':
      return { ok: true, data: await getCommands(login, ctx) };
    case 'commands:refresh': {
      const r = await refreshThrottled(login, ctx);
      return { ok: true, data: r.data, refreshed: r.refreshed };
    }
    case 'commands:status':
      return { ok: true, data: await peek(login) };
  }
}

function handle(req: Request): Promise<Response> {
  const login = req.login.trim().toLowerCase();
  if (!LOGIN_RE.test(login)) return Promise.resolve({ ok: false, error: 'invalid login' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<Response>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), ANSWER_BUDGET_MS);
  });
  return Promise.race([answer(req, login), budget]).finally(() => clearTimeout(timer));
}

onRequest(handle);
