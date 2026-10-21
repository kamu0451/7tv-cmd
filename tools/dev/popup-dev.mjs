// Part 4 dev check: bundles the popup + matcher with esbuild, loads tools/dev/popup-dev.html in
// Playwright Chromium (no extension, no network), drives the popup in dark and light themes,
// screenshots each state to docs/critics/r2/p4-<theme>-NN-<state>.png at 1280x800, measures
// open/update time for 100 items, and samples the reference frames' selected-bar colours.
// Usage: node tools/dev/popup-dev.mjs   (prints one JSON object; exit 1 on a failed assertion)

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'tools', 'dev', 'out');
const shotDir = join(root, 'docs', 'critics', 'r2'); // round 2: keeps the r1 evidence untouched
mkdirSync(outDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });

await build({
  stdin: {
    contents:
      "import { createPopup, providerBadge } from './src/content/popup/popup';\n" +
      "import { filterCommands } from './src/match/match';\n" +
      'window.__tvcmdDev = { createPopup, filterCommands, providerBadge };\n',
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  charset: 'ascii',
  outfile: join(outDir, 'popup-dev.js'),
  logLevel: 'warning',
});

// 120 fake commands, deterministic. Several start with or contain "b" / "ba".
const WORDS = ['discord', 'socials', 'uptime', 'followage', 'lurk', 'hug', 'so', 'clip', 'specs', 'sens',
  'rank', 'song', 'playlist', 'schedule', 'youtube', 'tiktok', 'twitter', 'merch', 'donate', 'prime',
  'ban', 'banana', 'bald', 'backseat', 'bark', 'bot', 'bet', 'bits', 'bonk', 'brb', 'build', 'bug',
  'cabal', 'kebab', 'bye', 'boss', 'blind', 'bday', 'bless', 'bean'];
const PROVIDERS = ['nightbot', 'streamelements', 'fossabot', 'moobot'];
const commands = [];
for (let i = 0; i < 120; i++) {
  // The 80 extra names avoid "b" so "!ba" yields a short list (wrap is visible within 9 moves).
  const plain = WORDS.filter((x) => !x.includes('b'));
  const name = i < WORDS.length ? WORDS[i] : plain[i % plain.length] + String(Math.floor(i / plain.length) + 1);
  const aliases = i === 3 ? ['fa'] : i === 7 ? ['bacon', 'clips'] : i === 12 ? ['bangers'] : [];
  const response = i % 5 === 4 ? '' : (i % 3 === 0
    ? 'Join the community at discord.gg/example - be nice, read the rules in #welcome before posting, links are auto-removed and repeat offenders get a timeout from the mods ' + name
    : '$(user) -> ' + name + ' response text number ' + i);
  commands.push({ name, aliases, response, provider: PROVIDERS[i % 4], alsoOn: [] });
}

const browser = await chromium.launch({ headless: true });
const result = { shots: [], picked: {}, wrap: {}, perf: {}, refSamples: {}, asserts: [] };
const fail = (m) => { result.asserts.push('FAIL ' + m); };

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = pathToFileURL(join(root, 'tools', 'dev', 'popup-dev.html')).href + (theme === 'light' ? '?theme=light' : '');
  await page.goto(url);
  await page.evaluate((cmds) => {
    const d = window.__tvcmdDev;
    window.__cmds = cmds;
    window.__picked = null;
    window.__closed = 0;
    const anchor = document.getElementById('anchor');
    const editor = document.getElementById('editor');
    window.__popup = d.createPopup({
      maxRows: 13, // docs/recordings/ref-7tv-colon-dark/dom.json popupWithFilter.visibleRowCount
      getEditorRect: () => editor.getBoundingClientRect(),
      onPick: (s) => { window.__picked = s.command.name; },
      onClose: () => { window.__closed++; },
    });
    window.__step = (kind, q) => {
      editor.textContent = '!' + q;
      const items = d.filterCommands(window.__cmds, q);
      if (kind === 'open') window.__popup.open(anchor, items, q); else window.__popup.update(items, q);
      return items.map((s) => s.matched);
    };
    window.__sel = () => {
      const host = document.getElementById('tvcmd-popup-host');
      const rows = host ? [...host.shadowRoot.querySelectorAll('[role="option"]')] : [];
      const i = rows.findIndex((r) => r.getAttribute('aria-selected') === 'true');
      return { index: i, rows: rows.length, current: window.__popup.current()?.matched ?? null, open: host?.getAttribute('data-tvcmd-open') ?? null };
    };
  }, commands);

  let n = 0;
  const shot = async (state) => {
    n++;
    const file = join(shotDir, 'p4-' + theme + '-' + String(n).padStart(2, '0') + '-' + state + '.png');
    await page.waitForTimeout(30);
    await page.screenshot({ path: file });
    result.shots.push('docs/critics/r2/' + file.split(/[\\/]/).pop());
  };

  await page.evaluate(() => window.__step('open', ''));
  await shot('open');
  await page.evaluate(() => window.__step('update', 'b'));
  await shot('b');
  const baList = await page.evaluate(() => window.__step('update', 'ba'));
  await shot('ba');
  const seq = [];
  for (let i = 0; i < 9; i++) seq.push(await page.evaluate(() => { window.__popup.move(1); return window.__sel().index; }));
  await shot('down9');
  const up = await page.evaluate(() => { window.__popup.move(-1); return window.__sel(); });
  await shot('up1');
  result.wrap[theme] = { baCount: baList.length, downIndices: seq, afterUp: up.index };
  const expectDown = Array.from({ length: 9 }, (_, i) => (i + 1) % baList.length);
  if (JSON.stringify(seq) !== JSON.stringify(expectDown)) fail(theme + ' wrap ' + JSON.stringify(seq));
  if (up.index !== (expectDown[8] - 1 + baList.length) % baList.length) fail(theme + ' up index ' + up.index);
  // Pick by mouse click on the selected row (exercises mousedown preventDefault + click).
  const box = await page.evaluate(() => {
    const host = document.getElementById('tvcmd-popup-host');
    const r = host.shadowRoot.querySelector('[role="option"][aria-selected="true"]').getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.click(box.x, box.y);
  const picked = await page.evaluate(() => window.__picked);
  result.picked[theme] = { picked, expected: up.current };
  if (picked !== up.current) fail(theme + ' pick ' + picked + ' vs ' + up.current);
  await page.evaluate(() => { document.getElementById('editor').textContent = '!' + window.__picked + ' '; window.__popup.close(); });
  await shot('picked');

  // Selection stays on the same command across updates.
  const keep = await page.evaluate(() => {
    window.__step('open', 'b');
    for (let i = 0; i < 60 && window.__popup.current().command.name !== 'kebab'; i++) window.__popup.move(1);
    const before = window.__popup.current().command.name;
    window.__step('update', 'ba');
    const afterBa = window.__popup.current()?.command.name ?? null;
    window.__step('update', 'bal'); // kebab gone -> index 0
    const afterBal = window.__sel();
    return { before, afterBa, afterBalIndex: afterBal.index, afterBal: afterBal.current };
  });
  result.keepSelection = result.keepSelection || {};
  result.keepSelection[theme] = keep;
  if (keep.before !== 'kebab' || keep.afterBa !== 'kebab' || keep.afterBalIndex !== 0) fail(theme + ' keep selection ' + JSON.stringify(keep));
  // Untouched selection stays on row 0 across updates.
  const untouched = await page.evaluate(() => { window.__step('open', ''); window.__step('update', 'b'); return window.__sel(); });
  if (untouched.index !== 0) fail(theme + ' untouched selection moved to ' + untouched.index);

  // Empty list hides and fires onClose; close() does not.
  const closeCheck = await page.evaluate(() => {
    const c0 = window.__closed;
    window.__popup.close();
    const c1 = window.__closed;
    window.__step('open', 'b');
    window.__step('update', 'zzzz');
    return { closeFired: c1 - c0, emptyFired: window.__closed - c1, open: window.__popup.isOpen() };
  });
  result.closeCheck = result.closeCheck || {};
  result.closeCheck[theme] = closeCheck;
  if (closeCheck.closeFired !== 0 || closeCheck.emptyFired !== 1 || closeCheck.open) fail(theme + ' close rules ' + JSON.stringify(closeCheck));

  // Timing: 100 items, performance.now around the call; first open is cold (mount + row creation).
  const perf = await page.evaluate(() => {
    const d = window.__tvcmdDev;
    const anchor = document.getElementById('anchor');
    window.__popup.destroy();
    const p = d.createPopup({ maxRows: 13, getEditorRect: () => document.getElementById('editor').getBoundingClientRect(), onPick() {}, onClose() {} });
    const all = d.filterCommands(window.__cmds, '', 100);
    const a = d.filterCommands(window.__cmds, 'a', 100);
    const opens = [], updates = [];
    for (let i = 0; i < 30; i++) {
      p.close();
      let t = performance.now(); p.open(anchor, all, ''); opens.push(performance.now() - t);
      document.body.offsetHeight; // flush layout between runs
      t = performance.now(); p.update(i % 2 ? all : a, i % 2 ? '' : 'a'); updates.push(performance.now() - t);
      document.body.offsetHeight;
    }
    const med = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
    const r = (x) => Math.round(x * 100) / 100;
    p.destroy();
    return { items: all.length, updateItems: a.length, openColdMs: r(opens[0]), openMedianMs: r(med(opens)), openMaxMs: r(Math.max(...opens)),
      updateMedianMs: r(med(updates)), updateMaxMs: r(Math.max(...updates)) };
  });
  result.perf[theme] = perf;
  if (perf.openMaxMs >= 16 || perf.updateMaxMs >= 16) fail(theme + ' perf ' + JSON.stringify(perf));
  if (errors.length) fail(theme + ' console errors: ' + errors.join(' | '));
  await page.close();
}

// Sample the reference frames' selected bar (row 3 of 05-down, y 259..299) and tray background.
const sp = await browser.newPage();
for (const theme of ['dark', 'light']) {
  const b64 = readFileSync(join(root, 'docs', 'recordings', 'ref-7tv-colon-' + theme, 'frames', '05-down.png')).toString('base64');
  result.refSamples[theme] = await sp.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3)).join(',');
    return { selectedBar: px(700, 279), selectedBarEdge: px(14, 262), trayBg: px(700, 340), outerBorder: px(4, 400), outsideTray: px(2, 400) };
  }, 'data:image/png;base64,' + b64);
}
await browser.close();
console.log(JSON.stringify(result, null, 1));
if (result.asserts.length) process.exit(1);
