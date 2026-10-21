// Keyboard and mouse contract (SPEC 1.3, 1.4, 6.4, 6.5, 7.2, 10) on the local fixture page:
// a real slate-react editor, native and 7TV-wrapped, dark and light theme. No network.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  launchFixture, popupState, domText, draft, events, clearInput, expectedRows, fixtureCommands,
  POPOUT, EDITOR,
} from './harness';

const KINDS = ['native', 'seventv'] as const;
const THEMES = ['dark', 'light'] as const;

for (const kind of KINDS) {
  for (const theme of THEMES) {
    test.describe(`fixture ${kind} ${theme}`, () => {
      test.describe.configure({ mode: 'serial' });
      let ctx: BrowserContext;
      let page: Page;

      test.beforeAll(async () => {
        ctx = await launchFixture(`kb-${kind}-${theme}`);
        page = ctx.pages()[0] || (await ctx.newPage());
        await page.goto(`${POPOUT}?mode=${kind}&theme=${theme}`);
        await page.locator(EDITOR).waitFor({ state: 'visible' });
        if (kind === 'seventv') {
          await expect(page.locator('seventv-container.seventv-chat-input-textarea ' + EDITOR)).toHaveCount(1);
        }
        await expect(page.locator('html')).toHaveClass(new RegExp('tw-root--theme-' + theme));
        // the content script asks for commands once the input is detected
        await expect.poll(async () => (await events(page)).some((e) => e.event === 'fetch' && (e.count as number) > 0), { timeout: 15000 }).toBe(true);
      });

      test.afterAll(async () => {
        await ctx?.close();
      });

      test.beforeEach(async () => {
        await clearInput(page);
        await expect.poll(() => draft(page)).toBe('');
      });

      const typeIn = (s: string) => page.keyboard.type(s, { delay: 20 });
      const waitOpen = (open: boolean) => expect.poll(async () => (await popupState(page)).open).toBe(open);

      test('"!" opens with the full list, first row selected, within 100 ms', async () => {
        const before = (await events(page)).length;
        await typeIn('!');
        await waitOpen(true);
        const st = await popupState(page);
        const want = expectedRows('');
        expect(want.length).toBe(Math.min(1000, fixtureCommands().length)); // SPEC 8 limit (round 2: 1000)
        expect(st.rows).toEqual(want);
        expect(st.sel).toBe(0);
        const open = (await events(page)).slice(before).find((e) => e.event === 'open');
        expect(open, 'tvcmd open event').toBeTruthy();
        const lat = (open!.t as number) - (open!.keyT as number);
        test.info().annotations.push({ type: 'openLatencyMs', description: lat.toFixed(1) });
        console.log(`openLatencyMs ${kind} ${theme} ${lat.toFixed(1)}`);
        expect(lat).toBeLessThan(100);
      });

      test('"!b" narrows to prefix-then-substring order', async () => {
        await typeIn('!b');
        await expect.poll(async () => (await popupState(page)).rows).toEqual(expectedRows('b'));
        const rows = (await popupState(page)).rows.map((r) => r.slice(1));
        expect(rows.length).toBeGreaterThan(1);
        for (const r of rows) expect(r).toContain('b');
        const firstSub = rows.findIndex((r) => !r.startsWith('b'));
        if (firstSub >= 0) for (const r of rows.slice(firstSub)) expect(r.startsWith('b')).toBe(false);
      });

      test('ArrowDown x2, ArrowUp x1 move the selection and it wraps at both ends', async () => {
        await typeIn('!b');
        await waitOpen(true);
        const n = (await popupState(page)).rows.length;
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowUp');
        await expect.poll(async () => (await popupState(page)).sel).toBe(1);
        const st = await popupState(page);
        expect(st.rows[st.sel]).toBe(expectedRows('b')[1]);
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowUp');
        await expect.poll(async () => (await popupState(page)).sel).toBe(n - 1);
        await page.keyboard.press('ArrowDown');
        await expect.poll(async () => (await popupState(page)).sel).toBe(0);
        expect(await domText(page)).toBe('!b');
      });

      for (const key of ['Tab', 'Shift+Tab', 'Enter']) {
        test(`${key} inserts "!<name> ", closes, and the Slate draft equals the DOM`, async () => {
          await typeIn('!b');
          await waitOpen(true);
          await page.keyboard.press('ArrowDown');
          await expect.poll(async () => (await popupState(page)).sel).toBe(1);
          const st = await popupState(page);
          const alias = st.aliases[1];
          const name = alias ? alias.replace(/^->\s*/, '') : st.rows[1];
          await page.keyboard.press(key);
          const want = name + ' ';
          await expect.poll(() => domText(page)).toBe(want);
          await waitOpen(false);
          expect(await draft(page)).toBe(want);
          const sent = await page.evaluate(() => (window as unknown as { __fixture: { sent: string[] } }).__fixture.sent.length);
          expect(sent, 'no message sent').toBe(0);
          // survive a re-render: one more character, then Backspace
          await typeIn('x');
          await expect.poll(() => draft(page)).toBe(want + 'x');
          await page.keyboard.press('Backspace');
          await expect.poll(() => draft(page)).toBe(want);
          expect(await domText(page)).toBe(want);
        });
      }

      test('Escape closes and leaves "!b" in place', async () => {
        await typeIn('!b');
        await waitOpen(true);
        await page.keyboard.press('Escape');
        await waitOpen(false);
        expect(await domText(page)).toBe('!b');
        expect(await draft(page)).toBe('!b');
        expect(await page.evaluate((s) => document.activeElement === document.querySelector(s), EDITOR)).toBe(true);
      });

      test('Space closes and the space is typed', async () => {
        await typeIn('!b');
        await waitOpen(true);
        await page.keyboard.press('Space');
        await waitOpen(false);
        expect(await draft(page)).toBe('!b ');
      });

      test('Backspace past the "!" closes', async () => {
        await typeIn('!b');
        await waitOpen(true);
        await page.keyboard.press('Backspace');
        await waitOpen(true);
        await page.keyboard.press('Backspace');
        await waitOpen(false);
        expect(await draft(page)).toBe('');
      });

      test('"!" mid-word does not open', async () => {
        await typeIn('abc!');
        await page.waitForTimeout(300);
        expect((await popupState(page)).open).toBe(false);
      });

      test('zero matches hides the popup', async () => {
        await typeIn('!b');
        await waitOpen(true);
        await typeIn('qqzzxx');
        await waitOpen(false);
      });

      for (const ch of [':', '/', '@']) {
        test(`"${ch}" never opens ours`, async () => {
          const before = (await events(page)).length;
          await typeIn(ch + 'b');
          await page.waitForTimeout(300);
          expect((await popupState(page)).open).toBe(false);
          expect((await events(page)).slice(before).filter((e) => e.event === 'open')).toEqual([]);
        });
      }

      test('row mousedown keeps focus, click inserts', async () => {
        await typeIn('!b');
        await waitOpen(true);
        const st = await popupState(page);
        const name = st.aliases[2] ? st.aliases[2].replace(/^->\s*/, '') : st.rows[2];
        const row = page.locator('#tvcmd-popup-host [role="option"]').nth(2);
        const box = (await row.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        expect(await page.evaluate((s) => document.activeElement === document.querySelector(s), EDITOR)).toBe(true);
        await page.mouse.up();
        await expect.poll(() => draft(page)).toBe(name + ' ');
        expect(await domText(page)).toBe(name + ' ');
        await waitOpen(false);
      });

      test('with the popup closed, Enter/Tab/ArrowDown keydowns are not defaultPrevented', async () => {
        await typeIn('hello');
        const res = await page.evaluate((s) => {
          const ed = document.querySelector(s) as HTMLElement;
          const out: Record<string, boolean> = {};
          let seen = false;
          let prevented = false;
          // window-capture listeners (ours) run before this document-capture one
          const probe = (e: Event) => { seen = true; prevented = e.defaultPrevented; };
          document.addEventListener('keydown', probe, true);
          for (const key of ['Enter', 'Tab', 'ArrowDown']) {
            seen = false;
            prevented = false;
            ed.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true }));
            out[key] = seen && !prevented;
          }
          document.removeEventListener('keydown', probe, true);
          return out;
        }, EDITOR);
        expect(res).toEqual({ Enter: true, Tab: true, ArrowDown: true });
      });
    });
  }
}
