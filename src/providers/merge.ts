// mergeCommands (docs/SPEC.md section 5.3) plus the helpers every adapter shares: name and
// response normalisation (SPEC 3, 5.1) and the one-chain-one-deadline HTTP runner (SPEC 4, 5.1).
// The helpers live here because the part 2 ownership table lists no other shared file; the
// adapters import them from './merge'. This module imports only types, so it cannot form a cycle.

import type { Command, ProviderId, ProviderResult, ProviderStatus, UserLevel } from '../shared/types';
import type { AdapterContext } from './types';

// ---------------------------------------------------------------- merge (SPEC 5.3)

// Results arrive in registry order. Same name -> one command: the first keeps `provider`, gains the
// union of aliases (minus its own name) and lists every later provider in `alsoOn`; an alias that is
// another command's name is dropped. Output sorted by name in code-unit order.
export function mergeCommands(results: ProviderResult[]): Command[] {
  const byName = new Map<string, Command>();
  for (const r of results) {
    for (const c of r.commands) {
      const hit = byName.get(c.name);
      if (!hit) {
        byName.set(c.name, { ...c, aliases: [...c.aliases], alsoOn: [...c.alsoOn] });
        continue;
      }
      for (const a of c.aliases) if (!hit.aliases.includes(a)) hit.aliases.push(a);
      if (c.provider !== hit.provider && !hit.alsoOn.includes(c.provider)) hit.alsoOn.push(c.provider);
    }
  }
  const out = [...byName.values()];
  for (const c of out) {
    c.aliases = [...new Set(c.aliases)].filter((a) => !byName.has(a));
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// ---------------------------------------------------------------- normalisation (SPEC 3, 5.1)

const USER_LEVELS: readonly string[] = ['everyone', 'subscriber', 'regular', 'vip', 'moderator', 'owner', 'unknown'];

export function isUserLevel(v: unknown): v is UserLevel {
  return typeof v === 'string' && USER_LEVELS.includes(v);
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// trim, strip ONE leading "!", lowercase; null when empty or when whitespace remains inside.
export function normName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (s.startsWith('!')) s = s.slice(1);
  if (s === '' || /\s/.test(s)) return null;
  return s.toLowerCase();
}

// Accepts one string or an array of strings; deduped, never contains `name`.
export function normAliases(raw: unknown, name: string): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const out: string[] = [];
  for (const item of list) {
    const a = normName(item);
    if (a !== null && a !== name && !out.includes(a)) out.push(a);
  }
  return out;
}

export const MAX_RESPONSE = 300;

// Single line, whitespace runs collapsed, trimmed, clipped to MAX_RESPONSE without splitting a pair.
export function normResponse(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/[\x00-\x1f\x7f\s]+/g, ' ').trim();
  if (s.length > MAX_RESPONSE) {
    s = s.slice(0, MAX_RESPONSE);
    const last = s.charCodeAt(s.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1);
    s = s.trimEnd();
  }
  return s;
}

// ---------------------------------------------------------------- HTTP runner (SPEC 4, 5.1)

export class AdapterError extends Error {}

export interface HttpReply {
  status: number;
  body: unknown; // parsed JSON; undefined when a non-2xx body is not JSON
}

export interface Http {
  get(url: string, headers?: Record<string, string>): Promise<HttpReply>;
  post(url: string, body: string, headers?: Record<string, string>): Promise<HttpReply>;
}

export function requireOk(reply: HttpReply): void {
  if (reply.status < 200 || reply.status >= 300) throw new AdapterError('HTTP ' + reply.status);
}

export function requireShape(ok: boolean): void {
  if (!ok) throw new AdapterError('unexpected response shape');
}

function oneLine(msg: string): string {
  return msg.replace(/\s+/g, ' ').trim().slice(0, 200) || 'unknown error';
}

// Runs one provider chain under ONE AbortController and ONE deadline (ctx.timeoutMs) for the whole
// chain. The chain returns the normalised commands (an empty array means 'empty': unknown login or
// no commands). At the deadline the requests are aborted and the result is status 'error', error
// 'timeout'; the race settles once, so a late chain result is discarded.
export async function runChain(
  provider: ProviderId,
  ctx: AdapterContext,
  chain: (http: Http) => Promise<Command[]>,
): Promise<ProviderResult> {
  const controller = new AbortController();
  let requests = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AdapterError('timeout'));
      controller.abort();
    }, ctx.timeoutMs);
  });

  const send = async (url: string, init: RequestInit): Promise<HttpReply> => {
    if (controller.signal.aborted) throw new AdapterError('timeout');
    requests += 1;
    const res = await ctx.fetch(url, { ...init, signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    const text = await res.text();
    const ok = res.status >= 200 && res.status < 300;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      if (ok) throw new AdapterError('invalid JSON');
      body = undefined;
    }
    return { status: res.status, body };
  };
  const http: Http = {
    get: (url, headers) => send(url, { method: 'GET', headers }),
    post: (url, body, headers) => send(url, { method: 'POST', headers, body }),
  };

  const done = (status: ProviderStatus, commands: Command[], error?: string): ProviderResult => {
    const r: ProviderResult = { provider, status, commands, fetchedAt: ctx.now(), requests };
    if (error !== undefined) r.error = error;
    return r;
  };

  try {
    const commands = await Promise.race([chain(http), deadline]);
    return commands.length ? done('ok', commands) : done('empty', []);
  } catch (e) {
    const msg = controller.signal.aborted
      ? 'timeout'
      : e instanceof AdapterError
        ? e.message
        : 'network error: ' + (e instanceof Error ? e.message : String(e));
    return done('error', [], oneLine(msg));
  } finally {
    clearTimeout(timer);
  }
}
