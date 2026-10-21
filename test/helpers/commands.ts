import type { Command } from '../../src/shared/types';

// A Command with sensible defaults; override any field.
export function cmd(name: string, over: Partial<Command> = {}): Command {
  return { name, aliases: [], response: '', provider: 'nightbot', alsoOn: [], ...over };
}

// Deep-freezes a value so any mutation attempt throws in strict mode (ES modules are strict).
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
