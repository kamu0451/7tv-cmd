// activeToken and isTrigger (docs/SPEC.md section 6.5).

export interface Token { start: number; end: number; text: string } // text includes the "!"

const SPACE = /\s/;

// The whitespace-delimited token containing the caret (caret at end counts); null when caret < 0.
// A caret right after whitespace yields the empty token at the caret.
export function activeToken(text: string, caret: number): Token | null {
  if (caret < 0 || caret > text.length) return null;
  let start = caret;
  while (start > 0 && !SPACE.test(text[start - 1])) start--;
  let end = caret;
  while (end < text.length && !SPACE.test(text[end])) end++;
  return { start, end, text: text.slice(start, end) };
}

// Token starts with "!", has no second "!", and start === 0 or /\s/.test(text[start - 1]).
export function isTrigger(token: Token | null, text: string): boolean {
  if (!token || !token.text.startsWith('!')) return false;
  if (token.text.indexOf('!', 1) !== -1) return false;
  return token.start === 0 || SPACE.test(text[token.start - 1]);
}
