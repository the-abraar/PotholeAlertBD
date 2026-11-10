'use strict';
// Minimal headless-Chrome driver over the DevTools protocol (Node >= 22 global WebSocket), no npm package.
// shoot(url, sessionStorage, out.jpg): screenshot after the page reads its token from sessionStorage.
// CLI: node cdp.js check <file or url>  -> prints console errors, failed requests and non-local requests; exit 1 if any.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function withPage(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-cdp-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!port) throw new Error('Chrome did not start');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map(); const listeners = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else listeners.forEach((l) => l(msg));
    };
    const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    const loaded = () => new Promise((r) => listeners.push((m) => m.method === 'Page.loadEventFired' && r()));
    await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map((m) => send(m)));
    const out = await fn({ send, loaded, on: (l) => listeners.push(l) });
    ws.close();
    return out;
  } finally {
    const exited = new Promise((r) => proc.once('exit', r)); proc.kill(); await exited;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(url, storage, out) {
  await withPage(async ({ send, loaded }) => {
    let l = loaded(); await send('Page.navigate', { url }); await l;
    await send('Runtime.evaluate', { expression: `Object.entries(${JSON.stringify(storage)}).forEach(([k, v]) => sessionStorage.setItem(k, v))` });
    l = loaded(); await send('Page.reload'); await l; await settle(1500);
    const { result } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: false });
    fs.writeFileSync(out, Buffer.from(result.data, 'base64'));
  });
}

async function check(target) {
  const url = /^https?:|^file:/.test(target) ? target : 'file://' + path.resolve(target);
  const problems = [];
  await withPage(async ({ send, loaded, on }) => {
    on((m) => {
      if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception || {}).description);
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) problems.push('console.' + m.params.type + ': ' + m.params.args.map((a) => a.value || a.description).join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('log: ' + m.params.entry.text);
      if (m.method === 'Network.loadingFailed') problems.push('failed request: ' + m.params.errorText);
      if (m.method === 'Network.requestWillBeSent' && !/^(file|data|about|blob):/.test(m.params.request.url)) problems.push('external request: ' + m.params.request.url);
    });
    const l = loaded(); await send('Page.navigate', { url }); await l; await settle(1500);
  });
  return problems;
}

module.exports = { shoot, check, withPage };

if (require.main === module && process.argv[2] === 'check') {
  check(process.argv[3]).then((p) => { console.log(p.length ? p.join('\n') : 'console errors: 0, failed requests: 0, external requests: 0'); process.exit(p.length ? 1 : 0); });
}
