'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pab-'));
process.env.DB_PATH = path.join(tmp, 't.db');
process.env.UPLOAD_DIR = path.join(tmp, 'up');
process.env.ADMIN_TOKEN = 'test-admin-token-1234';
process.env.TRUST_PROXY = '1'; // tests fake client IPs via X-Forwarded-For
process.env.REPORT_LIMIT_PER_HOUR = '1000';

const app = require('../src/app');
const { resolveJurisdiction } = require('../src/jurisdictions');
const { assertProductionConfig } = require('../src/security');
const sharp = require('sharp');
let server, base, PNG;
before(async () => { PNG = await sharp({ create: { width: 4, height: 2, channels: 3, background: '#888' } }).png().toBuffer(); await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }); });
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

function form(over = {}, photo = PNG) {
  const f = new FormData();
  const v = { lat: '23.8', lng: '90.4', roadType: 'city_road', contactName: 'Rahim', contactPhone: '01700000000', ...over };
  for (const [k, x] of Object.entries(v)) if (x !== null) f.append(k, x);
  if (photo) f.append('photo', new Blob([photo], { type: 'image/png' }), 'a.png');
  return f;
}
const post = (f) => fetch(`${base}/api/reports`, { method: 'POST', body: f });

test('validation rejects bad input', async () => {
  assert.strictEqual((await post(form({}, null))).status, 400);                       // no photo
  assert.strictEqual((await post(form({}, Buffer.from('<?php echo 1; ?>......')))).status, 400); // not an image
  assert.strictEqual((await post(form({ lat: '51.5', lng: '-0.1' }))).status, 400);   // outside BD
  assert.strictEqual((await post(form({ lat: 'abc' }))).status, 400);
  assert.strictEqual((await post(form({ roadType: 'nope' }))).status, 400);
  assert.strictEqual((await post(form({ description: 'x'.repeat(1001) }))).status, 400);
});

test('valid report: random server filename, contact never leaks publicly', async () => {
  const res = await post(form());
  assert.strictEqual(res.status, 201);
  const r = await res.json();
  assert.match(r.photoUrl, /^\/uploads\/[0-9a-f-]{36}\.png$/);
  assert.ok(!('contactPhone' in r) && !('contactName' in r));
  const list = JSON.stringify(await (await fetch(`${base}/api/reports`)).json());
  const one = JSON.stringify(await (await fetch(`${base}/api/reports/${r.id}`)).json());
  for (const t of [list, one]) assert.ok(!t.includes('01700000000') && !t.includes('Rahim'));
  assert.match(res.headers.get('x-content-type-options') || '', /nosniff/);
});

test('admin endpoint requires token and returns contact', async () => {
  const url = `${base}/api/reports/admin/all`;
  assert.strictEqual((await fetch(url)).status, 401);
  assert.strictEqual((await fetch(url, { headers: { 'x-admin-token': 'wrong' } })).status, 401);
  assert.strictEqual((await fetch(`${url}?token=${process.env.ADMIN_TOKEN}`)).status, 401); // no token in URL
  const ok = await fetch(url, { headers: { 'x-admin-token': process.env.ADMIN_TOKEN } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await ok.json())[0].contactPhone, '01700000000');
});

test('jurisdiction stub resolves placeholder polygons', () => {
  assert.strictEqual(resolveJurisdiction(23.80, 90.40).key, 'dncc');
  assert.strictEqual(resolveJurisdiction(22.33, 91.80).key, 'ccc');
  assert.strictEqual(resolveJurisdiction(24.9, 91.87), null);
});

test('production refuses default/missing ADMIN_TOKEN', () => {
  const env = { ...process.env };
  process.env.NODE_ENV = 'production';
  for (const t of [undefined, 'change-me-to-a-long-random-string', 'short']) {
    if (t === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = t;
    assert.throws(assertProductionConfig);
  }
  process.env.ADMIN_TOKEN = 'a-long-random-token-xyz';
  assert.doesNotThrow(assertProductionConfig);
  Object.assign(process.env, env); delete process.env.NODE_ENV;
});

test('EXIF stripped, orientation applied', async () => {
  const jpg = await sharp({ create: { width: 4, height: 2, channels: 3, background: '#888' } })
    .jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'secret-gps-owner' } } }).toBuffer();
  assert.ok((await sharp(jpg).metadata()).exif);
  const r = await (await post(form({ lat: '23.9', lng: '90.5' }, jpg))).json();
  const out = fs.readFileSync(path.join(process.env.UPLOAD_DIR, path.basename(r.photoUrl)));
  const m = await sharp(out).metadata();
  assert.ok(!m.exif && !out.includes('secret-gps-owner'));
  assert.ok(!m.orientation || m.orientation === 1);
  assert.deepStrictEqual([m.width, m.height], [2, 4]); // rotated upright
});

test('CORS: no header by default, allow-list honoured', async () => {
  const h = { origin: 'https://ok.example' };
  assert.strictEqual((await fetch(`${base}/api/health`, { headers: h })).headers.get('access-control-allow-origin'), null);
  const prev = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = 'https://ok.example';
  delete require.cache[require.resolve('../src/app')];
  const s2 = require('../src/app').listen(0);
  try {
    const u = `http://127.0.0.1:${s2.address().port}/api/health`;
    assert.strictEqual((await fetch(u, { headers: h })).headers.get('access-control-allow-origin'), 'https://ok.example');
    assert.strictEqual((await fetch(u, { headers: { origin: 'https://evil.example' } })).headers.get('access-control-allow-origin'), null);
  } finally { s2.close(); if (prev === undefined) delete process.env.CORS_ORIGINS; else process.env.CORS_ORIGINS = prev; }
});

test('pagination: default 50, max 200, offset, total header', async () => {
  const db = require('../src/db');
  const ins = db.prepare(`INSERT INTO reports (id,photo_filename,lat,lng,road_type,severity,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < 210; i++) ins.run(`p${i}`, 'x.png', 22, 89, 'city_road', 'low', 'new', new Date(Date.now() - 5e8 + i).toISOString(), 'x');
  const get = async (q, admin) => fetch(`${base}/api/reports${admin ? '/admin/all' : ''}?${q}`, { headers: { 'x-admin-token': process.env.ADMIN_TOKEN } });
  for (const admin of [false, true]) {
    const a = await get('', admin);
    assert.strictEqual((await a.json()).length, 50);
    assert.ok(Number(a.headers.get('x-total-count')) >= 210);
    assert.strictEqual((await (await get('limit=9999', admin)).json()).length, 200);
    const o = await (await get('limit=2&offset=1', admin)).json();
    const all = await (await get('limit=3', admin)).json();
    assert.deepStrictEqual(o.map((x) => x.id), all.slice(1).map((x) => x.id));
  }
});

test('duplicate within 30 m / same road type / 24 h is merged', async () => {
  const first = await (await post(form({ lat: '23.7000', lng: '90.3000' }))).json();
  const near = await post(form({ lat: '23.70010', lng: '90.30010' }));   // ~15 m
  assert.strictEqual(near.status, 200);
  const d = await near.json();
  assert.strictEqual(d.duplicate, true);
  assert.strictEqual(d.id, first.id);
  assert.strictEqual((await post(form({ lat: '23.7005', lng: '90.3000' }))).status, 201);               // ~55 m
  assert.strictEqual((await post(form({ lat: '23.7000', lng: '90.3000', roadType: 'national_highway' }))).status, 201); // other road type
  const db = require('../src/db');
  db.prepare('UPDATE reports SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 25 * 3600_000).toISOString(), first.id);
  assert.strictEqual((await post(form({ lat: '23.7000', lng: '90.3000' }))).status, 201);               // older than 24 h
});

const fwd = (ip) => ({ 'x-forwarded-for': ip });
const adm = { 'x-admin-token': process.env.ADMIN_TOKEN };

test('flag: counts distinct IPs, auto-hides at threshold, admin unhide/delete', async () => {
  const r = await (await post(form({ lat: '24.1', lng: '90.1' }))).json();
  const flag = (ip) => fetch(`${base}/api/reports/${r.id}/flag`, { method: 'POST', headers: fwd(ip) });
  let j = await (await flag('9.9.9.1')).json();
  assert.deepStrictEqual(j, { flags: 1, hidden: false });
  j = await (await flag('9.9.9.1')).json();                       // same IP does not count twice
  assert.strictEqual(j.flags, 1);
  assert.strictEqual((await (await fetch(`${base}/api/reports/${r.id}`)).json()).status, 'flagged');
  await flag('9.9.9.2');
  j = await (await flag('9.9.9.3')).json();
  assert.deepStrictEqual(j, { flags: 3, hidden: true });
  assert.strictEqual((await fetch(`${base}/api/reports/${r.id}`)).status, 404);
  assert.ok(!(await (await fetch(`${base}/api/reports?limit=200`)).json()).some((x) => x.id === r.id));
  // hidden reports do not absorb new duplicates
  assert.strictEqual((await post(form({ lat: '24.1', lng: '90.1' }))).status, 201);
  // admin endpoints need a token
  assert.strictEqual((await fetch(`${base}/api/reports/${r.id}/unhide`, { method: 'POST' })).status, 401);
  assert.strictEqual((await fetch(`${base}/api/reports/${r.id}`, { method: 'DELETE' })).status, 401);
  const u = await (await fetch(`${base}/api/reports/${r.id}/unhide`, { method: 'POST', headers: adm })).json();
  assert.match(u.status, /^(new|queued_for_authority)$/); // restores pre-flag status (async forward may have queued it)
  assert.strictEqual((await fetch(`${base}/api/reports/${r.id}`)).status, 200);
  const file = path.join(process.env.UPLOAD_DIR, path.basename(r.photoUrl));
  assert.ok(fs.existsSync(file));
  assert.strictEqual((await fetch(`${base}/api/reports/${r.id}`, { method: 'DELETE', headers: adm })).status, 204);
  assert.strictEqual((await fetch(`${base}/api/reports/${r.id}`)).status, 404);
  assert.ok(!fs.existsSync(file));
  assert.strictEqual((await fetch(`${base}/api/reports/nope/flag`, { method: 'POST', headers: fwd('9.9.9.4') })).status, 404);
});

test('per-IP submission limit is separate from the global limit', async () => {
  process.env.REPORT_LIMIT_PER_HOUR = '2';
  delete require.cache[require.resolve('../src/app')];
  const s2 = require('../src/app').listen(0);
  process.env.REPORT_LIMIT_PER_HOUR = '1000';
  try {
    const u = `http://127.0.0.1:${s2.address().port}/api/reports`;
    const go = (ip) => fetch(u, { method: 'POST', body: new FormData(), headers: fwd(ip) }).then((r) => r.status);
    assert.deepStrictEqual([await go('8.8.8.1'), await go('8.8.8.1'), await go('8.8.8.1')], [400, 400, 429]);
    assert.strictEqual(await go('8.8.8.2'), 400);                    // other IP unaffected
    assert.strictEqual((await fetch(`http://127.0.0.1:${s2.address().port}/api/health`, { headers: fwd('8.8.8.1') })).status, 200);
  } finally { s2.close(); }
});

test('privacy page is served', async () => {
  const r = await fetch(`${base}/privacy`);
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Privacy/);
});

test('flags never override admin-set statuses; unhide restores prior status', async () => {
  const flag = (id, ip) => fetch(`${base}/api/reports/${id}/flag`, { method: 'POST', headers: fwd(ip) }).then((r) => r.json());
  const setS = (id, status) => fetch(`${base}/api/reports/${id}/status`, { method: 'PATCH', headers: { ...adm, 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
  const get = async (id) => (await fetch(`${base}/api/reports/${id}`)).json();
  const a = await (await post(form({ lat: '24.2', lng: '90.2' }))).json();
  await setS(a.id, 'resolved');
  for (const ip of ['7.7.7.1', '7.7.7.2', '7.7.7.3']) assert.strictEqual((await flag(a.id, ip)).hidden, false);
  assert.strictEqual((await get(a.id)).status, 'resolved');
  const b = await (await post(form({ lat: '24.3', lng: '90.3' }))).json();
  await setS(b.id, 'queued_for_authority');
  await flag(b.id, '7.7.7.1'); await flag(b.id, '7.7.7.2'); await flag(b.id, '7.7.7.3');
  assert.strictEqual((await fetch(`${base}/api/reports/${b.id}`)).status, 404);
  const u = await (await fetch(`${base}/api/reports/${b.id}/unhide`, { method: 'POST', headers: adm })).json();
  assert.strictEqual(u.status, 'queued_for_authority');
});

test('ipKey: IPv6 /64 collapse, IPv4 as-is; TRUST_PROXY validation', () => {
  const { ipKey, parseTrustProxy } = require('../src/security');
  assert.strictEqual(ipKey('2001:db8:1:2:aaaa::1'), ipKey('2001:db8:1:2:bbbb:cccc:dddd:eeee'));
  assert.notStrictEqual(ipKey('2001:db8:1:2::1'), ipKey('2001:db8:1:3::1'));
  assert.strictEqual(ipKey('::ffff:1.2.3.4'), '1.2.3.4');
  assert.strictEqual(ipKey('1.2.3.4'), '1.2.3.4');
  assert.strictEqual(parseTrustProxy('2'), 2);
  assert.strictEqual(parseTrustProxy('loopback'), 'loopback');
  assert.strictEqual(parseTrustProxy(''), undefined);
  for (const bad of ['true', '-1', '99', '1.5', '10.0.0.0/8', 'abc']) assert.throws(() => parseTrustProxy(bad), bad);
});

test('flag dedupe and rate limit use the IPv6 /64', async () => {
  const r = await (await post(form({ lat: '24.4', lng: '90.4' }))).json();
  const flag = (ip) => fetch(`${base}/api/reports/${r.id}/flag`, { method: 'POST', headers: fwd(ip) }).then((x) => x.json());
  await flag('2001:db8:9:9::1');
  assert.strictEqual((await flag('2001:db8:9:9:ffff::2')).flags, 1);
});

test('huge-dimension image is rejected with 413', async () => {
  const b = Buffer.from(PNG);
  b.writeUInt32BE(20000, 16); b.writeUInt32BE(20000, 20);
  b.writeUInt32BE(require('zlib').crc32(b.subarray(12, 29)), 29);
  assert.strictEqual((await post(form({ lat: '24.5', lng: '90.5' }, b))).status, 413);
});

test('repeated failed admin auth is blocked with 429 on every admin route', async () => {
  const h = fwd('6.6.6.6');
  const urls = [['GET', '/admin/all'], ['POST', '/x/unhide'], ['DELETE', '/x'], ['PATCH', '/x/status']];
  for (let i = 0; i < 10; i++) {
    const [m, p] = urls[i % 4];
    assert.strictEqual((await fetch(`${base}/api/reports${p}`, { method: m, headers: { ...h, 'x-admin-token': 'bad' } })).status, 401);
  }
  for (const [m, p] of urls) {
    assert.strictEqual((await fetch(`${base}/api/reports${p}`, { method: m, headers: { ...h, ...adm } })).status, 429);
  }
  assert.strictEqual((await fetch(`${base}/api/reports/admin/all`, { headers: { ...fwd('6.6.6.7'), ...adm } })).status, 200);
});

test('per-admin token works, is audited, and stops working when disabled', async () => {
  const db = require('../src/db');
  const { sha256 } = require('../src/security');
  db.prepare('INSERT INTO admins (name, token_hash, created_at) VALUES (?, ?, ?)').run('alice', sha256('alice-token'), 'now');
  const h = { ...fwd('5.5.5.1'), 'x-admin-token': 'alice-token' };
  const r = await (await post(form({ lat: '23.9', lng: '90.5' }))).json();
  const res = await fetch(`${base}/api/reports/${r.id}/status`, { method: 'PATCH', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) });
  assert.strictEqual(res.status, 200);
  const log = await (await fetch(`${base}/api/reports/admin/audit`, { headers: { ...adm } })).json();
  assert.ok(log.some((e) => e.actor === 'alice' && e.action === 'set_status' && e.report_id === r.id));
  db.prepare('UPDATE admins SET disabled = 1 WHERE name = ?').run('alice');
  assert.strictEqual((await fetch(`${base}/api/reports/admin/all`, { headers: h })).status, 401);
});

test('rate-limit counters are persisted in SQLite', () => {
  const db = require('../src/db');
  assert.ok(db.prepare("SELECT COUNT(*) c FROM rate_hits WHERE key LIKE 'submit:%'").get().c > 0);
});

test('authority inbox: scoped to its own reports, no contacts, resolve needs after photo', async () => {
  const db = require('../src/db');
  const { sha256 } = require('../src/security');
  const mine = await (await post(form({ lat: '23.8', lng: '90.4', roadType: 'rural_road' }))).json();
  const other = await (await post(form({ lat: '24.8', lng: '91.8', roadType: 'national_highway' }))).json();
  db.prepare('INSERT INTO authority_tokens (token_hash, authority_name, email, created_at) VALUES (?, ?, ?, ?)')
    .run(sha256('lged-token'), mine.authorityName, 'lged@example.test', 'now');
  const h = { ...fwd('5.5.5.2'), 'x-authority-token': 'lged-token' };
  assert.strictEqual((await fetch(`${base}/api/authority/reports`)).status, 401);
  const list = await (await fetch(`${base}/api/authority/reports`, { headers: h })).json();
  assert.ok(list.some((r) => r.id === mine.id) && !list.some((r) => r.id === other.id));
  assert.ok(!JSON.stringify(list).includes('01700000000'));
  const patch = (id, fields, photo) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); if (photo) f.append('photo', new Blob([photo], { type: 'image/png' }), 'a.png'); return fetch(`${base}/api/authority/reports/${id}`, { method: 'PATCH', headers: h, body: f }); };
  assert.strictEqual((await patch(other.id, { status: 'in_progress' })).status, 404);      // not theirs
  assert.strictEqual((await patch(mine.id, { status: 'hidden' })).status, 400);           // not an allowed status
  assert.strictEqual((await patch(mine.id, { status: 'resolved' })).status, 400);         // needs after photo
  assert.strictEqual((await patch(mine.id, { status: 'in_progress' })).status, 200);
  const done = await patch(mine.id, { status: 'resolved' }, PNG);
  assert.strictEqual(done.status, 200);
  const j = await done.json();
  assert.strictEqual(j.status, 'resolved');
  assert.match(j.afterPhotoUrl, /^\/uploads\/[0-9a-f-]{36}\.png$/);
});

test('authority inbox: 409 and no orphan photo when the report changes during the upload', async (t) => {
  const db = require('../src/db');
  const photos = require('../src/photos');
  const r = await (await post(form({ lat: '23.81', lng: '90.41', roadType: 'rural_road' }))).json();
  const real = photos.savePhoto;
  let saved;
  t.mock.method(photos, 'savePhoto', async (buf) => {
    saved = await real(buf);
    db.prepare("UPDATE reports SET status = 'hidden' WHERE id = ?").run(r.id); // admin hides it mid-upload
    return saved;
  });
  const f = new FormData(); f.append('status', 'resolved'); f.append('photo', new Blob([PNG], { type: 'image/png' }), 'a.png');
  const res = await fetch(`${base}/api/authority/reports/${r.id}`, { method: 'PATCH', headers: { ...fwd('5.5.5.3'), 'x-authority-token': 'lged-token' }, body: f });
  assert.strictEqual(res.status, 409);
  const row = db.prepare('SELECT status, after_photo_filename FROM reports WHERE id = ?').get(r.id);
  assert.strictEqual(row.status, 'hidden');
  assert.strictEqual(row.after_photo_filename, null);
  assert.ok(!fs.existsSync(path.join(photos.UPLOAD_DIR, saved.filename)));
});

test('digest lists open reports per authority with an email', () => {
  const { buildDigests } = require('../src/digest');
  const d = buildDigests();
  assert.ok(d.length >= 1 && d[0].to === 'lged@example.test' && /open reports/.test(d[0].text));
});

test('retention erases old contact details only', () => {
  const db = require('../src/db');
  const { purgeContacts } = require('../src/retention');
  db.prepare("UPDATE reports SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = (SELECT id FROM reports WHERE contact_phone IS NOT NULL LIMIT 1)").run();
  assert.strictEqual(purgeContacts(90), 1);
  assert.ok(db.prepare('SELECT COUNT(*) c FROM reports WHERE contact_phone IS NOT NULL').get().c > 0); // recent ones kept
  assert.strictEqual(purgeContacts(90), 0);
});

test('token rotation, revoke, expiry and listing are audited; hashes never listed', async () => {
  const db = require('../src/db');
  const { sha256 } = require('../src/security');
  db.prepare('INSERT INTO admins (name, token_hash, created_at) VALUES (?, ?, ?)').run('bob', sha256('bob-old'), 'now');
  db.prepare('INSERT INTO authority_tokens (token_hash, authority_name, email, created_at) VALUES (?, ?, ?, ?)').run(sha256('auth-old'), 'X Auth', null, 'now');
  const j = { ...adm, 'content-type': 'application/json' };
  const list = await (await fetch(`${base}/api/reports/admin/tokens`, { headers: adm })).json();
  assert.ok(list.admins.some((a) => a.name === 'bob') && !JSON.stringify(list).includes(sha256('bob-old')));
  const aid = list.authorities.find((a) => a.name === 'X Auth').id;
  const rot = await (await fetch(`${base}/api/reports/admin/tokens/admin/bob/rotate`, { method: 'POST', headers: j })).json();
  assert.match(rot.token, /^[0-9a-f]{48}$/);
  const get = (t) => fetch(`${base}/api/reports/admin/all`, { headers: { ...fwd('5.5.5.9'), 'x-admin-token': t } });
  assert.strictEqual((await get('bob-old')).status, 401);
  assert.strictEqual((await get(rot.token)).status, 200);
  db.prepare("UPDATE admins SET expires_at = '2000-01-01T00:00:00.000Z' WHERE name = 'bob'").run();
  assert.strictEqual((await get(rot.token)).status, 401);                       // expired
  const ar = await fetch(`${base}/api/reports/admin/tokens/authority/${aid}/revoke`, { method: 'POST', headers: j });
  assert.strictEqual(ar.status, 200);
  const au = (t) => fetch(`${base}/api/authority/reports`, { headers: { ...fwd('5.5.5.8'), 'x-authority-token': t } });
  assert.strictEqual((await au('auth-old')).status, 401);
  assert.strictEqual((await fetch(`${base}/api/reports/admin/tokens/authority/${aid}/rotate`, { method: 'POST', headers: j })).status, 404); // revoked
  assert.strictEqual((await fetch(`${base}/api/reports/admin/tokens/bogus/x/rotate`, { method: 'POST', headers: j })).status, 400);
  const log = await (await fetch(`${base}/api/reports/admin/audit`, { headers: adm })).json();
  for (const a of ['rotate_admin_token', 'revoke_authority_token']) assert.ok(log.some((e) => e.action === a && e.actor === 'root'));
});

test('reporter erases own contact with the deletion code', async () => {
  const db = require('../src/db');
  const r = await (await post(form({ lat: '23.7', lng: '90.35', contactName: 'Karim', contactPhone: '01711111111' }))).json();
  assert.match(r.deletionCode, /^[0-9a-f]{48}$/);
  assert.ok(!JSON.stringify(await (await fetch(`${base}/api/reports/${r.id}`)).json()).includes(r.deletionCode));
  const erase = (code) => fetch(`${base}/api/reports/${r.id}/erase-contact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  assert.strictEqual((await erase('wrong')).status, 403);
  assert.strictEqual(db.prepare('SELECT contact_phone p FROM reports WHERE id = ?').get(r.id).p, '01711111111');
  assert.strictEqual((await erase(r.deletionCode)).status, 200);
  const row = db.prepare('SELECT contact_name n, contact_phone p FROM reports WHERE id = ?').get(r.id);
  assert.ok(row.n === null && row.p === null);
});

test('DISABLE_ROOT_TOKEN rejects the shared token, per-admin tokens still work, audit filters by actor', async () => {
  const db = require('../src/db');
  const { sha256, requireAdmin } = require('../src/security');
  db.prepare('INSERT OR REPLACE INTO admins (name, token_hash, created_at) VALUES (?, ?, ?)').run('bob', sha256('bob-token'), 'now');
  const get = (t, q = '') => fetch(`${base}/api/reports/admin/audit${q}`, { headers: { ...fwd('4.4.4.4'), 'x-admin-token': t } });
  process.env.DISABLE_ROOT_TOKEN = '1';
  try {
    assert.strictEqual((await get('test-admin-token-1234')).status, 401);
    const ok = await get('bob-token', '?actor=alice');
    assert.strictEqual(ok.status, 200);
    assert.ok((await ok.json()).every((e) => e.actor === 'alice'));
    // production check: needs an enabled admin, not ADMIN_TOKEN
    process.env.NODE_ENV = 'production'; delete process.env.ADMIN_TOKEN;
    assert.doesNotThrow(assertProductionConfig);
    db.prepare('UPDATE admins SET disabled = 1').run();
    assert.throws(assertProductionConfig, /no enabled admin/);
  } finally {
    delete process.env.DISABLE_ROOT_TOKEN; delete process.env.NODE_ENV; process.env.ADMIN_TOKEN = 'test-admin-token-1234';
    db.prepare('UPDATE admins SET disabled = 0').run();
  }
  assert.strictEqual((await get('test-admin-token-1234')).status, 200);
});

test('retention period is configurable and bad values fall back to 90 days', () => {
  const db = require('../src/db');
  const { purgeContacts, retentionDays } = require('../src/retention');
  for (const [v, d] of [['30', 30], ['0.5', 0.5], ['', 90], ['abc', 90], ['0', 90], ['-5', 90], [undefined, 90]]) assert.strictEqual(retentionDays(v), d, String(v));
  // a 10-day-old report: kept at 90 days, erased (name and phone, not the report) at 7
  db.prepare("UPDATE reports SET contact_name = 'Old', contact_phone = '01711111111', created_at = ? WHERE id = (SELECT id FROM reports ORDER BY id LIMIT 1)")
    .run(new Date(Date.now() - 10 * 86_400_000).toISOString());
  const id = db.prepare("SELECT id FROM reports WHERE contact_phone = '01711111111'").get().id;
  process.env.CONTACT_RETENTION_DAYS = '90';
  assert.strictEqual(purgeContacts(), 0);
  process.env.CONTACT_RETENTION_DAYS = '7';
  try { assert.ok(purgeContacts() >= 1); } finally { delete process.env.CONTACT_RETENTION_DAYS; }
  const row = db.prepare('SELECT contact_name, contact_phone FROM reports WHERE id = ?').get(id);
  assert.deepStrictEqual({ ...row }, { contact_name: null, contact_phone: null });
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'purge_contacts' AND actor = 'system'").get());
});

test('blurRegions: padded box becomes one flat colour, the rest is untouched', async () => {
  const { blurRegions } = require('../src/photos');
  const raw = Buffer.alloc(40 * 40 * 3); for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251; // noisy image
  const img = await sharp(raw, { raw: { width: 40, height: 40, channels: 3 } }).png().toBuffer();
  const out = await blurRegions(img, [{ x: 10, y: 10, w: 10, h: 10 }]);
  const box = await sharp(await sharp(out).extract({ left: 8, top: 8, width: 14, height: 14 }).toBuffer()).stats(); // +20% padding each side
  assert.ok(box.channels.slice(0, 3).every((c) => c.stdev === 0));
  const px = async (b, l, t) => (await sharp(b).extract({ left: l, top: t, width: 1, height: 1 }).removeAlpha().raw().toBuffer()).toString('hex');
  assert.strictEqual(await px(out, 30, 30), await px(img, 30, 30));
  await assert.rejects(blurRegions(img, [{ x: NaN, y: 0, w: 5, h: 5 }])); // bad box fails closed, never skipped
  await assert.rejects(blurRegions(img, [{ x: 100, y: 100, w: 5, h: 5 }])); // box outside the image too
});

test('detector: boxes are blurred before the file is written; failure keeps the report private', async (t) => {
  const db = require('../src/db');
  const photos = require('../src/photos');
  t.after(() => { photos.detector = null; });
  const raw = Buffer.alloc(40 * 40 * 3); for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
  const img = await sharp(raw, { raw: { width: 40, height: 40, channels: 3 } }).png().toBuffer();

  photos.detector = async () => [{ x: 10, y: 10, w: 10, h: 10 }];
  const ok = await (await post(form({ lat: '23.71', lng: '90.31' }, img))).json();
  assert.strictEqual(ok.status, 'new');
  const stored = fs.readFileSync(path.join(photos.UPLOAD_DIR, path.basename(ok.photoUrl)));
  assert.ok((await sharp(await sharp(stored).extract({ left: 8, top: 8, width: 14, height: 14 }).toBuffer()).stats()).channels.slice(0, 3).every((c) => c.stdev === 0));

  photos.detector = async () => { throw new Error('model crashed'); };
  const held = await (await post(form({ lat: '23.72', lng: '90.32' }, img))).json();
  assert.strictEqual(held.status, 'hidden');
  assert.strictEqual((await fetch(`${base}/api/reports/${held.id}`)).status, 404);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'photo_held' AND report_id = ?").get(held.id));
  const un = await (await fetch(`${base}/api/reports/${held.id}/unhide`, { method: 'POST', headers: adm })).json();
  assert.strictEqual(un.status, 'new'); // admin approval publishes it
});

test('authority after photo: detector failure is 503 and stores nothing', async (t) => {
  const photos = require('../src/photos');
  const mine = await (await post(form({ lat: '23.8', lng: '90.4', roadType: 'rural_road' }))).json(); // merges into the authority test's report
  t.after(() => { photos.detector = null; });
  photos.detector = async () => { throw new Error('model crashed'); };
  const before = fs.readdirSync(photos.UPLOAD_DIR).length;
  const f = new FormData(); f.append('status', 'resolved'); f.append('photo', new Blob([PNG], { type: 'image/png' }), 'a.png');
  const res = await fetch(`${base}/api/authority/reports/${mine.id}`, { method: 'PATCH', headers: { ...fwd('5.5.5.5'), 'x-authority-token': 'lged-token' }, body: f });
  assert.strictEqual(res.status, 503);
  assert.strictEqual(fs.readdirSync(photos.UPLOAD_DIR).length, before);
});

test('PHOTO_REVIEW=1 holds every new report until an admin approves it', async (t) => {
  process.env.PHOTO_REVIEW = '1';
  t.after(() => { delete process.env.PHOTO_REVIEW; });
  const r = await (await post(form({ lat: '23.73', lng: '90.33' }))).json();
  assert.strictEqual(r.status, 'hidden');
  assert.strictEqual((await fetch(`${base}/api/reports/${r.id}`)).status, 404);
});
