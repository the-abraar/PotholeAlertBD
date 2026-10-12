'use strict';

const crypto = require('crypto');
const db = require('./db');

// shortcut: limits live in the SQLite file, so instances need a shared DB; move to redis if you outgrow one box.
// IPv4 as-is; IPv6 (and v4-mapped) collapsed to its /64 so rotating within a prefix can't evade limits.
function ipKey(ip) {
  ip = String(ip || '').split('%')[0].toLowerCase();
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return m[1];
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return groups.slice(0, 4).map((g) => parseInt(g || '0', 16).toString(16)).join(':') + '::/64';
}

// TRUST_PROXY: hop count 0-10 or loopback|linklocal|uniquelocal. Returns the value for app.set, or undefined if unset.
function parseTrustProxy(v = process.env.TRUST_PROXY) {
  if (v === undefined || v === '') return undefined;
  if (/^\d{1,2}$/.test(v) && Number(v) <= 10) return Number(v);
  if (['loopback', 'linklocal', 'uniquelocal'].includes(v)) return v;
  throw new Error('TRUST_PROXY must be an integer 0-10 or one of loopback|linklocal|uniquelocal');
}

// Fixed-window counter per key, stored in SQLite so limits survive restarts and are shared by instances on one DB.
const hitStmt = db.prepare(`INSERT INTO rate_hits (key, n, reset_at) VALUES (?, 1, ?)
  ON CONFLICT(key) DO UPDATE SET n = CASE WHEN reset_at <= ? THEN 1 ELSE n + 1 END,
    reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END RETURNING n`);
const peekStmt = db.prepare('SELECT n FROM rate_hits WHERE key = ? AND reset_at > ?');
function hit(key, windowMs) {
  const now = Date.now();
  return hitStmt.get(key, now + windowMs, now, now, now + windowMs).n;
}
setInterval(() => db.prepare('DELETE FROM rate_hits WHERE reset_at <= ?').run(Date.now()), 60_000).unref();

// `name` namespaces the counter so two limiters never share a bucket.
function rateLimit({ name, windowMs, max }) {
  return (req, res, next) => {
    if (hit(`${name}:${ipKey(req.ip)}`, windowMs) > max) return res.status(429).json({ error: 'too many requests' });
    next();
  };
}

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin', // app/web clients load /uploads
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  });
  next();
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

function audit(actor, action, reportId, detail) {
  db.prepare('INSERT INTO audit_log (at, actor, action, report_id, detail) VALUES (?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), actor, action, reportId || null, detail ? JSON.stringify(detail) : null);
}

// Token guard: 30 req/min per IP, plus 10 failed auths / 15 min per IP. resolve(token) returns an identity or null.
const FAIL_MAX = 10, FAIL_WINDOW = 15 * 60_000;
function tokenGuard(name, header, prop, resolve) {
  const limit = rateLimit({ name, windowMs: 60_000, max: 30 });
  return (req, res, next) => limit(req, res, () => {
    const failKey = `${name}-fail:${ipKey(req.ip)}`;
    if ((peekStmt.get(failKey, Date.now())?.n || 0) >= FAIL_MAX) return res.status(429).json({ error: 'too many failed attempts' });
    const token = req.header(header);
    const who = token ? resolve(token) : null;
    if (!who) { hit(failKey, FAIL_WINDOW); return res.status(401).json({ error: 'unauthorized' }); }
    req[prop] = who;
    next();
  });
}

// Admin: the shared ADMIN_TOKEN acts as 'root'; per-admin tokens (hashed in `admins`) act as their name.
const requireAdmin = tokenGuard('admin', 'x-admin-token', 'actor', (token) => {
  const root = process.env.ADMIN_TOKEN;
  if (root && safeEqual(token, root)) return 'root';
  return db.prepare('SELECT name FROM admins WHERE token_hash = ? AND disabled = 0').get(sha256(token))?.name || null;
});

// Authority: token scoped to one authority name; req.authority = { name, email }.
const requireAuthority = tokenGuard('authority', 'x-authority-token', 'authority', (token) => {
  const r = db.prepare('SELECT authority_name, email FROM authority_tokens WHERE token_hash = ?').get(sha256(token));
  return r ? { name: r.authority_name, email: r.email } : null;
});

const BAD_TOKENS = ['', 'changeme', 'admin', 'password', 'secret', 'test'];
function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const t = process.env.ADMIN_TOKEN;
  if (!t || t.length < 16 || BAD_TOKENS.includes(t.toLowerCase()) || /^change-?me/i.test(t)) {
    throw new Error('ADMIN_TOKEN must be set to a random value (>=16 chars) in production');
  }
}

module.exports = { sha256, audit, requireAuthority, ipKey, parseTrustProxy, rateLimit, securityHeaders, requireAdmin, safeEqual, assertProductionConfig };
