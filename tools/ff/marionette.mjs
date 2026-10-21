// Minimal Marionette client for driving the system Firefox with a temporary add-on.
// Why: Playwright's Firefox build cannot load extensions and web-ext run cannot type, so the
// Firefox-side checks (install as a temporary add-on, type "!" in a real chat, read the popup,
// screenshot) go through Firefox's own remote protocol. No extra binary: this talks TCP to
// firefox.exe started with -marionette.
//
//   import { launchFirefox } from '../../tools/ff/marionette.mjs'
//   const ff = await launchFirefox({ profileDir: '.pw-profiles/ff-check', headless: true })
//   await ff.installAddon('C:/x/dist/firefox')          // temporary add-on, directory or .xpi/.zip
//   await ff.navigate('https://www.twitch.tv/popout/coconutb/chat')
//   const el = await ff.find('div.chat-input.chat-wysiwyg-input__editor')
//   await ff.click(el); await ff.sendKeys(el, '!b'); await ff.pressKey('ArrowDown')
//   const txt = await ff.execute('return document.body.innerText.length')
//   await ff.screenshot('out.png'); await ff.quit()
//
// Keys for pressKey: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Tab, Enter, Escape, Backspace,
// Space, Delete, Control+a (modifier+key, letters only).
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const WD_ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const KEYS = {
  ArrowUp: String.fromCharCode(0xe013),
  ArrowDown: String.fromCharCode(0xe015),
  ArrowLeft: String.fromCharCode(0xe012),
  ArrowRight: String.fromCharCode(0xe014),
  Tab: String.fromCharCode(0xe004),
  Enter: String.fromCharCode(0xe007),
  Escape: String.fromCharCode(0xe00c),
  Backspace: String.fromCharCode(0xe003),
  Space: ' ',
  Delete: String.fromCharCode(0xe017),
  Control: String.fromCharCode(0xe009),
  Shift: String.fromCharCode(0xe008),
};

export class MarionetteClient {
  constructor(port) {
    this.port = port;
    this.nextId = 1;
    this.pending = new Map();
    this.buf = Buffer.alloc(0);
    this.sock = null;
  }

  connect(timeoutMs = 60000) {
    const started = Date.now();
    return new Promise((res, rej) => {
      const attempt = () => {
        const s = net.connect({ host: '127.0.0.1', port: this.port });
        let hello = false;
        s.once('error', () => {
          s.destroy();
          if (Date.now() - started > timeoutMs) rej(new Error('marionette: connect timeout on port ' + this.port));
          else setTimeout(attempt, 500);
        });
        s.on('data', (d) => {
          this.buf = Buffer.concat([this.buf, d]);
          for (;;) {
            const colon = this.buf.indexOf(':');
            if (colon < 0) break;
            const len = parseInt(this.buf.subarray(0, colon).toString('ascii'), 10);
            if (!Number.isFinite(len)) { this.buf = Buffer.alloc(0); break; }
            if (this.buf.length < colon + 1 + len) break;
            const body = this.buf.subarray(colon + 1, colon + 1 + len).toString('utf8');
            this.buf = this.buf.subarray(colon + 1 + len);
            const msg = JSON.parse(body);
            if (!hello) { hello = true; this.sock = s; res(msg); continue; }
            if (Array.isArray(msg) && msg[0] === 1) {
              const p = this.pending.get(msg[1]);
              if (p) {
                this.pending.delete(msg[1]);
                if (msg[2]) p.rej(new Error('marionette ' + p.cmd + ': ' + JSON.stringify(msg[2]).slice(0, 500)));
                else p.res(msg[3]);
              }
            }
          }
        });
        s.on('close', () => { for (const p of this.pending.values()) p.rej(new Error('marionette: socket closed')); this.pending.clear(); });
      };
      attempt();
    });
  }

  send(cmd, params = {}, timeoutMs = 60000) {
    const id = this.nextId++;
    const body = JSON.stringify([0, id, cmd, params]);
    const payload = Buffer.from(body, 'utf8');
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error('marionette ' + cmd + ': timeout')); }, timeoutMs);
      this.pending.set(id, { cmd, res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
      this.sock.write(Buffer.concat([Buffer.from(payload.length + ':', 'ascii'), payload]));
    });
  }
}

export class Firefox {
  constructor(proc, client, profileDir) {
    this.proc = proc;
    this.m = client;
    this.profileDir = profileDir;
  }
  async newSession() {
    const r = await this.m.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: false } } });
    this.sessionId = r.sessionId;
    return r;
  }
  // Temporary add-on from an unpacked directory or a zip/xpi. Returns the add-on id.
  async installAddon(path, temporary = true) {
    const r = await this.m.send('Addon:Install', { path: resolve(path), temporary });
    return r.value;
  }
  navigate(url) { return this.m.send('WebDriver:Navigate', { url }, 120000); }
  async find(css, timeoutMs = 30000) {
    const started = Date.now();
    for (;;) {
      try {
        const r = await this.m.send('WebDriver:FindElement', { using: 'css selector', value: css });
        return r.value[WD_ELEMENT];
      } catch (e) {
        if (Date.now() - started > timeoutMs) throw e;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }
  async findAll(css) {
    const r = await this.m.send('WebDriver:FindElements', { using: 'css selector', value: css });
    return r.map ? r.map((x) => x[WD_ELEMENT]) : (r.value || []).map((x) => x[WD_ELEMENT]);
  }
  click(id) { return this.m.send('WebDriver:ElementClick', { id }); }
  sendKeys(id, text) { return this.m.send('WebDriver:ElementSendKeys', { id, text }); }
  // Press a named key, optionally with Control/Shift held: pressKey('ArrowDown'), pressKey('Control+a').
  async pressKey(spec) {
    const parts = spec.split('+');
    const key = parts.pop();
    const mods = parts.map((m) => KEYS[m]).filter(Boolean);
    const val = KEYS[key] || key;
    const actions = [];
    for (const m of mods) actions.push({ type: 'keyDown', value: m });
    actions.push({ type: 'keyDown', value: val }, { type: 'keyUp', value: val });
    for (const m of mods.reverse()) actions.push({ type: 'keyUp', value: m });
    await this.m.send('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'kb', actions }] });
    await this.m.send('WebDriver:ReleaseActions', {});
  }
  async execute(script, args = []) {
    const r = await this.m.send('WebDriver:ExecuteScript', { script, args });
    return r.value;
  }
  async executeAsync(script, args = []) {
    const r = await this.m.send('WebDriver:ExecuteAsyncScript', { script, args }, 120000);
    return r.value;
  }
  async screenshot(file) {
    const r = await this.m.send('WebDriver:TakeScreenshot', {});
    const b = Buffer.from(r.value, 'base64');
    if (file) writeFileSync(file, b);
    return b;
  }
  async quit() {
    try { await this.m.send('Marionette:Quit', { flags: ['eForceQuit'] }, 10000); } catch { /* already gone */ }
    try { this.m.sock.destroy(); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 500));
    try { this.proc.kill(); } catch { /* ignore */ }
  }
}

export async function launchFirefox(opts = {}) {
  const {
    profileDir = '.pw-profiles/firefox-marionette',
    headless = true,
    port = 2900 + Math.floor(Math.random() * 500),
    firefoxPath = 'C:/Program Files/Mozilla Firefox/firefox.exe',
    startUrl = 'about:blank',
    width = 1280,
    height = 800,
    extraArgs = [], // e.g. ['-remote-allow-system-access'] for the chrome context (added by the r1 integration agent)
  } = opts;
  if (!existsSync(firefoxPath)) throw new Error('firefox not found at ' + firefoxPath);
  const dir = resolve(profileDir);
  mkdirSync(dir, { recursive: true });
  const prefs = [
    ['marionette.port', port],
    ['remote.active-protocols', 1],
    ['browser.shell.checkDefaultBrowser', false],
    ['browser.startup.homepage_override.mstone', 'ignore'],
    ['browser.aboutwelcome.enabled', false],
    ['datareporting.policy.dataSubmissionPolicyBypassNotification', true],
    ['toolkit.telemetry.reportingpolicy.firstRun', false],
    ['browser.sessionstore.resume_from_crash', false],
    ['app.update.enabled', false],
    ['app.update.auto', false],
    ['extensions.autoDisableScopes', 0],
    ['dom.ipc.processCount', 4],
    ['media.autoplay.default', 5],
  ];
  writeFileSync(resolve(dir, 'user.js'), prefs.map(([k, v]) => 'user_pref(' + JSON.stringify(k) + ', ' + JSON.stringify(v) + ');').join('\n') + '\n');
  const args = ['-marionette', '-profile', dir, '-no-remote', '-new-instance', '-width', String(width), '-height', String(height)];
  if (headless) args.push('-headless');
  args.push(...extraArgs);
  args.push(startUrl);
  const proc = spawn(firefoxPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const out = [];
  proc.stdout.on('data', (d) => out.push(d.toString()));
  proc.stderr.on('data', (d) => out.push(d.toString()));
  const client = new MarionetteClient(port);
  await client.connect(90000);
  const ff = new Firefox(proc, client, dir);
  ff.output = out;
  await ff.newSession();
  return ff;
}
