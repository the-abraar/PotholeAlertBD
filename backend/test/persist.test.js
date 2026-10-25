'use strict';
// Rate limits and flag dedupe live in SQLite: a fresh process on the same DB file (a restart, or a second instance) sees them.
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pab-persist-'));
const env = { ...process.env, DB_PATH: path.join(tmp, 't.db'), UPLOAD_DIR: path.join(tmp, 'up') };
// Child = one "server process": applies a limiter (max 2) to IP 1.2.3.4 `n` times, prints the status of the last call,
// then records a flag from 9.9.9.9 on report r1 and prints the distinct-IP count.
const CHILD = `
const { rateLimit } = require('./src/security');
const db = require('./src/db');
const mw = rateLimit({ name: 'persist', windowMs: 3600000, max: 2 });
let status = 200;
mw({ ip: '1.2.3.4' }, { status(c) { status = c; return { json() {} }; } }, () => {});
db.prepare('INSERT OR IGNORE INTO flags (report_id, ip, created_at) VALUES (?, ?, ?)').run('r1', '9.9.9.9', 'now');
console.log(status, db.prepare('SELECT COUNT(*) c FROM flags WHERE report_id = ?').get('r1').c);
`;
const run = () => spawnSync(process.execPath, ['-e', CHILD], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });

test('rate-limit counters and flag dedupe survive a process restart', () => {
  const out = [run(), run(), run()].map((r) => { assert.strictEqual(r.status, 0, r.stderr); return r.stdout.trim(); });
  assert.deepStrictEqual(out, ['200 1', '200 1', '429 1']); // 3rd process is over the limit; same IP flag never counts twice
  fs.rmSync(tmp, { recursive: true, force: true });
});
