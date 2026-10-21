// Smoke check for the Marionette driver: start Firefox headless, open the popout chat, type in
// the input, screenshot. Usage: node tools/ff/smoke.mjs [--addon dist/firefox] [--headed]
import { launchFirefox } from './marionette.mjs';

const argv = process.argv.slice(2);
const addon = argv.includes('--addon') ? argv[argv.indexOf('--addon') + 1] : null;
const headed = argv.includes('--headed');
const t0 = Date.now();
const ff = await launchFirefox({ profileDir: '.pw-profiles/ff-smoke', headless: !headed });
console.log('session', ff.sessionId, 'in', Date.now() - t0, 'ms');
try {
  if (addon) console.log('addon id', await ff.installAddon(addon));
  await ff.navigate('https://www.twitch.tv/popout/coconutb/chat');
  const reject = await ff.find('button', 5000).catch(() => null);
  const clicked = await ff.execute("const b=[...document.querySelectorAll('button')].find(x=>/^reject$/i.test(x.textContent.trim()));if(b){b.click();return true}return false");
  console.log('cookie banner rejected:', clicked, reject ? '' : '(no button found yet)');
  const input = await ff.find('div[data-a-target="chat-input"][data-slate-editor="true"]', 30000).catch(async (e) => {
    await ff.screenshot('.pw-profiles/ff-smoke-fail.png');
    const info = await ff.execute("const c=document.querySelector('[contenteditable]');return {title: document.title, url: location.href, ce: document.querySelectorAll('[contenteditable]').length, ceOuter: c ? c.outerHTML.slice(0, 400) : null, text: document.body.innerText.slice(0, 300)}");
    console.log('input not found; page:', JSON.stringify(info, null, 1));
    throw e;
  });
  await ff.click(input);
  await ff.sendKeys(input, '!');
  const readInput0 = 'return document.querySelector(\'[data-a-target="chat-input"][data-slate-editor="true"]\').textContent';
  console.log('after sendKeys "!":', JSON.stringify(await ff.execute(readInput0)));
  await ff.pressKey('b');
  console.log('after pressKey b:', JSON.stringify(await ff.execute(readInput0)));
  await ff.sendKeys(input, 'cd');
  console.log('after sendKeys cd:', JSON.stringify(await ff.execute(readInput0)));
  await ff.pressKey('ArrowDown');
  const readInput = 'return document.querySelector(\'[data-a-target="chat-input"][data-slate-editor="true"]\').textContent';
  const text = await ff.execute(readInput);
  console.log('input text now:', JSON.stringify(text));
  await ff.pressKey('Control+a');
  await ff.pressKey('Delete');
  const after = await ff.execute(readInput);
  console.log('after clear:', JSON.stringify(after));
  await ff.screenshot('.pw-profiles/ff-smoke.png');
  console.log('screenshot .pw-profiles/ff-smoke.png');
} finally {
  await ff.quit();
  console.log('done in', Date.now() - t0, 'ms');
}
