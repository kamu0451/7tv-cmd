// Fixture chat page for the browser tests (SPEC section 2, TEST HARNESS row).
// A real slate-react editor with Twitch's chat-input attributes. Native mode nests it the way
// Twitch does (div.chat-input > div.chat-input__textarea > div.chat-wysiwyg-input-box > editor);
// ?mode=seventv puts the input box inside
// seventv-container.seventv-chat-input-container > seventv-container.seventv-chat-input-textarea
// (docs/reference-7tv-popup.md, "How 7TV hooks the chat input"). ?theme=dark|light.
// The page exposes window.__fixture = { draft(), editor, mode, theme }: draft() is the Slate
// value as plain text, i.e. the message that would be sent (blocks joined by "\n").
// Enter without our popup "sends": the draft is pushed to window.__fixture.sent and cleared.
import { createElement, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createEditor, Descendant, Editor, Node, Transforms } from 'slate';
import { Editable, Slate, withReact } from 'slate-react';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'seventv' ? 'seventv' : 'native';
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.classList.remove('tw-root--theme-dark', 'tw-root--theme-light');
document.documentElement.classList.add('tw-root--theme-' + theme);

function el(tag: string, cls: string, parent: Element): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

const room = document.getElementById('chat-room') as HTMLElement;
let host: Element = room;
if (mode === 'seventv') {
  host = el('seventv-container', 'seventv-chat-input-container', host);
  host = el('seventv-container', 'seventv-chat-input-textarea', host);
}
const chatInput = el('div', 'chat-input', host);
const textarea = el('div', 'chat-input__textarea', chatInput);
const box = el('div', 'chat-wysiwyg-input-box', textarea);
const mount = el('div', 'chat-wysiwyg-input__editor-wrapper', box);

interface FixtureApi {
  mode: string;
  theme: string;
  editor: Editor | null;
  sent: string[];
  draft(): string;
}

const api: FixtureApi = {
  mode,
  theme,
  editor: null,
  sent: [],
  draft() {
    const ed = api.editor;
    if (!ed) return '';
    return ed.children.map((n) => Node.string(n)).join('\n');
  },
};
(window as unknown as { __fixture: FixtureApi }).__fixture = api;

const initial: Descendant[] = [{ type: 'paragraph', children: [{ text: '' }] } as unknown as Descendant];

function ChatEditor() {
  const editor = useMemo(() => withReact(createEditor()), []);
  api.editor = editor;
  return createElement(
    Slate,
    { editor, initialValue: initial },
    createElement(Editable, {
      className: 'chat-wysiwyg-input__editor chat-input',
      'data-a-target': 'chat-input',
      'data-test-selector': 'chat-input',
      'aria-label': 'Send a message',
      role: 'textbox',
      onKeyDown: (e: { key: string; shiftKey: boolean; defaultPrevented: boolean; preventDefault(): void }) => {
        // Twitch sends on Enter. Our extension prevents the keydown while its popup is open, so
        // a "sent" entry here means Enter leaked through.
        if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) {
          e.preventDefault();
          api.sent.push(api.draft());
          Transforms.select(editor, Editor.start(editor, []));
          Transforms.delete(editor, { at: { anchor: Editor.start(editor, []), focus: Editor.end(editor, []) } });
        }
      },
    } as Record<string, unknown>),
  );
}

createRoot(mount).render(createElement(ChatEditor));
