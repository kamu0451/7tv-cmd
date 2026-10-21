// Console helpers. Every line from this extension is prefixed "[7tv-cmd]".
// SPEC 1.9: never console.error; expected failures are warn at most.

const PREFIX = '[7tv-cmd]';

export function warn(msg: string, ...rest: unknown[]): void {
  console.warn(`${PREFIX} ${msg}`, ...rest);
}

export function debug(msg: string, ...rest: unknown[]): void {
  console.debug(`${PREFIX} ${msg}`, ...rest);
}
