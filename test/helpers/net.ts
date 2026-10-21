// An injectable fetch for the adapter and cache tests. It never touches the network: every call is
// answered by a handler the test writes, and every call is recorded.

import type { AdapterContext } from '../../src/providers/types';
import { loadFixture } from './fixtures';

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  init: RequestInit;
}

export type Reply =
  | { status: number; body?: unknown; text?: string }
  | { never: true; honourAbort?: boolean }       // a fetch that does not resolve (optionally rejects on abort)
  | { throws: string }                           // a network error
  | { after: number; reply: Reply }              // answers after N ms of (fake) time
  | { gated: Promise<void>; reply: Reply };      // answers once the gate promise resolves

export type Handler = (call: Call, index: number) => Reply;

function respond(status: number, text: string): Response {
  // Only status and text() are used by the adapters.
  return { status, ok: status >= 200 && status < 300, text: async () => text } as unknown as Response;
}

function resolveReply(reply: Reply, signal: AbortSignal | undefined): Promise<Response> {
  if ('status' in reply) {
    const text = reply.text !== undefined ? reply.text : reply.body !== undefined ? JSON.stringify(reply.body) : '';
    return Promise.resolve(respond(reply.status, text));
  }
  if ('throws' in reply) return Promise.reject(new TypeError(reply.throws));
  if ('never' in reply) {
    return new Promise<Response>((_, reject) => {
      if (reply.honourAbort && signal) {
        signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      }
    });
  }
  if ('after' in reply) {
    return new Promise<Response>((resolve, reject) => {
      setTimeout(() => resolveReply(reply.reply, signal).then(resolve, reject), reply.after);
    });
  }
  return reply.gated.then(() => resolveReply(reply.reply, signal));
}

export function createFetch(handler: Handler): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = (input: unknown, init?: RequestInit): Promise<Response> => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
      body: typeof init?.body === 'string' ? init.body : undefined,
      init: init ?? {},
    };
    calls.push(call);
    return resolveReply(handler(call, calls.length - 1), init?.signal ?? undefined);
  };
  return { fetch: fetchFn as unknown as typeof fetch, calls };
}

export const FIXED_NOW = 1_760_000_000_000;

export function makeCtx(f: { fetch: typeof fetch }, over: Partial<AdapterContext> = {}): AdapterContext {
  return { fetch: f.fetch, now: () => FIXED_NOW, timeoutMs: 2000, ...over };
}

// A reply carrying a recorded fixture body.
export function fx(provider: string, file: string, status = 200): Reply {
  return { status, body: loadFixture(provider, file) };
}

// Routes "METHOD url" to a reply (or a function of the call); an unrouted request is a network error
// whose message names it, so a test that sees an unexpected URL fails on the message.
export function routes(table: Record<string, Reply | ((call: Call) => Reply)>): Handler {
  return (call) => {
    const key = call.method + ' ' + call.url;
    const hit = table[key];
    if (hit === undefined) return { throws: 'unrouted ' + key };
    return typeof hit === 'function' ? hit(call) : hit;
  };
}

// Lets already-queued promise continuations run (used after advancing fake timers).
export async function flush(times = 30): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
