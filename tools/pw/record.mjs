// Generic chat-autocomplete recorder. Records the SAME protocol for 7TV (reference) and for our own
// extension, so an A/B critic compares like with like.
//
//   node tools/pw/record.mjs --url https://www.twitch.tv/popout/coconutb/chat --trigger ":" --filter eel \
//        --out docs/recordings/ref-7tv-colon-dark --theme dark --seventv true [--extensions a,b] \
//        [--headless true] [--video true] [--probes slash,at]
//
// Protocol (frames/NN-*.png): idle, trigger, filter1, filter2 (and filter3 if given), Down x2, Up,
// Tab, clear, retype trigger+filter -> Enter (only while a popup row is visible), clear, trigger ->
// Escape, clear. Then extra key probes for the keyboard table, then optional "/" and "@" frames.
// Outputs: dom.json, timings.json, notes.md, frames/, video.webm (with --video).
// Live site is read-only: Enter is pressed ONLY while a popup row is in the DOM; input is cleared
// (Control+A, Delete) after every step.
//
// Popup detection (extended after the round 1 spec critic): every document scan goes through deepAll(),
// which walks the document AND every OPEN shadow root, recursively. A popup rendered inside an open
// shadow root (our div#tvcmd-popup-host) is therefore found without special-casing its id, and a
// light-DOM popup (7TV / Twitch autocomplete tray) is found exactly as before. Rows with role="option"
// and a selected row with aria-selected="true" are recognised; a visible role="option" row inside a
// role="listbox" is accepted even when it existed before the keypress (a popup that mounts once and
// reuses its row nodes). Closed shadow roots stay invisible by design.
import { launchChromium } from './browser.mjs';
import { launchWithSevenTv, openPopoutChat, chatInput, waitForSevenTv } from './seventv.mjs';
import { mkdirSync, writeFileSync as rawWrite, renameSync, existsSync } from 'node:fs';
// Outputs stay ASCII: any non-ASCII char (e.g. Slate's U+FEFF in an empty input) becomes a \uXXXX escape.
const writeFileSync = (p, s) => rawWrite(p, s.replace(/[^\x00-\x7F]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
import { resolve, join } from 'node:path';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1];
const url = opt.url || 'https://www.twitch.tv/popout/coconutb/chat';
const trigger = opt.trigger || '!';
const filter = opt.filter || '';
const outDir = resolve(opt.out || 'docs/recordings/tmp');
const theme = opt.theme || 'dark';
const extensions = opt.extensions ? opt.extensions.split(',').filter(Boolean) : [];
let headless = opt.headless !== 'false';
const useSevenTv = opt.seventv === 'true';
const probes = opt.probes ? opt.probes.split(',') : [];
const frames = join(outDir, 'frames');
mkdirSync(frames, { recursive: true });
const videoDir = opt.video === 'true' ? join(outDir, 'video-tmp') : undefined;
// --profile <name>: profile directory under .pw-profiles (default rec-ext / rec-7tv). Parallel runs
// MUST use distinct profiles: Chromium refuses a profile another instance holds open.
const profileDir = resolve('.pw-profiles', opt.profile || 'rec-' + (useSevenTv ? '7tv' : 'ext'));

// ---- in-page helper (serialised into the page) ----
function installHelper() {
  if (window.__rec) return;
  const ROW_SEL = '[role="option"], [class*="autocomplete-item"], [class*="autocomplete-match"], [class*="suggestion"], [class*="match-list"] > *, li';
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const input = () => Array.from(document.querySelectorAll('[contenteditable="true"]')).filter(vis).pop() || null;
  // Every element under root (document or element), descending into OPEN shadow roots recursively.
  function deepAll(root) {
    const out = [];
    const walk = (node) => { for (const e of node.querySelectorAll('*')) { out.push(e); if (e.shadowRoot) walk(e.shadowRoot); } };
    if (root.shadowRoot) walk(root.shadowRoot);
    walk(root);
    return out;
  }
  const upOrHost = (e) => e.parentElement || (e.getRootNode() instanceof ShadowRoot ? e.getRootNode().host : null);
  const optionRow = (e) => e.getAttribute('role') === 'option' && !!e.closest('[role="listbox"]');
  const known = new WeakSet();
  let markedEl = null;
  function snapshot() { for (const e of deepAll(document)) known.add(e); }
  const rowSized = (e) => { const r = e.getBoundingClientRect(); return vis(e) && r.height >= 12 && r.height <= 90 && r.width >= 40; };
  const outermost = (rows) => rows.filter((e) => !rows.some((o) => o !== e && o.contains(e)));
  // Rows inside a known popup: ROW_SEL matches, else the descendant with the most row-sized children.
  function rowsIn(pop) {
    const inside = deepAll(pop);
    const sel = outermost(inside.filter((e) => e.matches(ROW_SEL)).filter(rowSized));
    if (sel.length) return sel;
    let best = []; for (const e of [pop, ...inside]) { const kids = Array.from(e.children).filter(rowSized); if (kids.length > best.length) best = kids; }
    return best;
  }
  function rowsNear() {
    const inp = input(); if (!inp) return [];
    const marked = markedEl && markedEl.isConnected ? markedEl : null;
    if (marked && vis(marked) && !marked.contains(inp)) { const r = rowsIn(marked); if (r.length) return r; }
    if (markedEl) { markedEl.removeAttribute('data-rec-popup'); markedEl = null; }
    const ir = inp.getBoundingClientRect();
    const near = (e) => { const r = e.getBoundingClientRect(); return Math.min(Math.abs(r.bottom - ir.top), Math.abs(r.top - ir.bottom)) < 800; };
    // The empty Slate draft (U+FEFF zero-width leaf) and its "Send a message" placeholder are part of
    // the input, never popup rows (P3-1). Twitch renders the placeholder as a sibling
    // p.chat-wysiwyg-input__placeholder, not inside the editor.
    const slate = '.chat-wysiwyg-input__placeholder, [data-slate-placeholder],[data-slate-node], [data-slate-leaf], [data-slate-string], [data-slate-zero-width], [data-slate-editor]';
    const ok = (e) => rowSized(e) && near(e) && !e.contains(inp) && !inp.contains(e) && !e.closest(slate) && !e.querySelector(slate) && !e.closest('[role="log"], .chat-scrollable-area__message-container, .seventv-chat-list, .chat-list--default, .chat-input__buttons-container');
    const fresh = deepAll(document).filter((e) => (!known.has(e) || optionRow(e)) && ok(e));
    let rows = outermost(fresh.filter((e) => e.matches(ROW_SEL)));
    if (!rows.length) {
      // group new row-sized elements by parent, take the parent with the most of them
      const by = new Map(); for (const e of fresh) { if (!e.parentElement) continue; const a = by.get(e.parentElement) || []; a.push(e); by.set(e.parentElement, a); }
      for (const a of by.values()) if (a.length > rows.length) rows = a;
      rows = outermost(rows);
    }
    if (!rows.length) return [];
    const pop = popupOf(rows); if (pop) { pop.setAttribute('data-rec-popup', '1'); markedEl = pop; }
    return rows;
  }
  function popupOf(rows) {
    if (!rows.length) return null;
    const inp = input();
    let p = rows[0].parentElement;
    while (p && !rows.every((r) => p.contains(r))) p = p.parentElement;
    while (p && p.parentElement && !p.parentElement.contains(inp) && Math.abs(p.parentElement.getBoundingClientRect().width - p.getBoundingClientRect().width) < 3 && p.parentElement !== document.body) p = p.parentElement;
    return p;
  }
  function selectedIndex(rows) {
    let idx = rows.findIndex((r) => r.getAttribute('aria-selected') === 'true' || /(^|[\s_-])(selected|active|highlighted|focused|current)([\s_-]|$)/i.test(String(r.className)) || r.querySelector('[aria-selected="true"]'));
    if (idx >= 0) return idx;
    const bgs = rows.map((r) => getComputedStyle(r).backgroundColor);
    const odd = bgs.filter((b, i) => bgs.indexOf(b) === bgs.lastIndexOf(b));
    return odd.length === 1 && rows.length > 2 ? bgs.indexOf(odd[0]) : -1;
  }
  // A point 10 px above the open popup's top edge, horizontally centred: the chat message area,
  // outside both the popup and the input. null when no popup is open.
  function outsidePoint() {
    const pop = popupOf(rowsNear()); if (!pop) return null;
    const r = pop.getBoundingClientRect(); const inp = input();
    const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top - 10);
    const hit = document.elementFromPoint(x, y);
    const ir = inp ? inp.getBoundingClientRect() : null;
    const inInput = !!(ir && x >= ir.left && x <= ir.right && y >= ir.top && y <= ir.bottom);
    return { x, y, popupTop: Math.round(r.top), inPopup: y >= r.top && y <= r.bottom, inInput, target: hit ? (hit.tagName.toLowerCase() + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.trim().split(/\s+/)[0] : '')) : null };
  }
  function state() {
    const rows = rowsNear();
    const inp = input();
    return { open: rows.length > 0, count: rows.length, first: rows[0] ? rows[0].textContent.trim().slice(0, 80) : '', sel: selectedIndex(rows), input: inp ? inp.textContent : null };
  }
  // Polls every 16 ms from the next keydown until pred(state) holds or timeoutMs passes.
  function arm(kind, timeoutMs) {
    const before = state();
    const rec = { done: false, ms: null, kind, before };
    let t0 = null;
    const onKey = (ev) => { if (t0 === null) t0 = ev.timeStamp; };
    document.addEventListener('keydown', onKey, true);
    const start = performance.now();
    const iv = setInterval(() => {
      const s = state();
      const now = performance.now();
      const hit = kind === 'open' ? s.open && !before.open : (s.open && (s.count !== before.count || s.first !== before.first)) || (before.open && !s.open);
      if (hit || now - start > timeoutMs) {
        clearInterval(iv); document.removeEventListener('keydown', onKey, true);
        rec.done = true; rec.after = s;
        rec.ms = hit && t0 !== null ? Math.round((now - t0) * 10) / 10 : null;
      }
    }, 16);
    window.__armed = rec;
  }
  function px(v) { return parseFloat(v) || 0; }
  function bgOf(e) { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return b; e = upOrHost(e); } return null; }
  function measure() {
    const rows = rowsNear(); const pop = popupOf(rows); const inp = input();
    if (!pop) return { popup: null };
    const pr = pop.getBoundingClientRect(); const ir = inp.getBoundingClientRect();
    const cs = getComputedStyle(pop); const r0 = rows[0]; const rs = getComputedStyle(r0);
    let scroller = pop; for (const e of [pop, ...pop.querySelectorAll('*')]) { if (e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY)) { scroller = e; break; } }
    const visibleRows = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.bottom > pr.top && b.top < pr.bottom; });
    const hl = Array.from(r0.querySelectorAll('*')).find((e) => /^(MARK|STRONG|B)$/.test(e.tagName) || (px(getComputedStyle(e).fontWeight) >= 600 && px(rs.fontWeight) < 600) || (getComputedStyle(e).color !== rs.color && e.textContent.trim().length > 0 && e.children.length === 0));
    const si = selectedIndex(rows); const sr = si >= 0 ? rows[si] : null;
    const above = pr.bottom <= ir.top + 2;
    return {
      popup: { rect: [pr.x, pr.y, pr.width, pr.height].map(Math.round), tag: pop.tagName, className: String(pop.className).slice(0, 200), id: pop.id || null },
      input: { rect: [ir.x, ir.y, ir.width, ir.height].map(Math.round), className: String(inp.className).slice(0, 200), parentClasses: [inp.parentElement, inp.parentElement && inp.parentElement.parentElement, inp.closest('[class*="seventv"]')].filter(Boolean).map((e) => e.tagName + '.' + String(e.className).slice(0, 120)) },
      position: above ? 'above' : 'below', gapPx: Math.round(above ? ir.top - pr.bottom : pr.top - ir.bottom),
      rowCount: rows.length, visibleRowCount: visibleRows.length, rowHeight: Math.round(r0.getBoundingClientRect().height * 10) / 10,
      rowTag: r0.tagName, rowClassName: String(r0.className).slice(0, 200),
      scroll: { scrollerClass: String(scroller.className).slice(0, 120), scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, scrolls: scroller.scrollHeight > scroller.clientHeight + 2, maxRowsBeforeScroll: scroller.scrollHeight > scroller.clientHeight + 2 ? visibleRows.length : 'not reached at ' + rows.length + ' rows', overflowY: getComputedStyle(scroller).overflowY },
      font: { size: rs.fontSize, family: rs.fontFamily, weight: rs.fontWeight, lineHeight: rs.lineHeight },
      colors: { popupBackground: bgOf(pop), rowBackground: rs.backgroundColor, text: rs.color },
      highlight: hl ? { tag: hl.tagName, text: hl.textContent.slice(0, 40), color: getComputedStyle(hl).color, weight: getComputedStyle(hl).fontWeight, background: getComputedStyle(hl).backgroundColor } : null,
      selectedRow: sr ? { index: si, background: getComputedStyle(sr).backgroundColor, color: getComputedStyle(sr).color, outline: getComputedStyle(sr).outline, className: String(sr.className).slice(0, 160) } : null,
      borderRadius: cs.borderRadius, boxShadow: cs.boxShadow, border: cs.border, zIndex: (() => { let e = pop; while (e) { const z = getComputedStyle(e).zIndex; if (z !== 'auto') return z; e = upOrHost(e); } return 'auto'; })(),
      rowHasImage: !!r0.querySelector('img, svg, picture'), rowHasBadgeOrSecondLine: Array.from(r0.querySelectorAll('*')).filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => e.textContent.trim().slice(0, 40)),
      first5: rows.slice(0, 5).map((r) => r.textContent.trim().slice(0, 80)),
      popupOuterHTMLHead: pop.outerHTML.slice(0, 1500),
    };
  }
  snapshot();
  window.__rec = { state, arm, measure, snapshot, outsidePoint, inputHTML: () => { const i = input(); return i ? i.innerHTML.slice(0, 2000) : null; } };
}

// ---- driver ----
async function launch() {
  if (useSevenTv) return launchWithSevenTv({ profileDir, headless, video: videoDir, extensions });
  return launchChromium({ extensions, profileDir, headless, video: videoDir });
}

// Real Twitch theme setting (localStorage twilight.theme: 1 dark, 0 light) plus an <html> class swap.
const themeInit = (t) => { try { localStorage.setItem('twilight.theme', t === 'dark' ? '1' : '0'); } catch {} };
let ctx = await launch();
await ctx.addInitScript(themeInit, theme);
let page = await openPopoutChat(ctx, null, { url });
const env = { url, trigger, filter, theme, headless, sevenTv: useSevenTv, extensions };
if (useSevenTv && !(await waitForSevenTv(page, 20000)) && headless) {
  await ctx.close(); headless = false; env.headless = false;
  ctx = await launch(); await ctx.addInitScript(themeInit, theme); page = await openPopoutChat(ctx, null, { url });
  await waitForSevenTv(page, 20000);
}
await page.waitForTimeout(useSevenTv ? 6000 : 3000); // let emote/command data load
env.sevenTvVersion = useSevenTv ? await page.evaluate(() => (document.querySelector('#seventv-extension') ? 'site.js present' : 'no site.js tag')) : null;
await page.evaluate((t) => { const h = document.documentElement; h.classList.remove('tw-root--theme-light', 'tw-root--theme-dark'); h.classList.add('tw-root--theme-' + t); }, theme);
env.viewport = page.viewportSize(); env.userAgent = await page.evaluate(() => navigator.userAgent);
await page.evaluate(installHelper);

const inp = chatInput(page);
const shot = (name) => page.screenshot({ path: join(frames, name + '.png') });
const st = () => page.evaluate(() => window.__rec.state());
const clear = async () => { await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await page.waitForTimeout(250); };
async function timedKey(kind, fn, timeoutMs = 3000) {
  await page.evaluate(() => window.__rec.snapshot());
  await page.evaluate(([k, t]) => window.__rec.arm(k, t), [kind, timeoutMs]);
  await fn();
  await page.waitForFunction(() => window.__armed && window.__armed.done, null, { timeout: timeoutMs + 2000, polling: 16 });
  return page.evaluate(() => window.__armed);
}
const log = [];
const step = async (name, fn) => { await fn(); await page.waitForTimeout(350); const s = await st(); log.push({ step: name, ...s }); return s; };

await inp.click();
await shot('01-idle');
const keys = [trigger, ...filter.split('')];
const keyTimings = [];
let measured = null; let selMeasure = null;
for (let i = 0; i < keys.length; i++) {
  const open = (await st()).open;
  const r = await timedKey(open ? 'update' : 'open', () => page.keyboard.type(keys[i]), open ? 1500 : 3000);
  keyTimings.push({ key: keys[i], kind: open ? 'update' : 'open', ms: r.ms, after: r.after });
  await page.waitForTimeout(200);
  log.push({ step: 'type ' + keys[i], ...(await st()) });
  await shot(i === 0 ? '02-trigger' : i === 1 ? '03-filter1' : i === 2 ? '04-filter2' : '04-filter' + i);
  if ((await st()).open) measured = await page.evaluate(() => window.__rec.measure());
}
await step('ArrowDown', () => page.keyboard.press('ArrowDown'));
await step('ArrowDown', () => page.keyboard.press('ArrowDown'));
await shot('05-down');
if ((await st()).open) selMeasure = await page.evaluate(() => window.__rec.measure());
await step('ArrowUp', () => page.keyboard.press('ArrowUp'));
await shot('06-up');
const tabState = await step('Tab', () => page.keyboard.press('Tab'));
await shot('07-tab');
const afterTab = { text: tabState.input, html: await page.evaluate(() => window.__rec.inputHTML()) };
await clear();
await page.keyboard.type(keys.join(''), { delay: 60 });
await page.waitForTimeout(800);
let afterEnter = { text: null, note: 'no popup row visible, Enter not pressed' };
if ((await st()).open) {
  const s = await step('Enter (popup open)', () => page.keyboard.press('Enter'));
  afterEnter = { text: s.input, html: await page.evaluate(() => window.__rec.inputHTML()), popupOpenAfter: s.open };
}
await shot('08-enter');
await clear();
await page.keyboard.type(keys.join(''), { delay: 60 });
await page.waitForTimeout(800);
const preEsc = await st();
const escState = await step('Escape', () => page.keyboard.press('Escape'));
await shot('09-esc');
const esc = { popupOpenBefore: preEsc.open, popupOpenAfter: escState.open, inputAfter: escState.input, triggerStillInInput: (escState.input || '').includes(trigger) };
await clear();

// ---- extra probes for the keyboard table (popup open = trigger+filter typed) ----
const probesOut = {};
async function openProbe(name, action) {
  await inp.click(); await clear();
  await page.keyboard.type(keys.join(''), { delay: 60 }); await page.waitForTimeout(800);
  const before = await st();
  await action(); await page.waitForTimeout(400);
  const after = await st();
  probesOut[name] = { openBefore: before.open, selBefore: before.sel, inputBefore: before.input, openAfter: after.open, selAfter: after.sel, inputAfter: after.input, firstAfter: after.first };
  await clear();
}
await openProbe('Down', () => page.keyboard.press('ArrowDown'));
await openProbe('Up from first (wrap?)', () => page.keyboard.press('ArrowUp'));
await openProbe('Down x30 (wrap/scroll?)', async () => { for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown'); });
await openProbe('Shift+Tab', () => page.keyboard.press('Shift+Tab'));
await openProbe('Space', () => page.keyboard.press('Space'));
await openProbe('Backspace past trigger', async () => { for (let i = 0; i < keys.length; i++) await page.keyboard.press('Backspace'); });
// Click outside (P3-1): 10 px above the popup's top edge, centred, i.e. in the chat message area.
let clickPoint = null;
await openProbe('Click outside', async () => {
  clickPoint = await page.evaluate(() => window.__rec.outsidePoint());
  if (clickPoint && !clickPoint.inPopup && !clickPoint.inInput) await page.mouse.click(clickPoint.x, clickPoint.y);
});
if (probesOut['Click outside']) probesOut['Click outside'].point = clickPoint;
// closed-state probes: no trigger typed
async function closedProbe(name, text, action) {
  await inp.click(); await clear();
  if (text) await page.keyboard.type(text, { delay: 60 });
  await page.waitForTimeout(300);
  const before = await st();
  await action(); await page.waitForTimeout(400);
  const after = await st();
  probesOut['closed: ' + name] = { inputBefore: before.input, openAfter: after.open, inputAfter: after.input, firstAfter: after.first };
  await clear();
}
await closedProbe('Tab after "' + filter + '"', filter, () => page.keyboard.press('Tab'));
await closedProbe('Up on empty', '', () => page.keyboard.press('ArrowUp'));
await closedProbe('Down on empty', '', () => page.keyboard.press('ArrowDown'));
await closedProbe('Escape on text', 'hi', () => page.keyboard.press('Escape'));

const extra = {};
for (const p of probes) {
  const ch = p === 'slash' ? '/' : p === 'at' ? '@' : p;
  await inp.click(); await clear();
  await page.evaluate(() => window.__rec.snapshot());
  await page.keyboard.type(ch); await page.waitForTimeout(1200);
  extra[ch] = { state: await st(), measure: await page.evaluate(() => window.__rec.measure()) };
  await shot('x-' + p);
  await clear();
}
await page.mouse.click(5, 5);
const firstOpen = keyTimings.find((k) => k.kind === 'open' && k.ms !== null);
const firstUpdate = firstOpen ? keyTimings.slice(keyTimings.indexOf(firstOpen) + 1).find((k) => k.kind === 'update' && k.ms !== null) : null;
const timings = {
  triggerToPopupMs: firstOpen ? firstOpen.ms : null,
  filterToUpdateMs: firstUpdate ? firstUpdate.ms : null,
  popupOpenedOnKey: firstOpen ? firstOpen.key : null,
  updateMeasuredOnKey: firstUpdate ? firstUpdate.key : null,
  perKey: keyTimings.map((k) => ({ key: k.key, kind: k.kind, ms: k.ms, rowsAfter: k.after.count, firstAfter: k.after.first })),
  measuredHow: 'In-page: a capturing keydown listener takes event.timeStamp as t0; a setInterval(16 ms) poll checks the DOM for new visible suggestion rows near the input (open) or a changed row count / first-row text (update); ms = performance.now() at the first matching poll minus t0. Resolution about one poll (16 ms). Keys sent with Playwright keyboard.type. null = no popup/update within the timeout (3000 ms open, 1500 ms update).',
};
const dom = { env, popupWithFilter: measured, popupAfterArrowDown2: selMeasure, inputAfterTab: afterTab, inputAfterEnter: afterEnter, escape: esc, probes: probesOut, extraTriggers: extra, stepLog: log };
writeFileSync(join(outDir, 'dom.json'), JSON.stringify(dom, null, 2));
writeFileSync(join(outDir, 'timings.json'), JSON.stringify(timings, null, 2));

// ---- notes.md (generated; edit observations below the marker by hand) ----
const yn = (b) => (b ? 'open' : 'closed');
const row = (k, v) => '| ' + k + ' | ' + v + ' |';
const P = probesOut;
const desc = (p) => p ? `popup ${yn(p.openBefore)} -> ${yn(p.openAfter)}; selected ${p.selBefore} -> ${p.selAfter}; input "${p.inputBefore}" -> "${p.inputAfter}"` : 'n/a';
const descC = (p) => p ? `input "${p.inputBefore}" -> "${p.inputAfter}"; popup after: ${yn(p.openAfter)}${p.firstAfter ? ' (first row "' + p.firstAfter + '")' : ''}` : 'n/a';
const lines = [
  '# Recording: ' + outDir.split(/[\\/]/).slice(-1)[0], '',
  'Generated by tools/pw/record.mjs. Frames in frames/, numbers in dom.json and timings.json.', '',
  '## Environment', '',
  `Chromium (Playwright 'chromium' channel), ${env.headless ? 'headless' : 'headed'}, viewport ${env.viewport?.width}x${env.viewport?.height}; url ${url}; theme ${theme} (html class swapped); trigger "${trigger}", filter "${filter}"; 7TV: ${useSevenTv ? 'vendor/7tv-patched v3.1.6 local mode (see docs/reference-7tv-popup.md)' : 'no'}; extensions: ${extensions.join(', ') || 'none'}; logged out.`, '',
  '## Keyboard model (observed)', '',
  '| key | popup open | popup closed |', '|---|---|---|',
  `| Down | ${desc(P['Down'])}; x30: ${desc(P['Down x30 (wrap/scroll?)'])} | ${descC(P['closed: Down on empty'])} |`,
  `| Up | from first row: ${desc(P['Up from first (wrap?)'])} | ${descC(P['closed: Up on empty'])} |`,
  `| Tab | input after: "${afterTab.text}" | ${descC(P['closed: Tab after "' + filter + '"'])} |`,
  `| Shift+Tab | ${desc(P['Shift+Tab'])} | not probed |`,
  `| Enter | input after: "${afterEnter.text}"${afterEnter.popupOpenAfter !== undefined ? ', popup after: ' + yn(afterEnter.popupOpenAfter) : ''} | not pressed (would send) |`,
  `| Escape | popup ${yn(esc.popupOpenBefore)} -> ${yn(esc.popupOpenAfter)}; input "${esc.inputAfter}"; trigger kept: ${esc.triggerStillInInput} | ${descC(P['closed: Escape on text'])} |`,
  `| Space | ${desc(P['Space'])} | types a space |`,
  `| Backspace past trigger | ${desc(P['Backspace past trigger'])} | deletes |`,
  `| Click outside | ${clickPoint ? (clickPoint.inPopup || clickPoint.inInput ? 'not clicked: the point 10 px above the popup fell inside the ' + (clickPoint.inPopup ? 'popup' : 'input') : `clicked (${clickPoint.x}, ${clickPoint.y}), 10 px above the popup's top edge (y ${clickPoint.popupTop}) on ${clickPoint.target}, outside popup and input: popup ${P['Click outside'].openAfter ? 'stayed open' : 'closed'}, input text ${P['Click outside'].inputBefore === P['Click outside'].inputAfter ? 'unchanged' : 'changed'}; ` + desc(P['Click outside'])) : 'not clicked: no popup open before the click'} | - |`, '',
  '## Message that would be sent', '',
  `- after Tab: "${afterTab.text}"`, `- after Enter: "${afterEnter.text}"${afterEnter.note ? ' (' + afterEnter.note + ')' : ''}`, '',
  '## Timings', '', '```', JSON.stringify(timings.perKey), '```', '',
  '## Popup geometry', '',
  measured ? `${measured.position} the input, gap ${measured.gapPx} px; ${measured.rowCount} rows (${measured.visibleRowCount} visible), row height ${measured.rowHeight} px; scroll: ${JSON.stringify(measured.scroll)}` : 'No popup detected during the filter steps.', '',
  ...(probes.length ? ['## Other triggers', '', ...Object.entries(extra).map(([k, v]) => `- "${k}": popup ${yn(v.state.open)}, ${v.state.count} rows, first "${v.state.first}"; container ${v.measure && v.measure.popup ? v.measure.popup.className : 'none'} (frame x-${k === '/' ? 'slash' : k === '@' ? 'at' : k}.png)`), ''] : []),
  '## Limits', '',
  '- Logged out: no Twitch user emotes, no sending; Enter-with-popup-closed not exercised.',
  '- Popup detection is heuristic (suggestion-row selectors near the input); see dom.json popupOuterHTMLHead.',
  '- Theme is a class swap on <html>, not a Twitch setting change.',
  '- Timing resolution about 16 ms; machine and network dependent.', '',
  '<!-- hand observations below -->', '',
];
writeFileSync(join(outDir, 'notes.md'), lines.join('\n'));

const vid = page.video();
await ctx.close();
if (vid && videoDir) { const p = await vid.path(); if (existsSync(p)) renameSync(p, join(outDir, 'video.webm')); }
console.log(JSON.stringify({ outDir, timings: { t: timings.triggerToPopupMs, f: timings.filterToUpdateMs, on: timings.popupOpenedOnKey }, rows: measured ? measured.rowCount : 0, first5: measured ? measured.first5 : [], tab: afterTab.text, enter: afterEnter.text, esc, extra: Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, v.state])) }));
