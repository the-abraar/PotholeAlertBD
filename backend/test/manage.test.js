'use strict';
// scripts/manage.js against a temp SQLite DB. The CLI runs in a child process (cwd = temp dir, so no backend/.env is loaded);
// the server in this process shares the same DB file to check that issued tokens really authenticate.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pab-cli-'));
process.env.DB_PATH = path.join(tmp, 't.db');
process.env.UPLOAD_DIR = path.join(tmp, 'up');
process.env.ADMIN_TOKEN = 'test-admin-token-1234';

const app = require('../src/app');
const db = require('../src/db');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'manage.js');

function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: tmp, encoding: 'utf8',
    env: { ...process.env, SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', ...env },
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}
const tokenOf = (out) => out.match(/token: ([0-9a-f]{48})$/)[1];

let base;
let server;
before(async () => { await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }); });
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const asAdmin = (t) => fetch(`${base}/api/reports/admin/tokens`, { headers: { 'x-admin-token': t } }).then((r) => r.status);
const asAuthority = (t) => fetch(`${base}/api/authority/reports`, { headers: { 'x-authority-token': t } }).then((r) => r.status);
const actions = () => db.prepare('SELECT action FROM audit_log WHERE actor = ?').all('cli').map((r) => r.action);

test('unknown command prints usage and exits 1', () => {
  const r = cli([]);
  assert.strictEqual(r.code, 1);
  assert.match(r.err, /usage: manage\.js/);
});

test('add-admin: token works, expiry follows TOKEN_TTL_DAYS, expired token is rejected', async () => {
  const t = tokenOf(cli(['add-admin', 'alice'], { TOKEN_TTL_DAYS: '2' }).out);
  assert.strictEqual(await asAdmin(t), 200);
  const { expires_at, token_hash } = db.prepare('SELECT expires_at, token_hash FROM admins WHERE name = ?').get('alice');
  const days = (Date.parse(expires_at) - Date.now()) / 86_400_000;
  assert.ok(days > 1.9 && days <= 2, `expiry ${days} days`);
  assert.notStrictEqual(token_hash, t); // only the hash is stored

  db.prepare('UPDATE admins SET expires_at = ? WHERE name = ?').run(new Date(Date.now() - 1000).toISOString(), 'alice');
  assert.strictEqual(await asAdmin(t), 401);

  cli(['add-admin', 'bob'], { TOKEN_TTL_DAYS: '0' });
  assert.strictEqual(db.prepare('SELECT expires_at FROM admins WHERE name = ?').get('bob').expires_at, null); // 0 = never
  assert.strictEqual(cli(['add-admin', 'carol']).code, 0);
  const d = (Date.parse(db.prepare('SELECT expires_at FROM admins WHERE name = ?').get('carol').expires_at) - Date.now()) / 86_400_000;
  assert.ok(d > 179 && d <= 180, 'default TTL is 180 days');
  cli(['add-admin', 'erin'], { TOKEN_TTL_DAYS: '' });
  assert.ok(db.prepare('SELECT expires_at FROM admins WHERE name = ?').get('erin').expires_at, 'empty TOKEN_TTL_DAYS must not mean never');
  assert.ok(actions().includes('add_admin'));
});

test('rotate-admin kills the old token and renews expiry; disable-admin revokes', async () => {
  const old = tokenOf(cli(['add-admin', 'dave']).out);
  db.prepare('UPDATE admins SET expires_at = ? WHERE name = ?').run(new Date(Date.now() - 1000).toISOString(), 'dave');
  const fresh = tokenOf(cli(['rotate-admin', 'dave'], { TOKEN_TTL_DAYS: '5' }).out);
  assert.notStrictEqual(fresh, old);
  assert.strictEqual(await asAdmin(old), 401);
  assert.strictEqual(await asAdmin(fresh), 200); // expired row is renewed by rotation
  assert.ok(actions().includes('rotate_admin_token'));
  assert.strictEqual(cli(['rotate-admin', 'nobody']).out, 'no such active admin');

  assert.strictEqual(cli(['disable-admin', 'dave']).out, 'disabled');
  assert.strictEqual(await asAdmin(fresh), 401);
  assert.strictEqual(cli(['rotate-admin', 'dave']).out, 'no such active admin');
  assert.strictEqual(cli(['disable-admin', 'nobody']).out, 'no such admin');
});

test('add-authority, list-tokens, rotate-authority, revoke-authority', async () => {
  const old = tokenOf(cli(['add-authority', 'Test City Corp', 'ops@example.test']).out);
  assert.strictEqual(await asAuthority(old), 200);

  const list = JSON.parse(cli(['list-tokens']).out);
  assert.ok(!JSON.stringify(list).includes('token_hash'));
  const row = list.authorities.find((a) => a.name === 'Test City Corp');
  assert.strictEqual(row.email, 'ops@example.test');
  assert.ok(row.expiresAt);
  assert.ok(list.admins.some((a) => a.name === 'alice'));

  const fresh = tokenOf(cli(['rotate-authority', String(row.id)]).out);
  assert.strictEqual(await asAuthority(old), 401);
  assert.strictEqual(await asAuthority(fresh), 200);

  assert.strictEqual(cli(['revoke-authority', String(row.id)]).out, 'revoked');
  assert.strictEqual(await asAuthority(fresh), 401);
  assert.strictEqual(cli(['revoke-authority', String(row.id)]).out, 'no such active authority token');
  assert.strictEqual(cli(['rotate-authority', String(row.id)]).out, 'no such active authority token');
  for (const a of ['add_authority_token', 'rotate_authority_token', 'revoke_authority_token']) assert.ok(actions().includes(a), a);
});

test('digest --dry-run lists open reports per authority email and sends nothing', () => {
  cli(['add-authority', 'Digest Corp', 'digest@example.test']);
  cli(['add-authority', 'No Email Corp']);
  const now = new Date().toISOString();
  const ins = db.prepare(`INSERT INTO reports (id, photo_filename, lat, lng, road_type, severity, authority_name, status, created_at, updated_at)
    VALUES (?, 'p.png', 23.8, 90.4, 'city_road', 'medium', ?, ?, ?, ?)`);
  ins.run('r-open', 'Digest Corp', 'new', now, now);
  ins.run('r-done', 'Digest Corp', 'resolved', now, now);
  ins.run('r-other', 'No Email Corp', 'new', now, now);

  const r = cli(['digest', '--dry-run'], { PUBLIC_URL: 'https://x.test' });
  assert.strictEqual(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.deepStrictEqual(out.map((d) => [d.to, d.authority, d.count]), [['digest@example.test', 'Digest Corp', 1]]);
  assert.match(out[0].text, /1 open reports \(1 new in 24h\)/);
  assert.match(out[0].text, /https:\/\/x\.test\/uploads\/p\.png/);
  assert.ok(!out[0].text.includes('resolved'));

  // without SMTP the real command reports the reason instead of sending
  assert.match(cli(['digest']).out, /SMTP_NOT_CONFIGURED/);
});
