// Minimal Chrome DevTools Protocol client — pure Node (>=22, uses the built-in WebSocket), no npm.
// Launches its own headless Chrome on a private profile so the harness never touches your real browser.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.SCRIPTORIUM_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
export const CHROME = CANDIDATES.find(p => existsSync(p));
export const PORT = 9223;   // distinct from the CAE Viewer rig's 9222

export async function launchChrome() {
  if (!CHROME) throw new Error('No Chrome/Edge found. Set SCRIPTORIUM_CHROME=<path to chrome.exe>.');
  const profile = mkdtempSync(join(tmpdir(), 'scriptorium-cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--window-size=1600,1000', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return proc; } catch (e) {}
    await new Promise(res => setTimeout(res, 200));
  }
  proc.kill(); throw new Error('Chrome did not expose the debugger endpoint');
}

export async function connectPage() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('No page target found');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return new CDP(ws);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    this.console = []; this.errors = []; this.handlers = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
        this.console.push({ type: msg.params.type, text });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const where = (d.url ? ' @ ' + d.url.split('/').pop() + ':' + d.lineNumber : '') + (d.stackTrace ? ' ← ' + d.stackTrace.callFrames.slice(0, 4).map(f => (f.functionName || '(anon)') + ':' + f.lineNumber).join(' < ') : '');
        const what = (d.exception && (d.exception.description || (d.exception.preview && JSON.stringify(d.exception.preview.properties || []).slice(0, 300)) || d.exception.className)) || d.text || 'unknown exception';
        this.errors.push((d.text && d.text !== what ? d.text + ': ' : '') + what + where);   // keep the source line + stack — "Object" alone is useless
      } else if (this.handlers.has(msg.method)) { this.handlers.get(msg.method)(msg.params); }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async init() { await this.send('Page.enable'); await this.send('Runtime.enable'); await this.send('DOM.enable'); }
  async navigate(url) {
    const loaded = new Promise(res => { this.handlers.set('Page.loadEventFired', res); });
    await this.send('Page.navigate', { url }); await loaded; this.handlers.delete('Page.loadEventFired');
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page eval failed: ' + ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text));
    return r.result.value;
  }
  async waitFor(expr, timeout = 15000, interval = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const v = await this.eval(expr); if (v) return v; await new Promise(res => setTimeout(res, interval)); }
    return null;
  }
  async insertText(text) { await this.send('Input.insertText', { text }); }
  async key(key, { code, modifiers = 0, vk } = {}) {   // modifiers: 1=Alt 2=Ctrl 4=Meta 8=Shift
    const base = { key, code: code || ('Key' + key.toUpperCase()), modifiers, windowsVirtualKeyCode: vk || key.toUpperCase().charCodeAt(0) };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  async screenshot() { const r = await this.send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(r.data, 'base64'); }
  drainConsole() { const c = this.console.slice(); this.console.length = 0; return c; }
  drainErrors()  { const e = this.errors.slice();  this.errors.length = 0;  return e; }
}
