// filterCommands (docs/SPEC.md section 8). Pure and deterministic: same input -> same output.
//
// q = query.trim().toLowerCase(). Candidates per command: [name, ...aliases] (duplicates once).
// Kind: exact (candidate === q) < prefix (startsWith) < substring (includes).
// Best candidate per command: kind, then name before alias, then shorter, then code-unit order.
// Result sort: kind, then name-match before alias-match, then shorter matched text, then name
// in code-unit order (never localeCompare). Empty q: every command, kind 'prefix', range [0, 0],
// in name order.

import type { Command, MatchKind, Suggestion } from '../shared/types';

const KIND_RANK: Record<MatchKind, number> = { exact: 0, prefix: 1, substring: 2 };

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSuggestions(a: Suggestion, b: Suggestion): number {
  const k = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (k !== 0) return k;
  if (a.viaAlias !== b.viaAlias) return a.viaAlias ? 1 : -1;
  const l = a.matched.length - b.matched.length;
  if (l !== 0) return l;
  const n = cmpStr(a.command.name, b.command.name);
  if (n !== 0) return n;
  // Same name twice (should not happen after the merge): fall back to provider for determinism.
  return cmpStr(a.command.provider, b.command.provider);
}

function classify(candidate: string, q: string): MatchKind | null {
  if (candidate === q) return 'exact';
  if (candidate.startsWith(q)) return 'prefix';
  if (candidate.includes(q)) return 'substring';
  return null;
}

export function filterCommands(commands: Command[], query: string, limit = 1000): Suggestion[] {
  const q = query.trim().toLowerCase();
  const max = limit > 0 ? limit : 0;
  const out: Suggestion[] = [];

  if (q === '') {
    for (const command of commands) {
      out.push({ command, matched: command.name, viaAlias: false, kind: 'prefix', range: [0, 0] });
    }
    out.sort((a, b) => cmpStr(a.command.name, b.command.name) || cmpStr(a.command.provider, b.command.provider));
    if (out.length > max) out.length = max;
    return out;
  }

  for (const command of commands) {
    let best: Suggestion | null = null;
    const count = command.aliases.length + 1;
    for (let i = 0; i < count; i++) {
      const candidate = i === 0 ? command.name : command.aliases[i - 1];
      if (i > 0 && (candidate === command.name || command.aliases.indexOf(candidate) < i - 1)) continue; // compare duplicates once
      const kind = classify(candidate, q);
      if (kind === null) continue;
      const viaAlias = i > 0;
      if (best !== null) {
        const k = KIND_RANK[kind] - KIND_RANK[best.kind];
        if (k > 0) continue;
        if (k === 0) {
          if (viaAlias && !best.viaAlias) continue;
          if (viaAlias === best.viaAlias) {
            const l = candidate.length - best.matched.length;
            if (l > 0) continue;
            if (l === 0 && cmpStr(candidate, best.matched) >= 0) continue;
          }
        }
      }
      const start = kind === 'substring' ? candidate.indexOf(q) : 0;
      best = { command, matched: candidate, viaAlias, kind, range: [start, start + q.length] };
    }
    if (best !== null) out.push(best);
  }

  out.sort(compareSuggestions);
  if (out.length > max) out.length = max;
  return out;
}
