// Scaffold-owned interface (docs/SPEC.md section 6.2), frozen for the round.

export type InputKind = 'native' | 'seventv';

export interface ChatInput {
  kind: InputKind;
  root: HTMLElement;      // the element that receives key events (contenteditable)
  anchor: HTMLElement;    // the visible input box the popup is positioned against
  getText(): string;      // the current draft as plain text (emotes as their text); U+FEFF zero-width characters Slate renders are removed; getCaret() returns an offset in that cleaned text (recorded: docs/recordings/ref-7tv-colon-dark/dom.json, probes 'Backspace past trigger' inputAfter)
  getCaret(): number;     // caret offset within getText(), -1 when unknown or the selection is not collapsed
  replaceRange(start: number, end: number, text: string): boolean; // replaces [start,end) of the draft, puts the caret after the new text; false when impossible
  on(event: 'input' | 'keydown' | 'blur', cb: (e: Event) => void): () => void; // keydown is delivered from ONE listener added with { capture: true } on window at content-script start, filtered to events whose composedPath() contains root; it runs before any page listener registered on document, the React root or 7TV's containers
  dispose(): void;
}
