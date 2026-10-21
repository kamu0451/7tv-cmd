// Messaging contract between the content script / action page and the background script
// (docs/SPEC.md section 4). Request and Response are frozen for the round.
//
// sendRequest and onRequest hide the Firefox / Chrome difference:
//   Firefox: `browser.runtime` is promise based, an onMessage listener answers by RETURNING a Promise.
//   Chrome:  `chrome.runtime` is callback based, an onMessage listener answers through sendResponse
//            and must return true to keep the channel open (Chrome does not accept a returned Promise).
// The two runtimes are reached through a minimal local interface so the @types/chrome and
// @types/firefox-webext-browser typings never have to agree.

import type { ChannelCommands } from './types';

export type Request =
  | { type: 'commands:get'; login: string }      // cache first; fetches when stale or missing
  | { type: 'commands:refresh'; login: string }  // bypasses TTL; throttled 1/login/60 s (returns the cached value with ok:true and refreshed:false when throttled)
  | { type: 'commands:status'; login: string };  // cache only, never fetches; data.providers may be []

export type Response =
  | { ok: true; data: ChannelCommands; refreshed?: boolean }
  | { ok: false; error: string };

interface RuntimeLike {
  sendMessage(message: unknown, callback?: (response: unknown) => void): unknown;
  onMessage: {
    addListener(
      listener: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown,
    ): void;
  };
  lastError?: { message?: string } | null;
}

interface Globals {
  browser?: { runtime?: RuntimeLike };
  chrome?: { runtime?: RuntimeLike };
}

const REQUEST_TYPES = ['commands:get', 'commands:refresh', 'commands:status'];

export function isRequest(value: unknown): value is Request {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { type?: unknown; login?: unknown };
  return typeof v.type === 'string' && REQUEST_TYPES.includes(v.type) && typeof v.login === 'string';
}

function isResponse(value: unknown): value is Response {
  return typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean';
}

function runtimes(): { promiseRuntime: RuntimeLike | undefined; callbackRuntime: RuntimeLike | undefined } {
  const g = globalThis as unknown as Globals;
  return { promiseRuntime: g.browser?.runtime, callbackRuntime: g.chrome?.runtime };
}

// Rejects only on messaging failure (no runtime, extension context gone, no answer).
export function sendRequest(req: Request): Promise<Response> {
  const { promiseRuntime, callbackRuntime } = runtimes();
  if (promiseRuntime) {
    return new Promise<unknown>((resolve) => resolve(promiseRuntime.sendMessage(req))).then(checkResponse);
  }
  if (callbackRuntime) {
    return new Promise<Response>((resolve, reject) => {
      callbackRuntime.sendMessage(req, (resp) => {
        const err = callbackRuntime.lastError;
        if (err) reject(new Error(err.message ?? 'runtime error'));
        else resolve(checkResponse(resp));
      });
    });
  }
  return Promise.reject(new Error('no extension runtime'));
}

function checkResponse(resp: unknown): Response {
  if (!isResponse(resp)) throw new Error('no response from background');
  return resp;
}

// Registers the single request handler. Messages that are not a Request are ignored (left for
// other listeners). The handler may reject: the caller then gets { ok: false, error }.
export function onRequest(handler: (req: Request) => Promise<Response>): void {
  const { promiseRuntime, callbackRuntime } = runtimes();
  const runtime = promiseRuntime ?? callbackRuntime;
  if (!runtime) return;
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRequest(message)) return undefined;
    const answer: Promise<Response> = Promise.resolve()
      .then(() => handler(message))
      .catch((e: unknown): Response => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    if (promiseRuntime) return answer; // Firefox: the returned Promise is the response
    void answer.then(sendResponse);
    return true; // Chrome: keep the channel open for the async sendResponse
  });
}
